-- SUN MEDIA — Smm Api profile cards: "Instagram API with Instagram Login" (Business Login for Instagram), additive.
-- Separate from the Facebook Login integration (meta_connections / meta_assets): its own connections, its own tokens.
--   * neosmm_ig_connections: one per profile card, keyed by the professional account id the API returns (user_id).
--     Disconnecting keeps the row (and every order / observation) but drops the token and stops reading.
--   * Tokens only in Supabase Vault (private.neosmm_ig_tokens points to the secret); read by the server alone.
--   * neosmm_ig_oauth_states: one-time, short-lived, bound to the signed-in owner and the card (hash only).
--   * The worker call condition now also fires when a connected profile is due for its hourly reading.

create table public.neosmm_ig_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.neosmm_profiles (id) on delete cascade,
  ig_user_id text not null unique check (ig_user_id ~ '^[0-9]{1,40}$'),
  app_scoped_id text check (app_scoped_id ~ '^[0-9]{1,40}$'),
  username text check (char_length(username) <= 64),
  account_type text check (char_length(account_type) <= 40),
  permissions text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'reauth', 'error', 'disconnected')),
  token_obtained_at timestamptz,
  token_refreshed_at timestamptz,
  token_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  last_error_at timestamptz,
  failures integer not null default 0 check (failures >= 0),
  next_sync_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  updated_at timestamptz not null default now()
);

create index neosmm_ig_connections_due_idx on public.neosmm_ig_connections (next_sync_at) where status in ('connected', 'error');

create trigger neosmm_ig_connections_updated_at
  before update on public.neosmm_ig_connections
  for each row execute function private.set_updated_at();

create table public.neosmm_ig_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  profile_id uuid not null references public.neosmm_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table private.neosmm_ig_tokens (
  connection_id uuid primary key references public.neosmm_ig_connections (id) on delete cascade,
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- Tokens (service role only)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.neosmm_ig_token_save(p_connection uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'empty token' using errcode = '22023';
  end if;
  select vault_secret_id into v_secret from private.neosmm_ig_tokens where connection_id = p_connection;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'neosmm_ig_' || p_connection::text, 'Instagram Login token (Smm Api profile card)');
    insert into private.neosmm_ig_tokens (connection_id, vault_secret_id) values (p_connection, v_secret);
  else
    perform vault.update_secret(v_secret, p_token);
    update private.neosmm_ig_tokens set updated_at = now() where connection_id = p_connection;
  end if;
end;
$$;

create or replace function public.neosmm_ig_token_read(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from private.neosmm_ig_tokens t
  join vault.decrypted_secrets s on s.id = t.vault_secret_id
  join public.neosmm_ig_connections c on c.id = t.connection_id
  where t.connection_id = p_connection and c.status <> 'disconnected';
$$;

create or replace function public.neosmm_ig_token_drop(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  delete from private.neosmm_ig_tokens where connection_id = p_connection returning vault_secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

-- One-time state: used once, before it expires, by the owner who asked for it. Returns the card, or null.
create or replace function public.neosmm_ig_state_consume(p_hash text, p_owner uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.neosmm_ig_oauth_states set used_at = now()
  where state_hash = p_hash and owner_id = p_owner and used_at is null and expires_at > now()
  returning profile_id;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The worker call also covers profiles due for their reading (same one-time token door).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.request_smm_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not exists (
       select 1 from public.neosmm_plan_parts p join public.neosmm_plans pl on pl.id = p.plan_id
       where p.state = 'planned' and p.due_at <= now() and pl.status = 'active')
     and not exists (select 1 from public.neosmm_plan_parts where state in ('dispatching', 'sending') and lease_until < now())
     and not exists (
       select 1 from public.neosmm_orders
       where state = 'accepted' and provider_order_id is not null and not private.neosmm_is_final(status)
         and (checked_at is null or checked_at < now() - interval '3 minutes'))
     and not exists (
       select 1 from public.neosmm_orders
       where refill_id is not null and not private.neosmm_is_final(refill_status)
         and (refill_checked_at is null or refill_checked_at < now() - interval '10 minutes'))
     and not exists (
       select 1 from public.neosmm_orders
       where kind = 'smm' and queue_key is null and state in ('submitting', 'accepted', 'unknown') and not private.neosmm_is_final(status))
     and not exists (
       select 1 from public.neosmm_ig_connections where status in ('connected', 'error') and next_sync_at <= now())
  then
    return;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.neosmm_worker_tokens (token_hash, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '5 minutes');
  perform net.http_post(
    url := 'https://sunmediagroup.uz/api/smm/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-smm-worker', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'smm worker request failed: %', sqlerrm;
end;
$$;

-- Housekeeping of used / expired states inside the existing recovery step.
create or replace function public.neosmm_ig_states_sweep()
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.neosmm_ig_oauth_states where expires_at < now() - interval '1 day'; $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Access: nobody but the server
-- ---------------------------------------------------------------------------------------------------------------
alter table public.neosmm_ig_connections enable row level security;
alter table public.neosmm_ig_oauth_states enable row level security;
alter table private.neosmm_ig_tokens enable row level security;
revoke all on public.neosmm_ig_connections, public.neosmm_ig_oauth_states from public, anon, authenticated;
revoke all on private.neosmm_ig_tokens from public, anon, authenticated, service_role;
grant all on public.neosmm_ig_connections, public.neosmm_ig_oauth_states to service_role;

revoke all on function public.neosmm_ig_token_save(uuid, text), public.neosmm_ig_token_read(uuid), public.neosmm_ig_token_drop(uuid),
  public.neosmm_ig_state_consume(text, uuid), public.neosmm_ig_states_sweep() from public, anon, authenticated;
grant execute on function public.neosmm_ig_token_save(uuid, text), public.neosmm_ig_token_read(uuid), public.neosmm_ig_token_drop(uuid),
  public.neosmm_ig_state_consume(text, uuid), public.neosmm_ig_states_sweep() to service_role;
revoke all on function private.request_smm_worker() from public, anon, authenticated;
