-- SUN MEDIA — Meta integration and CRM (additive).
--
--   Meta Lead Ads ──webhook──▶ meta-webhook (Edge Function, service role) ──▶ leads (pending)
--   Admin (mobile / web) ──deliver_leads──▶ client sees the lead ──▶ CRM reports on demand
--
-- A lead never reaches a client on its own unless that client's CRM template says so (auto_deliver).
-- Meta access tokens live in Vault; only the service role (Edge Functions) can read or write them.

create type public.meta_asset_type as enum ('business', 'page', 'instagram', 'ad_account', 'lead_form');
create type public.integration_status as enum ('active', 'error', 'disconnected');
create type public.lead_delivery_status as enum ('pending', 'delivered', 'discarded');
create type public.lead_fetch_status as enum ('pending', 'complete', 'failed');

-- ---------------------------------------------------------------------------
-- Connections and assets
-- ---------------------------------------------------------------------------

-- A Meta (Facebook) login of SUN MEDIA that manages the clients' pages, Instagram and ad accounts.
create table public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  meta_user_id text not null unique check (meta_user_id ~ '^[0-9]{1,40}$'),
  name text not null default '' check (char_length(name) <= 200),
  status public.integration_status not null default 'active',
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meta_connections_updated_at
  before update on public.meta_connections
  for each row execute function private.set_updated_at();

-- Vault references for the connection (user) token and each page token. Never exposed through the API.
create table private.meta_tokens (
  owner_kind text not null check (owner_kind in ('connection', 'asset')),
  owner_id uuid not null,
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id)
);
revoke all on private.meta_tokens from public, anon, authenticated;

-- What a client has connected: pages (lead ads), lead forms, Instagram accounts, ad accounts, the business.
create table public.meta_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  connection_id uuid references public.meta_connections (id) on delete set null,
  asset_type public.meta_asset_type not null,
  external_id text not null check (external_id ~ '^(act_)?[0-9]{1,40}$'),
  name text not null default '' check (char_length(name) <= 200),
  -- The page a lead form or an Instagram account belongs to.
  parent_external_id text check (parent_external_id is null or parent_external_id ~ '^[0-9]{1,40}$'),
  social_account_id uuid references public.social_accounts (id) on delete set null,
  details jsonb not null default '{}',
  status public.integration_status not null default 'active',
  webhook_subscribed_at timestamptz,
  last_synced_at timestamptz,
  sync_error text check (char_length(sync_error) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, asset_type, external_id)
);

-- A page, lead form or Instagram account routes to exactly one client while it is connected.
create unique index meta_assets_route_idx on public.meta_assets (asset_type, external_id)
  where status <> 'disconnected' and asset_type in ('page', 'lead_form', 'instagram');
create index meta_assets_client_idx on public.meta_assets (client_id);

create trigger meta_assets_updated_at
  before update on public.meta_assets
  for each row execute function private.set_updated_at();

-- The client's CRM template: which form answers are the name / phone / email and what the client sees.
create table public.client_crm_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- standard: name, phone, email, campaign, time. full: also every other answer of the form.
  template text not null default 'standard' check (template in ('standard', 'full')),
  field_map jsonb not null default '{"name": ["full_name", "name", "first_name"], "phone": ["phone_number", "phone"], "email": ["email"]}'
    check (jsonb_typeof(field_map) = 'object'),
  -- Off by default: an admin checks and sends leads to the client.
  auto_deliver boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger client_crm_settings_updated_at
  before update on public.client_crm_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  lead_count integer not null check (lead_count > 0),
  automatic boolean not null default false,
  delivered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index lead_deliveries_client_idx on public.lead_deliveries (client_id, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source text not null default 'meta' check (source = 'meta'),
  -- Meta retries webhooks; the lead id makes every delivery idempotent.
  meta_lead_id text not null unique check (meta_lead_id ~ '^[0-9]{1,40}$'),
  page_id text,
  page_name text check (char_length(page_name) <= 200),
  form_id text,
  form_name text check (char_length(form_name) <= 200),
  ad_account_id text,
  campaign_id text,
  campaign_name text check (char_length(campaign_name) <= 300),
  adset_id text,
  adset_name text check (char_length(adset_name) <= 300),
  ad_id text,
  ad_name text check (char_length(ad_name) <= 300),
  platform text check (char_length(platform) <= 20),
  full_name text check (char_length(full_name) <= 200),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 200),
  -- Every answer of the form as {"question_key": "answer"}; forms differ per client.
  fields jsonb not null default '{}' check (jsonb_typeof(fields) = 'object'),
  meta_created_at timestamptz,
  received_at timestamptz not null default now(),
  lead_at timestamptz generated always as (coalesce(meta_created_at, received_at)) stored,
  fetch_status public.lead_fetch_status not null default 'pending',
  fetch_attempts smallint not null default 0,
  fetch_error text check (char_length(fetch_error) <= 1000),
  delivery_status public.lead_delivery_status not null default 'pending',
  delivery_id uuid references public.lead_deliveries (id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles (id) on delete set null,
  discarded_reason text check (char_length(discarded_reason) <= 300),
  admin_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((delivery_status = 'delivered') = (delivered_at is not null))
);

create index leads_client_lead_at_idx on public.leads (client_id, lead_at desc, id);
create index leads_pending_idx on public.leads (lead_at desc) where delivery_status = 'pending';
create index leads_fetch_idx on public.leads (received_at) where fetch_status = 'pending';
create index leads_unnotified_idx on public.leads (client_id) where admin_notified_at is null;
create index leads_delivery_idx on public.leads (delivery_id);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- CRM reports (7 / 30 days or a custom period), sent by an admin to the client
-- ---------------------------------------------------------------------------
create table public.crm_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly', 'custom')),
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  note text check (char_length(note) <= 1000),
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 366)
);

create index crm_reports_client_idx on public.crm_reports (client_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- First non-empty answer among the given form keys (case-insensitive).
create or replace function private.pick_lead_field(p_fields jsonb, p_keys jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(f.value), '')
  from jsonb_array_elements_text(coalesce(p_keys, '[]'::jsonb)) with ordinality k(key, pos)
  join jsonb_each_text(coalesce(p_fields, '{}'::jsonb)) f on lower(f.key) = lower(k.key)
  where nullif(btrim(f.value), '') is not null
  order by k.pos
  limit 1;
$$;

create or replace function private.default_crm_field_map()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"name": ["full_name", "name", "first_name"], "phone": ["phone_number", "phone"], "email": ["email"]}'::jsonb;
$$;

-- Can the current user work with this client's leads at the given level (crm.read / crm.manage)?
create or replace function private.can_crm(p_client uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and private.can_manage_client(p_client, p_permission);
$$;

-- Lead as the client is allowed to see it (the template decides whether custom answers are included).
create or replace function private.client_lead_json(p_lead public.leads, p_full boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_lead.id,
    'full_name', p_lead.full_name,
    'phone', p_lead.phone,
    'email', p_lead.email,
    'campaign_name', p_lead.campaign_name,
    'ad_name', p_lead.ad_name,
    'form_name', p_lead.form_name,
    'platform', p_lead.platform,
    'lead_at', p_lead.lead_at,
    'delivered_at', p_lead.delivered_at,
    'fields', case when p_full then p_lead.fields else '{}'::jsonb end
  );
$$;

-- Marks the leads delivered as one batch and tells the client's people who may see leads.
create or replace function private.deliver_leads_internal(p_client uuid, p_lead_ids uuid[], p_actor uuid, p_automatic boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery uuid;
  v_count integer;
  v_client public.clients;
begin
  select * into v_client from public.clients where id = p_client;

  with target as (
    select l.id from public.leads l
    where l.client_id = p_client
      and l.delivery_status = 'pending'
      and l.fetch_status = 'complete'
      and (p_lead_ids is null or l.id = any (p_lead_ids))
    for update
  )
  select count(*) into v_count from target;

  if v_count = 0 then
    return jsonb_build_object('delivered', 0, 'delivery_id', null);
  end if;

  insert into public.lead_deliveries (client_id, lead_count, automatic, delivered_by)
  values (p_client, v_count, p_automatic, p_actor)
  returning id into v_delivery;

  update public.leads l
  set delivery_status = 'delivered', delivered_at = now(), delivered_by = p_actor, delivery_id = v_delivery
  where l.client_id = p_client
    and l.delivery_status = 'pending'
    and l.fetch_status = 'complete'
    and (p_lead_ids is null or l.id = any (p_lead_ids));

  perform private.notify(
    private.client_users_with_permission(p_client, 'client.crm.view'),
    'crm.leads_delivered',
    case when v_count = 1 then 'SUN MEDIA sizga yangi lid yubordi' else 'SUN MEDIA sizga ' || v_count || ' ta yangi lid yubordi' end,
    'Lidlar bo‘limida ism, telefon va qaysi reklamadan kelganini ko‘ring.',
    jsonb_build_object('route', '/crm', 'count', v_count),
    'lead_deliveries', v_delivery, p_client, 'high'
  );
  perform private.audit_event('crm.leads_delivered', 'lead_deliveries', v_delivery::text, p_client, null,
    jsonb_build_object('count', v_count, 'automatic', p_automatic));
  return jsonb_build_object('delivered', v_count, 'delivery_id', v_delivery);
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only: Edge Functions (webhook, OAuth, sync). Never granted to app users.
-- ---------------------------------------------------------------------------
create or replace function public.meta_save_token(p_owner_kind text, p_owner_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if p_owner_kind not in ('connection', 'asset') or coalesce(p_token, '') = '' then
    raise exception 'Invalid token owner or empty token' using errcode = '22023';
  end if;
  select vault_secret_id into v_secret from private.meta_tokens where owner_kind = p_owner_kind and owner_id = p_owner_id;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'meta_' || p_owner_kind || '_' || p_owner_id::text, 'Meta access token (SUN MEDIA)');
    insert into private.meta_tokens (owner_kind, owner_id, vault_secret_id) values (p_owner_kind, p_owner_id, v_secret);
  else
    perform vault.update_secret(v_secret, p_token);
    update private.meta_tokens set updated_at = now() where owner_kind = p_owner_kind and owner_id = p_owner_id;
  end if;
end;
$$;

create or replace function public.meta_read_token(p_owner_kind text, p_owner_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from private.meta_tokens t
  join vault.decrypted_secrets s on s.id = t.vault_secret_id
  where t.owner_kind = p_owner_kind and t.owner_id = p_owner_id;
$$;

create or replace function public.meta_drop_token(p_owner_kind text, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  delete from private.meta_tokens where owner_kind = p_owner_kind and owner_id = p_owner_id
  returning vault_secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

-- After Facebook Login: one row per Meta user, the long-lived user token goes to Vault.
create or replace function public.meta_save_connection(
  p_meta_user_id text, p_name text, p_token text, p_expires_at timestamptz, p_scopes text[], p_connected_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.meta_connections (meta_user_id, name, status, scopes, token_expires_at, connected_by, last_error)
  values (p_meta_user_id, left(coalesce(p_name, ''), 200), 'active', coalesce(p_scopes, '{}'), p_expires_at, p_connected_by, null)
  on conflict (meta_user_id) do update
  set name = excluded.name, status = 'active', scopes = excluded.scopes, token_expires_at = excluded.token_expires_at,
      connected_by = excluded.connected_by, last_error = null
  returning id into v_id;
  perform public.meta_save_token('connection', v_id, p_token);
  perform private.audit_event('integrations.meta_connected', 'meta_connections', v_id::text, null, null,
    jsonb_build_object('meta_user', p_meta_user_id, 'scopes', p_scopes));
  return v_id;
end;
$$;

-- Page token stored, webhook subscription recorded (or the error the admin should see).
create or replace function public.meta_mark_asset(p_asset_id uuid, p_webhook_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.meta_assets
  set webhook_subscribed_at = case when p_webhook_ok then now() else webhook_subscribed_at end,
      status = case when p_error is null then 'active'::public.integration_status else 'error'::public.integration_status end,
      sync_error = left(p_error, 1000)
  where id = p_asset_id;
$$;

-- Webhook: create the lead once (duplicates return the existing row) and route it to its client.
create or replace function public.ingest_meta_lead(
  p_meta_lead_id text, p_page_id text, p_form_id text default null, p_ad_id text default null,
  p_adset_id text default null, p_created_time timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.meta_assets;
  v_page public.meta_assets;
  v_form public.meta_assets;
  v_lead public.leads;
begin
  select * into v_form from public.meta_assets
  where asset_type = 'lead_form' and external_id = p_form_id and status <> 'disconnected';
  select * into v_page from public.meta_assets
  where asset_type = 'page' and external_id = p_page_id and status <> 'disconnected';
  -- A connected lead form decides the client; otherwise the page does.
  if v_form.id is not null then
    v_route := v_form;
  else
    v_route := v_page;
  end if;
  if v_route.id is null then
    return jsonb_build_object('status', 'unrouted');
  end if;

  insert into public.leads (client_id, meta_lead_id, page_id, page_name, form_id, form_name, ad_id, adset_id, meta_created_at)
  values (v_route.client_id, p_meta_lead_id, p_page_id, nullif(v_page.name, ''), p_form_id, nullif(v_form.name, ''),
          p_ad_id, p_adset_id, p_created_time)
  on conflict (meta_lead_id) do nothing
  returning * into v_lead;

  if v_lead.id is null then
    select * into v_lead from public.leads where meta_lead_id = p_meta_lead_id;
    return jsonb_build_object('status', 'duplicate', 'lead_id', v_lead.id, 'fetch_status', v_lead.fetch_status,
      'page_asset_id', (select a.id from public.meta_assets a where a.asset_type = 'page' and a.external_id = v_lead.page_id
                        and a.status <> 'disconnected'));
  end if;
  return jsonb_build_object('status', 'created', 'lead_id', v_lead.id, 'client_id', v_lead.client_id, 'page_asset_id', v_page.id);
end;
$$;

-- Graph API lead details → the lead's answers, name / phone / email and ad context.
create or replace function public.complete_meta_lead(p_lead_id uuid, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_settings public.client_crm_settings;
  v_map jsonb;
  v_fields jsonb;
  v_name text;
  v_created timestamptz;
  v_result jsonb := '{}';
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_object_agg(f ->> 'name', (
           select string_agg(v, ', ') from jsonb_array_elements_text(coalesce(f -> 'values', '[]'::jsonb)) v
         )), '{}'::jsonb)
  into v_fields
  from jsonb_array_elements(coalesce(p_details -> 'field_data', '[]'::jsonb)) f
  where f ? 'name';

  select * into v_settings from public.client_crm_settings where client_id = v_lead.client_id;
  v_map := coalesce(v_settings.field_map, private.default_crm_field_map());

  v_name := private.pick_lead_field(v_fields, v_map -> 'name');
  if v_name is null or lower(v_name) = lower(coalesce(v_fields ->> 'first_name', '')) then
    v_name := coalesce(nullif(btrim(concat_ws(' ', v_fields ->> 'first_name', v_fields ->> 'last_name')), ''), v_name);
  end if;

  begin
    v_created := (p_details ->> 'created_time')::timestamptz;
  exception when others then
    v_created := null;
  end;

  update public.leads
  set fields = v_fields,
      full_name = left(v_name, 200),
      phone = left(private.pick_lead_field(v_fields, v_map -> 'phone'), 40),
      email = left(private.pick_lead_field(v_fields, v_map -> 'email'), 200),
      form_id = coalesce(p_details ->> 'form_id', form_id),
      ad_id = coalesce(p_details ->> 'ad_id', ad_id),
      ad_name = left(coalesce(p_details ->> 'ad_name', ad_name), 300),
      adset_id = coalesce(p_details ->> 'adset_id', adset_id),
      adset_name = left(coalesce(p_details ->> 'adset_name', adset_name), 300),
      campaign_id = coalesce(p_details ->> 'campaign_id', campaign_id),
      campaign_name = left(coalesce(p_details ->> 'campaign_name', campaign_name), 300),
      platform = left(coalesce(p_details ->> 'platform', platform), 20),
      meta_created_at = coalesce(v_created, meta_created_at),
      fetch_status = 'complete',
      fetch_error = null,
      fetch_attempts = fetch_attempts + 1
  where id = p_lead_id
  returning * into v_lead;

  if coalesce(v_settings.auto_deliver, false) and v_lead.delivery_status = 'pending' then
    v_result := private.deliver_leads_internal(v_lead.client_id, array[v_lead.id], null, true);
  end if;
  return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_lead.client_id) || v_result;
end;
$$;

-- A failed Graph call: retried by the sync job up to five times, then shown to admins as "failed".
create or replace function public.fail_meta_lead(p_lead_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.leads
  set fetch_attempts = fetch_attempts + 1,
      fetch_error = left(p_error, 1000),
      fetch_status = case when fetch_attempts + 1 >= 5 then 'failed'::public.lead_fetch_status else 'pending'::public.lead_fetch_status end
  where id = p_lead_id and fetch_status <> 'complete';
$$;

-- Leads whose details still need fetching, with the page asset holding the token.
create or replace function public.meta_leads_to_fetch(p_limit integer default 50)
returns table (lead_id uuid, meta_lead_id text, page_asset_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.meta_lead_id, a.id
  from public.leads l
  join public.meta_assets a on a.asset_type = 'page' and a.external_id = l.page_id and a.status <> 'disconnected'
  where l.fetch_status = 'pending'
  order by l.received_at
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.meta_save_token(text, uuid, text) from public, anon, authenticated;
revoke all on function public.meta_read_token(text, uuid) from public, anon, authenticated;
revoke all on function public.meta_drop_token(text, uuid) from public, anon, authenticated;
revoke all on function public.meta_save_connection(text, text, text, timestamptz, text[], uuid) from public, anon, authenticated;
revoke all on function public.meta_mark_asset(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.ingest_meta_lead(text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_meta_lead(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_meta_lead(uuid, text) from public, anon, authenticated;
revoke all on function public.meta_leads_to_fetch(integer) from public, anon, authenticated;
grant execute on function public.meta_save_token(text, uuid, text) to service_role;
grant execute on function public.meta_read_token(text, uuid) to service_role;
grant execute on function public.meta_drop_token(text, uuid) to service_role;
grant execute on function public.meta_save_connection(text, text, text, timestamptz, text[], uuid) to service_role;
grant execute on function public.meta_mark_asset(uuid, boolean, text) to service_role;
grant execute on function public.ingest_meta_lead(text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.complete_meta_lead(uuid, jsonb) to service_role;
grant execute on function public.fail_meta_lead(uuid, text) to service_role;
grant execute on function public.meta_leads_to_fetch(integer) to service_role;
revoke all on function private.deliver_leads_internal(uuid, uuid[], uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Integrations (web: Mijoz → Integratsiyalar → Meta)
-- ---------------------------------------------------------------------------

-- The wizard's final step, run with the admin's own session: which assets belong to this client.
-- p_assets: [{"type": "page", "external_id": "123", "name": "SAFI", "parent_external_id": null, "details": {}}]
create or replace function public.save_meta_assets(p_client uuid, p_connection uuid, p_assets jsonb, p_template text default null, p_auto_deliver boolean default null)
returns table (asset_id uuid, asset_type public.meta_asset_type, external_id text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item jsonb;
  v_type public.meta_asset_type;
  v_ext text;
  v_asset public.meta_assets;
  v_social uuid;
  v_handle text;
  v_kept uuid[] := '{}';
begin
  if not private.can_crm(p_client, 'integrations.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.meta_connections where id = p_connection and status <> 'disconnected') then
    raise exception 'Meta connection not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_assets) <> 'array' then
    raise exception 'Assets must be a list' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_assets) loop
    v_type := (v_item ->> 'type')::public.meta_asset_type;
    v_ext := v_item ->> 'external_id';

    -- Another client already receives this page / form / account.
    if v_type in ('page', 'lead_form', 'instagram') and exists (
      select 1 from public.meta_assets a
      where a.asset_type = v_type and a.external_id = v_ext and a.status <> 'disconnected' and a.client_id <> p_client
    ) then
      raise exception '% % is already connected to another client', v_type, v_ext using errcode = '23505';
    end if;

    v_social := null;
    if v_type = 'instagram' then
      v_handle := lower(coalesce(nullif(v_item -> 'details' ->> 'username', ''), nullif(v_item ->> 'name', ''), v_ext));
      insert into public.social_accounts (client_id, platform, handle, url, external_id, connection)
      values (p_client, 'instagram', left(v_handle, 120), 'https://instagram.com/' || v_handle, v_ext, 'connected')
      on conflict (client_id, platform, handle) do update
      set external_id = excluded.external_id, connection = 'connected', deleted_at = null, sync_error = null
      returning id into v_social;
    end if;

    insert into public.meta_assets (client_id, connection_id, asset_type, external_id, name, parent_external_id, details, status, social_account_id, created_by)
    values (p_client, p_connection, v_type, v_ext, left(coalesce(v_item ->> 'name', ''), 200), v_item ->> 'parent_external_id',
            coalesce(v_item -> 'details', '{}'::jsonb), 'active', v_social, auth.uid())
    on conflict (client_id, asset_type, external_id) do update
    set connection_id = excluded.connection_id, name = excluded.name, parent_external_id = excluded.parent_external_id,
        details = excluded.details, status = 'active', sync_error = null,
        social_account_id = coalesce(excluded.social_account_id, public.meta_assets.social_account_id)
    returning * into v_asset;

    v_kept := v_kept || v_asset.id;
    asset_id := v_asset.id;
    asset_type := v_asset.asset_type;
    external_id := v_asset.external_id;
    return next;
  end loop;

  -- Whatever was connected through this Meta login but is no longer chosen is switched off (history stays).
  update public.meta_assets a
  set status = 'disconnected', webhook_subscribed_at = null
  where a.client_id = p_client and a.connection_id = p_connection and a.id <> all (v_kept) and a.status <> 'disconnected';

  update public.social_accounts s
  set connection = 'disconnected'
  where s.client_id = p_client and s.platform = 'instagram' and s.connection = 'connected'
    and not exists (select 1 from public.meta_assets a where a.social_account_id = s.id and a.status <> 'disconnected');

  insert into public.client_crm_settings (client_id, template, auto_deliver, updated_by)
  values (p_client, coalesce(p_template, 'standard'), coalesce(p_auto_deliver, false), auth.uid())
  on conflict (client_id) do update
  set template = coalesce(p_template, public.client_crm_settings.template),
      auto_deliver = coalesce(p_auto_deliver, public.client_crm_settings.auto_deliver),
      updated_by = auth.uid();

  perform private.audit_event('integrations.meta_assets_saved', 'clients', p_client::text, p_client, null,
    jsonb_build_object('connection', p_connection, 'assets', cardinality(v_kept)));
end;
$$;

create or replace function public.disconnect_meta_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.meta_assets;
begin
  select * into v_asset from public.meta_assets where id = p_asset_id;
  if not found or not private.can_crm(v_asset.client_id, 'integrations.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.meta_assets set status = 'disconnected', webhook_subscribed_at = null where id = p_asset_id;
  if v_asset.social_account_id is not null then
    update public.social_accounts set connection = 'disconnected' where id = v_asset.social_account_id;
  end if;
  perform private.audit_event('integrations.meta_asset_disconnected', 'meta_assets', p_asset_id::text, v_asset.client_id);
end;
$$;

create or replace function public.save_crm_settings(p_client uuid, p_template text, p_auto_deliver boolean, p_field_map jsonb default null)
returns public.client_crm_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.client_crm_settings;
  v_key text;
begin
  if not private.can_crm(p_client, 'integrations.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_template not in ('standard', 'full') then
    raise exception 'Unknown CRM template' using errcode = '22023';
  end if;
  if p_field_map is not null then
    for v_key in select jsonb_object_keys(p_field_map) loop
      if v_key not in ('name', 'phone', 'email') or jsonb_typeof(p_field_map -> v_key) <> 'array' then
        raise exception 'Field map supports name, phone and email lists' using errcode = '22023';
      end if;
    end loop;
  end if;
  insert into public.client_crm_settings (client_id, template, auto_deliver, field_map, updated_by)
  values (p_client, p_template, p_auto_deliver, coalesce(p_field_map, private.default_crm_field_map()), auth.uid())
  on conflict (client_id) do update
  set template = excluded.template, auto_deliver = excluded.auto_deliver,
      field_map = coalesce(p_field_map, public.client_crm_settings.field_map), updated_by = auth.uid()
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- CRM for staff (Admin mobile: Yangi / Yuborilmagan / Yuborilgan; Rahbar: read-only)
-- ---------------------------------------------------------------------------
create or replace function public.get_crm_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_tz text := private.agency_timezone();
begin
  if not (private.is_staff() and private.has_permission('crm.read')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return (
    with scoped as (
      select l.* from public.leads l
      where private.sees_all_clients() or l.client_id = any (private.staff_client_ids())
    ),
    per_client as (
      select c.id, c.name, c.code, c.logo_url,
             count(*) filter (where s.delivery_status = 'pending' and s.lead_at >= now() - interval '24 hours') as fresh,
             count(*) filter (where s.delivery_status = 'pending') as pending,
             count(*) filter (where s.delivery_status = 'pending' and s.fetch_status = 'complete') as ready,
             count(*) filter (where s.delivery_status = 'delivered' and (s.delivered_at at time zone v_tz)::date = v_today) as delivered_today,
             count(*) filter (where (s.lead_at at time zone v_tz)::date = v_today) as today,
             max(s.lead_at) as last_lead_at
      from scoped s join public.clients c on c.id = s.client_id
      group by c.id
    )
    select jsonb_build_object(
      'new', coalesce(sum(fresh), 0),
      'pending', coalesce(sum(pending), 0),
      'delivered_today', coalesce(sum(delivered_today), 0),
      'today', coalesce(sum(today), 0),
      'failed', (select count(*) from scoped where fetch_status = 'failed' and delivery_status = 'pending'),
      'can_manage', private.has_permission('crm.manage'),
      'clients', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'code', code, 'logo_url', logo_url, 'new', fresh, 'pending', pending, 'ready', ready,
        'delivered_today', delivered_today, 'today', today, 'last_lead_at', last_lead_at
      ) order by pending desc, last_lead_at desc nulls last), '[]'::jsonb)
    )
    from per_client
  );
end;
$$;

-- p_state: new (pending, last 24h) | pending | delivered | discarded. Keyset pagination by lead time.
create or replace function public.get_leads(
  p_state text, p_client uuid default null, p_before timestamptz default null, p_limit integer default 50
)
returns table (
  id uuid, client_id uuid, client_name text, client_code text, full_name text, phone text, email text,
  campaign_name text, ad_name text, form_name text, platform text, lead_at timestamptz, received_at timestamptz,
  fetch_status public.lead_fetch_status, delivery_status public.lead_delivery_status, delivered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (private.is_staff() and private.has_permission('crm.read')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_state not in ('new', 'pending', 'delivered', 'discarded') then
    raise exception 'Unknown lead state' using errcode = '22023';
  end if;
  return query
  select l.id, l.client_id, c.name, c.code, l.full_name, l.phone, l.email, l.campaign_name, l.ad_name, l.form_name,
         l.platform, l.lead_at, l.received_at, l.fetch_status, l.delivery_status, l.delivered_at
  from public.leads l
  join public.clients c on c.id = l.client_id
  where (private.sees_all_clients() or l.client_id = any (private.staff_client_ids()))
    and (p_client is null or l.client_id = p_client)
    and (p_before is null or l.lead_at < p_before)
    and case p_state
      when 'new' then l.delivery_status = 'pending' and l.lead_at >= now() - interval '24 hours'
      when 'pending' then l.delivery_status = 'pending'
      when 'delivered' then l.delivery_status = 'delivered'
      else l.delivery_status = 'discarded'
    end
  order by l.lead_at desc, l.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.get_lead(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or not private.can_crm(v_lead.client_id, 'crm.read') then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  return to_jsonb(v_lead) || jsonb_build_object(
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code) from public.clients c where c.id = v_lead.client_id),
    'delivered_by_name', (select p.full_name from public.profiles p where p.id = v_lead.delivered_by),
    'can_manage', private.can_crm(v_lead.client_id, 'crm.manage')
  );
end;
$$;

-- "Mijozga yuborish": the given leads, or every ready lead of the client ("27 ta lidni SAFI'ga yuborish").
create or replace function public.deliver_leads(p_client uuid, p_lead_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_crm(p_client, 'crm.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client and deleted_at is null and status in ('active', 'paused')) then
    raise exception 'Client is not active' using errcode = '22023';
  end if;
  return private.deliver_leads_internal(p_client, p_lead_ids, auth.uid(), false);
end;
$$;

-- Spam / test / duplicate person: kept for statistics, never shown to the client.
create or replace function public.discard_leads(p_lead_ids uuid[], p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if exists (
    select 1 from public.leads l where l.id = any (p_lead_ids) and not private.can_crm(l.client_id, 'crm.manage')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.leads
  set delivery_status = 'discarded', discarded_reason = left(nullif(btrim(p_reason), ''), 300)
  where id = any (p_lead_ids) and delivery_status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.restore_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.leads where id = p_lead_id;
  if v_client is null or not private.can_crm(v_client, 'crm.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.leads set delivery_status = 'pending', discarded_reason = null
  where id = p_lead_id and delivery_status = 'discarded';
end;
$$;

-- ---------------------------------------------------------------------------
-- CRM for clients: only what SUN MEDIA delivered
-- ---------------------------------------------------------------------------
create or replace function private.can_see_client_leads(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_client_permission(p_client, 'client.crm.view') or private.can_crm(p_client, 'crm.read');
$$;

-- p_period: today | 7d | 30d | all (by the time the person applied, in the agency time zone).
create or replace function public.get_client_leads(p_client uuid, p_period text default '7d', p_before timestamptz default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_full boolean;
  v_tz text := private.agency_timezone();
begin
  if not private.can_see_client_leads(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_from := case p_period
    when 'today' then (private.agency_today()::timestamp at time zone v_tz)
    when '7d' then ((private.agency_today() - 6)::timestamp at time zone v_tz)
    when '30d' then ((private.agency_today() - 29)::timestamp at time zone v_tz)
    when 'all' then '-infinity'::timestamptz
  end;
  if v_from is null then
    raise exception 'Unknown period' using errcode = '22023';
  end if;
  select coalesce(s.template = 'full', false) into v_full from public.client_crm_settings s where s.client_id = p_client;

  return jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'today', count(*) filter (where l.lead_at >= (private.agency_today()::timestamp at time zone v_tz)),
        '7d', count(*) filter (where l.lead_at >= ((private.agency_today() - 6)::timestamp at time zone v_tz)),
        '30d', count(*) filter (where l.lead_at >= ((private.agency_today() - 29)::timestamp at time zone v_tz)),
        'all', count(*)
      )
      from public.leads l where l.client_id = p_client and l.delivery_status = 'delivered'
    ),
    'leads', coalesce((
      select jsonb_agg(private.client_lead_json(x.lead, coalesce(v_full, false)) order by (x.lead).lead_at desc, (x.lead).id)
      from (
        select l as lead from public.leads l
        where l.client_id = p_client and l.delivery_status = 'delivered' and l.lead_at >= v_from
          and (p_before is null or l.lead_at < p_before)
        order by l.lead_at desc, l.id
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- CRM reports
-- ---------------------------------------------------------------------------
create or replace function private.crm_report_data(p_client uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone private.agency_timezone()) as t_from,
           ((p_to + 1)::timestamp at time zone private.agency_timezone()) as t_to,
           private.agency_timezone() as tz,
           (p_to - p_from + 1) as n_days
  ),
  base as (
    select l.*, (l.lead_at at time zone b.tz)::date as day
    from public.leads l, bounds b
    where l.client_id = p_client and l.lead_at >= b.t_from and l.lead_at < b.t_to and l.delivery_status <> 'discarded'
  ),
  calendar as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'period_start', p_from,
    'period_end', p_to,
    'days', (select n_days from bounds),
    'total', (select count(*) from base),
    'delivered', (select count(*) from base where delivery_status = 'delivered'),
    'pending', (select count(*) from base where delivery_status = 'pending'),
    'daily_average', (select round(count(*)::numeric / greatest((select n_days from bounds), 1), 1) from base),
    'by_campaign', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc, name)
      from (select coalesce(nullif(campaign_name, ''), 'Nomsiz kampaniya') as name, count(*) as n from base group by 1 order by 2 desc limit 10) x
    ), '[]'::jsonb),
    'top_ads', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'campaign', campaign, 'count', n) order by n desc, name)
      from (
        select coalesce(nullif(ad_name, ''), 'Nomsiz reklama') as name, max(campaign_name) as campaign, count(*) as n
        from base group by coalesce(nullif(ad_name, ''), 'Nomsiz reklama') order by 3 desc limit 5
      ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', (select count(*) from base b where b.day = d.day)) order by d.day)
      from calendar d
    ), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', w, 'count', n) order by w)
      from (select date_trunc('week', day)::date as w, count(*) as n from base group by 1) x
    ), '[]'::jsonb)
  );
$$;

create or replace function public.preview_crm_report(p_client uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_crm(p_client, 'crm.read') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a period up to one year' using errcode = '22023';
  end if;
  return private.crm_report_data(p_client, p_from, p_to);
end;
$$;

create or replace function public.send_crm_report(p_client uuid, p_kind text, p_from date, p_to date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_data jsonb;
begin
  if not private.can_crm(p_client, 'crm.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('weekly', 'monthly', 'custom') then
    raise exception 'Unknown report kind' using errcode = '22023';
  end if;
  if p_to < p_from or p_to - p_from > 366 or p_to > private.agency_today() then
    raise exception 'Choose a finished period up to one year' using errcode = '22023';
  end if;
  v_data := private.crm_report_data(p_client, p_from, p_to);
  insert into public.crm_reports (client_id, kind, period_start, period_end, data, note, sent_by)
  values (p_client, p_kind, p_from, p_to, v_data, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;

  perform private.notify(
    private.client_users_with_permission(p_client, 'client.crm.view'),
    'crm.report',
    'Lidlar hisoboti tayyor',
    to_char(p_from, 'DD.MM') || '–' || to_char(p_to, 'DD.MM.YYYY') || ': ' || (v_data ->> 'total') || ' ta lid.',
    jsonb_build_object('route', '/crm/report/' || v_id),
    'crm_reports', v_id, p_client, 'normal'
  );
  perform private.audit_event('crm.report_sent', 'crm_reports', v_id::text, p_client, null,
    jsonb_build_object('kind', p_kind, 'from', p_from, 'to', p_to, 'total', v_data ->> 'total'));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- New-lead alerts for admins: one message per client per run, never one per lead.
-- ---------------------------------------------------------------------------
create or replace function private.notify_new_leads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_sent integer := 0;
begin
  for v_row in
    select l.client_id, c.name, count(*) as n, array_agg(l.id) as ids
    from public.leads l join public.clients c on c.id = l.client_id
    where l.admin_notified_at is null and l.delivery_status = 'pending' and l.received_at > now() - interval '2 days'
    group by l.client_id, c.name
  loop
    perform private.notify(
      private.users_with_permission('crm.manage'),
      'crm.new_leads',
      v_row.name || ': ' || v_row.n || ' ta yangi lid',
      'Tekshirib, mijozga yuboring.',
      jsonb_build_object('route', '/crm', 'client_id', v_row.client_id, 'count', v_row.n),
      'clients', v_row.client_id, v_row.client_id, 'normal'
    );
    update public.leads set admin_notified_at = now() where id = any (v_row.ids);
    v_sent := v_sent + 1;
  end loop;
  -- Leads delivered automatically need no alert.
  update public.leads set admin_notified_at = now()
  where admin_notified_at is null and delivery_status <> 'pending';
  return v_sent;
end;
$$;

select cron.schedule('sunmedia-crm-new-leads', '*/10 * * * *', $$select private.notify_new_leads()$$);

-- ---------------------------------------------------------------------------
-- Realtime: leads reach a client's channel only once delivered.
-- ---------------------------------------------------------------------------
create or replace function private.row_is_client_visible(p_table text, p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_row is null then
    return false;
  end if;
  if (p_row ? 'is_client_visible') and not (p_row ->> 'is_client_visible')::boolean then
    return false;
  end if;
  if (p_row ? 'visibility') and p_row ->> 'visibility' <> 'client' then
    return false;
  end if;
  if (p_row ? 'stage') and p_row ->> 'stage' <> 'client' then
    return false;
  end if;
  if p_table = 'content_versions' and p_row ->> 'sent_to_client_at' is null then
    return false;
  end if;
  if p_table = 'monthly_reports' and p_row ->> 'status' <> 'published' then
    return false;
  end if;
  if p_table = 'contracts' and p_row ->> 'status' = 'draft' then
    return false;
  end if;
  if p_table = 'leads' and p_row ->> 'delivery_status' <> 'delivered' then
    return false;
  end if;
  if p_table in ('meta_assets', 'meta_connections', 'client_crm_settings') then
    return false;
  end if;
  if p_table = 'revision_comments' then
    return exists (
      select 1 from public.revisions r where r.id = (p_row ->> 'revision_id')::uuid and r.stage = 'client'
    );
  end if;
  return true;
end;
$$;

create trigger rt_leads after insert or update or delete on public.leads
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_lead_deliveries after insert on public.lead_deliveries
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_crm_reports after insert or update or delete on public.crm_reports
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_meta_assets after insert or update or delete on public.meta_assets
  for each row execute function private.broadcast_change('staff');
create trigger rt_meta_connections after insert or update or delete on public.meta_connections
  for each row execute function private.broadcast_change('staff');
create trigger rt_client_crm_settings after insert or update on public.client_crm_settings
  for each row execute function private.broadcast_change('staff');

create trigger audit_meta_assets after insert or update or delete on public.meta_assets
  for each row execute function private.audit_row();
create trigger audit_client_crm_settings after insert or update or delete on public.client_crm_settings
  for each row execute function private.audit_row('client_id');

-- ---------------------------------------------------------------------------
-- Row Level Security: reads only; every write goes through the functions above.
-- ---------------------------------------------------------------------------
alter table public.meta_connections enable row level security;
alter table public.meta_assets enable row level security;
alter table public.client_crm_settings enable row level security;
alter table public.lead_deliveries enable row level security;
alter table public.leads enable row level security;
alter table public.crm_reports enable row level security;

-- Policy helpers run as the reader.
grant execute on function private.can_crm(uuid, text) to authenticated;
grant execute on function private.can_see_client_leads(uuid) to authenticated;

revoke insert, update, delete on public.meta_connections, public.meta_assets, public.client_crm_settings,
  public.lead_deliveries, public.leads, public.crm_reports from anon, authenticated;

create policy "integration managers read connections" on public.meta_connections
  for select to authenticated using ((select private.is_staff()) and (select private.has_permission('integrations.manage')));

create policy "staff read client assets" on public.meta_assets
  for select to authenticated using (
    private.can_crm(client_id, 'integrations.manage') or private.can_crm(client_id, 'crm.read')
  );

create policy "staff read crm settings" on public.client_crm_settings
  for select to authenticated using (
    private.can_crm(client_id, 'integrations.manage') or private.can_crm(client_id, 'crm.read')
  );

create policy "staff read leads" on public.leads
  for select to authenticated using (private.can_crm(client_id, 'crm.read'));

create policy "read lead deliveries" on public.lead_deliveries
  for select to authenticated using (private.can_see_client_leads(client_id));

create policy "read crm reports" on public.crm_reports
  for select to authenticated using (private.can_see_client_leads(client_id));

grant execute on function public.save_meta_assets(uuid, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.disconnect_meta_asset(uuid) to authenticated;
grant execute on function public.save_crm_settings(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.get_crm_summary() to authenticated;
grant execute on function public.get_leads(text, uuid, timestamptz, integer) to authenticated;
grant execute on function public.get_lead(uuid) to authenticated;
grant execute on function public.deliver_leads(uuid, uuid[]) to authenticated;
grant execute on function public.discard_leads(uuid[], text) to authenticated;
grant execute on function public.restore_lead(uuid) to authenticated;
grant execute on function public.get_client_leads(uuid, text, timestamptz, integer) to authenticated;
grant execute on function public.preview_crm_report(uuid, date, date) to authenticated;
grant execute on function public.send_crm_report(uuid, text, date, date, text) to authenticated;
revoke all on function public.save_meta_assets(uuid, uuid, jsonb, text, boolean) from anon;
revoke all on function public.disconnect_meta_asset(uuid) from anon;
revoke all on function public.save_crm_settings(uuid, text, boolean, jsonb) from anon;
revoke all on function public.get_crm_summary() from anon;
revoke all on function public.get_leads(text, uuid, timestamptz, integer) from anon;
revoke all on function public.get_lead(uuid) from anon;
revoke all on function public.deliver_leads(uuid, uuid[]) from anon;
revoke all on function public.discard_leads(uuid[], text) from anon;
revoke all on function public.restore_lead(uuid) from anon;
revoke all on function public.get_client_leads(uuid, text, timestamptz, integer) from anon;
revoke all on function public.preview_crm_report(uuid, date, date) from anon;
revoke all on function public.send_crm_report(uuid, text, date, date, text) from anon;
