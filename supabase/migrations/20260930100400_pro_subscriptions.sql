-- SUN MEDIA Pro (SaaS) — workspaces, configurable plans/features, subscriptions and promo codes (additive).
--
-- Not to be confused with public.plans (the service packages an agency sells to its clients, e.g. "$700").
-- Here a WORKSPACE (the agency itself, or one client company) holds a subscription to a SaaS plan
-- (Free / Pro / later Business, Enterprise). Limits and flags live in saas_plan_features, never in code.
-- SUN MEDIA's own workspace is internal: Pro for life, never billed. Client workspaces inherit the agency's plan
-- unless configured otherwise, and can hold their own Pro (promo code, game reward, billing).

create type public.workspace_kind as enum ('agency', 'client');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind public.workspace_kind not null,
  name text not null check (char_length(name) between 1 and 160),
  client_id uuid unique references public.clients (id) on delete cascade,
  is_internal boolean not null default false,
  inherits_agency_plan boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'client') = (client_id is not null))
);

-- One operator agency per installation.
create unique index workspaces_single_agency_idx on public.workspaces ((kind)) where kind = 'agency';

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();

insert into public.workspaces (kind, name, is_internal) values ('agency', 'SUN MEDIA', true);
insert into public.workspaces (kind, name, client_id)
select 'client', c.name, c.id from public.clients c where c.deleted_at is null
on conflict (client_id) do nothing;

create or replace function private.client_workspace_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspaces (kind, name, client_id) values ('client', new.name, new.id)
  on conflict (client_id) do nothing;
  return null;
end;
$$;

create trigger clients_create_workspace after insert on public.clients
  for each row execute function private.client_workspace_on_insert();

-- ---------------------------------------------------------------------------
-- Plans and features (catalog, configurable by the Tizim egasi)
-- ---------------------------------------------------------------------------
create table public.saas_plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 500),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency char(3) not null default 'USD',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year', 'lifetime', 'none')),
  rank integer not null unique check (rank >= 0),
  is_public boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger saas_plans_updated_at before update on public.saas_plans
  for each row execute function private.set_updated_at();

create table public.saas_features (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  name text not null,
  description text not null default '',
  audience text not null check (audience in ('agency', 'client')),
  kind text not null check (kind in ('flag', 'limit')),
  position integer not null default 0
);

create table public.saas_plan_features (
  plan_key text not null references public.saas_plans (key) on delete cascade,
  feature_key text not null references public.saas_features (key) on delete cascade,
  enabled boolean not null default true,
  -- For limits: NULL = unlimited. For flags: ignored.
  limit_value integer check (limit_value >= 0),
  primary key (plan_key, feature_key)
);

insert into public.saas_plans (key, name, description, price_cents, currency, billing_interval, rank, is_public) values
  ('free', 'Free', 'Kichik jamoa uchun: 1 mijoz, 3 xodim, asosiy ish jarayoni.', 0, 'USD', 'none', 0, true),
  ('pro', 'SUN MEDIA Pro', 'Cheksiz mijoz va jamoa, Meta CRM, Instagram analytics, hisobotlar va brending.', 1999, 'USD', 'month', 10, true);

insert into public.saas_features (key, name, description, audience, kind, position) values
  ('clients.max', 'Mijozlar soni', 'Bir vaqtda faol mijozlar', 'agency', 'limit', 10),
  ('employees.max', 'Xodimlar soni', 'Faol xodimlar', 'agency', 'limit', 20),
  ('workflow.advanced', 'Kengaytirilgan ish jarayoni', 'Loyihalar, vazifa bog‘liqliklari va to‘liq Studiya', 'agency', 'flag', 30),
  ('permissions.advanced', 'Nozik ruxsatlar', 'Xodimga alohida ruxsatlar berish', 'agency', 'flag', 40),
  ('crm.meta', 'Meta Ads CRM', 'Meta’dan lidlarni avtomatik qabul qilish, mijozlarga yuborish va hisobot', 'agency', 'flag', 50),
  ('analytics.instagram', 'Instagram Analytics', 'Instagram statistikasi va eng yaxshi kontentlar', 'agency', 'flag', 60),
  ('reports.advanced', 'Hisobotlar', 'Oylik va CRM hisobotlari, PDF', 'agency', 'flag', 70),
  ('branding.custom', 'Brending', 'Mijoz logolari va markaziy logo', 'agency', 'flag', 80),
  ('files.advanced', 'Kengaytirilgan fayllar', 'Katta fayllar va papkalar', 'agency', 'flag', 90),
  ('audit.logs', 'Audit jurnali', 'Kim nimani o‘zgartirgani', 'agency', 'flag', 100),
  ('kpi.advanced', 'KPI', 'Xodimlar samaradorligi va reytinglar', 'agency', 'flag', 110),
  ('promo.tools', 'Promo va o‘yinlar', 'Promo kodlar va mijoz o‘yinlari', 'agency', 'flag', 120),
  ('client.analytics.history_days', 'Statistika tarixi (kun)', 'Mijoz ko‘ra oladigan Instagram tarixi', 'client', 'limit', 200),
  ('client.forecast', 'Taxminiy imkoniyat', 'Yuqori tarif prognozi', 'client', 'flag', 210);

insert into public.saas_plan_features (plan_key, feature_key, enabled, limit_value) values
  ('free', 'clients.max', true, 1),
  ('free', 'employees.max', true, 3),
  ('free', 'client.analytics.history_days', true, 30),
  ('pro', 'clients.max', true, null),
  ('pro', 'employees.max', true, null),
  ('pro', 'client.analytics.history_days', true, 365);
insert into public.saas_plan_features (plan_key, feature_key, enabled)
select 'pro', key, true from public.saas_features where kind = 'flag';
insert into public.saas_plan_features (plan_key, feature_key, enabled)
select 'free', key, false from public.saas_features where kind = 'flag';

-- ---------------------------------------------------------------------------
-- Subscriptions and their history
-- ---------------------------------------------------------------------------
create table public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_key text not null references public.saas_plans (key),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  source text not null check (source in ('internal', 'billing', 'promo', 'game', 'manual')),
  starts_at timestamptz not null default now(),
  -- NULL = no end (internal licence, or billing renews it).
  ends_at timestamptz,
  provider text check (char_length(provider) <= 40),
  provider_ref text check (char_length(provider_ref) <= 200),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index workspace_subscriptions_ws_idx on public.workspace_subscriptions (workspace_id, status);
create unique index workspace_subscriptions_provider_idx on public.workspace_subscriptions (provider, provider_ref) where provider_ref is not null;

create trigger workspace_subscriptions_updated_at before update on public.workspace_subscriptions
  for each row execute function private.set_updated_at();

create table public.subscription_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.workspace_subscriptions (id) on delete set null,
  type text not null check (type ~ '^[a-z][a-z0-9_.]*$'),
  data jsonb not null default '{}',
  -- Idempotency for billing webhooks.
  external_id text unique,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index subscription_events_ws_idx on public.subscription_events (workspace_id, created_at desc);

-- SUN MEDIA's own licence: internal, lifetime, never billed.
insert into public.workspace_subscriptions (workspace_id, plan_key, status, source, note)
select id, 'pro', 'active', 'internal', 'SUN MEDIA ichki litsenziyasi (lifetime)' from public.workspaces where kind = 'agency';
insert into public.subscription_events (workspace_id, type, data)
select id, 'subscription.internal_license', '{"plan": "pro"}' from public.workspaces where kind = 'agency';

-- ---------------------------------------------------------------------------
-- Entitlements
-- ---------------------------------------------------------------------------
create or replace function private.agency_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.workspaces where kind = 'agency' limit 1;
$$;

create or replace function private.client_workspace_id(p_client uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.workspaces where client_id = p_client;
$$;

-- The plan this workspace pays for / was given (highest active), or 'free'.
create or replace function private.workspace_own_plan(p_workspace uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan_key
    from public.workspace_subscriptions s
    join public.saas_plans p on p.key = s.plan_key and p.is_active
    where s.workspace_id = p_workspace and s.status = 'active'
      and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
    order by p.rank desc
    limit 1
  ), 'free');
$$;

-- Own plan, or the agency's when the client workspace inherits and the agency's is higher.
create or replace function private.workspace_plan(p_workspace uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
  v_own text;
  v_agency text;
begin
  select * into v_ws from public.workspaces where id = p_workspace;
  if not found then
    return 'free';
  end if;
  v_own := private.workspace_own_plan(p_workspace);
  if v_ws.kind = 'client' and v_ws.inherits_agency_plan then
    v_agency := private.workspace_own_plan(private.agency_workspace_id());
    if (select rank from public.saas_plans where key = v_agency) > (select rank from public.saas_plans where key = v_own) then
      return v_agency;
    end if;
  end if;
  return v_own;
end;
$$;

create or replace function private.feature_enabled(p_workspace uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pf.enabled from public.saas_plan_features pf
    where pf.plan_key = private.workspace_plan(p_workspace) and pf.feature_key = p_feature
  ), false);
$$;

-- NULL = unlimited (or a limit the plan does not define).
create or replace function private.feature_limit(p_workspace uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pf.limit_value from public.saas_plan_features pf
  where pf.plan_key = private.workspace_plan(p_workspace) and pf.feature_key = p_feature and pf.enabled;
$$;

-- Server-side gate used by feature RPCs. The apps turn P0402 into the Pro upgrade screen.
create or replace function private.require_feature(p_workspace uuid, p_feature text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.feature_enabled(p_workspace, p_feature) then
    raise exception 'PRO_REQUIRED:%', p_feature using errcode = 'P0402';
  end if;
end;
$$;

grant execute on function private.agency_workspace_id() to authenticated;
grant execute on function private.client_workspace_id(uuid) to authenticated;
grant execute on function private.workspace_plan(uuid) to authenticated;
grant execute on function private.feature_enabled(uuid, text) to authenticated;

-- The signed-in person's workspace (staff → agency; client → the given or first company) and what it unlocks.
create or replace function public.get_my_entitlements(p_client uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
  v_plan text;
  v_own text;
  v_sub public.workspace_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if private.is_staff() then
    select * into v_ws from public.workspaces where kind = 'agency';
  else
    select w.* into v_ws from public.workspaces w
    where w.client_id = any (private.member_client_ids()) and (p_client is null or w.client_id = p_client)
    order by w.created_at limit 1;
  end if;
  if v_ws.id is null then
    return jsonb_build_object('plan', jsonb_build_object('key', 'free'), 'features', '{}'::jsonb);
  end if;

  v_plan := private.workspace_plan(v_ws.id);
  v_own := private.workspace_own_plan(v_ws.id);
  select s.* into v_sub from public.workspace_subscriptions s
  where s.workspace_id = v_ws.id and s.status = 'active' and s.plan_key = v_own
    and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
  order by s.ends_at desc nulls first limit 1;

  return jsonb_build_object(
    'workspace', jsonb_build_object('id', v_ws.id, 'kind', v_ws.kind, 'name', v_ws.name, 'is_internal', v_ws.is_internal),
    'plan', (select jsonb_build_object('key', p.key, 'name', p.name, 'price_cents', p.price_cents, 'currency', p.currency, 'interval', p.billing_interval)
             from public.saas_plans p where p.key = v_plan),
    'inherited', v_plan <> v_own,
    'source', case when v_plan <> v_own then 'agency' else coalesce(v_sub.source, 'free') end,
    'ends_at', case when v_plan = v_own then v_sub.ends_at end,
    -- The client's own Pro (promo / game), shown even while the agency's plan covers it.
    'own', case when v_own <> 'free' then jsonb_build_object('plan', v_own, 'source', v_sub.source, 'ends_at', v_sub.ends_at) end,
    'features', (
      select coalesce(jsonb_object_agg(f.key, jsonb_build_object(
        'enabled', coalesce(pf.enabled, false), 'limit', pf.limit_value)), '{}'::jsonb)
      from public.saas_features f
      left join public.saas_plan_features pf on pf.feature_key = f.key and pf.plan_key = v_plan
    ),
    'pro', (select jsonb_build_object('key', p.key, 'name', p.name, 'price_cents', p.price_cents, 'currency', p.currency, 'interval', p.billing_interval)
            from public.saas_plans p where p.key = 'pro')
  );
end;
$$;

grant execute on function public.get_my_entitlements(uuid) to authenticated;
revoke all on function public.get_my_entitlements(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Limits enforced where the rows are created (not in the UI)
-- ---------------------------------------------------------------------------
create or replace function private.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := private.feature_limit(private.agency_workspace_id(), 'clients.max');
begin
  if v_limit is not null and (
    select count(*) from public.clients c where c.deleted_at is null and c.status in ('active', 'paused') and c.id <> new.id
  ) >= v_limit then
    raise exception 'PRO_REQUIRED:clients.max' using errcode = 'P0402';
  end if;
  return new;
end;
$$;

create trigger clients_enforce_plan_limit before insert on public.clients
  for each row execute function private.enforce_client_limit();

create or replace function private.enforce_employee_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := private.feature_limit(private.agency_workspace_id(), 'employees.max');
begin
  if v_limit is not null and (
    select count(*) from public.employees e where e.status <> 'terminated' and e.user_id <> new.user_id
  ) >= v_limit then
    raise exception 'PRO_REQUIRED:employees.max' using errcode = 'P0402';
  end if;
  return new;
end;
$$;

create trigger employees_enforce_plan_limit before insert on public.employees
  for each row execute function private.enforce_employee_limit();

-- ---------------------------------------------------------------------------
-- Upgrade requests and billing abstraction
-- ---------------------------------------------------------------------------
-- "Pro’ga o‘tish" without a configured checkout: the request reaches the Tizim egasi (no payment in the app).
create or replace function public.request_pro_upgrade(p_feature text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  v_ws := coalesce(
    case when private.is_staff() then private.agency_workspace_id() end,
    (select w.id from public.workspaces w where w.client_id = any (private.member_client_ids()) limit 1)
  );
  if v_ws is null then
    raise exception 'No workspace' using errcode = '42501';
  end if;
  -- One request a day per person is enough.
  if exists (select 1 from public.subscription_events e where e.workspace_id = v_ws and e.actor_id = auth.uid()
             and e.type = 'upgrade.requested' and e.created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.subscription_events (workspace_id, type, data, actor_id)
  values (v_ws, 'upgrade.requested', jsonb_build_object('feature', p_feature), auth.uid());
  select full_name into v_name from public.profiles where id = auth.uid();
  perform private.notify(
    private.users_with_roles(array['system_owner']),
    'subscription.upgrade_request', 'Pro so‘rovi',
    coalesce(v_name, 'Foydalanuvchi') || ' (' || (select name from public.workspaces where id = v_ws) || ') SUN MEDIA Pro’ga o‘tmoqchi.',
    jsonb_build_object('route', '/system/subscriptions', 'workspace_id', v_ws), 'workspaces', v_ws, null, 'normal', true
  );
end;
$$;

grant execute on function public.request_pro_upgrade(text) to authenticated;
revoke all on function public.request_pro_upgrade(text) from anon;

-- Any payment provider's webhook (Stripe, Payme, Click…) maps its event to this, once per external event id.
create or replace function public.apply_billing_event(
  p_provider text, p_event_id text, p_workspace uuid, p_plan text, p_status text, p_period_end timestamptz, p_subscription_ref text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
begin
  if exists (select 1 from public.subscription_events where external_id = p_provider || ':' || p_event_id) then
    return (select subscription_id from public.subscription_events where external_id = p_provider || ':' || p_event_id);
  end if;
  insert into public.workspace_subscriptions (workspace_id, plan_key, status, source, ends_at, provider, provider_ref)
  values (p_workspace, p_plan, case when p_status in ('active', 'cancelled', 'expired') then p_status else 'active' end,
          'billing', p_period_end, p_provider, p_subscription_ref)
  on conflict (provider, provider_ref) where provider_ref is not null do update
  set plan_key = excluded.plan_key, status = excluded.status, ends_at = excluded.ends_at
  returning id into v_sub;
  insert into public.subscription_events (workspace_id, subscription_id, type, data, external_id)
  values (p_workspace, v_sub, 'billing.' || p_status, jsonb_build_object('provider', p_provider, 'plan', p_plan, 'period_end', p_period_end),
          p_provider || ':' || p_event_id);
  return v_sub;
end;
$$;

revoke all on function public.apply_billing_event(text, text, uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_billing_event(text, text, uuid, text, text, timestamptz, text) to service_role;

-- Tizim egasi: give or end a subscription by hand (e.g. a paid invoice, a partner agency).
create or replace function public.grant_workspace_plan(p_workspace uuid, p_plan text, p_days integer, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role('system_owner') then
    raise exception 'Only the Tizim egasi manages subscriptions' using errcode = '42501';
  end if;
  insert into public.workspace_subscriptions (workspace_id, plan_key, status, source, ends_at, note, created_by)
  values (p_workspace, p_plan, 'active', 'manual', case when p_days is null then null else now() + make_interval(days => p_days) end,
          nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;
  insert into public.subscription_events (workspace_id, subscription_id, type, data, actor_id)
  values (p_workspace, v_id, 'subscription.granted', jsonb_build_object('plan', p_plan, 'days', p_days), auth.uid());
  return v_id;
end;
$$;

create or replace function public.end_workspace_subscription(p_subscription uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.workspace_subscriptions;
begin
  if not private.has_role('system_owner') then
    raise exception 'Only the Tizim egasi manages subscriptions' using errcode = '42501';
  end if;
  select * into v_sub from public.workspace_subscriptions where id = p_subscription;
  if v_sub.source = 'internal' then
    raise exception 'The internal licence cannot be ended' using errcode = '42501';
  end if;
  update public.workspace_subscriptions set status = 'cancelled', ends_at = least(coalesce(ends_at, now()), now() + interval '1 second')
  where id = p_subscription;
  insert into public.subscription_events (workspace_id, subscription_id, type, actor_id)
  values (v_sub.workspace_id, p_subscription, 'subscription.cancelled', auth.uid());
end;
$$;

grant execute on function public.grant_workspace_plan(uuid, text, integer, text) to authenticated;
grant execute on function public.end_workspace_subscription(uuid) to authenticated;
revoke all on function public.grant_workspace_plan(uuid, text, integer, text) from anon;
revoke all on function public.end_workspace_subscription(uuid) from anon;

create or replace function private.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.workspace_subscriptions set status = 'expired'
    where status = 'active' and ends_at is not null and ends_at <= now()
    returning id, workspace_id, plan_key
  ), logged as (
    insert into public.subscription_events (workspace_id, subscription_id, type, data)
    select workspace_id, id, 'subscription.expired', jsonb_build_object('plan', plan_key) from expired
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

select cron.schedule('sunmedia-expire-subscriptions', '*/30 * * * *', $$select private.expire_subscriptions()$$);

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, name, scope) values
  ('promo.manage', 'commercial', 'Promo kodlar va mijoz o‘yinlari', 'staff')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_key)
select id, 'promo.manage' from public.roles where key = 'admin'
on conflict do nothing;

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  plan_key text not null default 'pro' references public.saas_plans (key),
  reward_days integer not null check (reward_days between 1 and 3650),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  -- NULL = no global cap. per_user / per_workspace: how many times one person / company may use it.
  max_redemptions integer check (max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  per_workspace_limit integer not null default 1 check (per_workspace_limit > 0),
  audience text not null default 'everyone' check (audience in ('everyone', 'new_users', 'clients', 'agency')),
  new_user_days integer not null default 14 check (new_user_days between 1 and 365),
  eligible_client_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create trigger promo_codes_updated_at before update on public.promo_codes
  for each row execute function private.set_updated_at();

create or replace function private.promo_codes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.redemption_count := 0;
  elsif not private.is_privileged_context() then
    new.redemption_count := old.redemption_count;
  end if;
  return new;
end;
$$;

create trigger promo_codes_10_before_write before insert or update on public.promo_codes
  for each row execute function private.promo_codes_before_write();

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.workspace_subscriptions (id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create index promo_redemptions_promo_idx on public.promo_redemptions (promo_id, user_id);

-- Failed attempts, to stop guessing codes.
create table private.promo_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index promo_attempts_user_idx on private.promo_attempts (user_id, attempted_at desc);
revoke all on private.promo_attempts from public, anon, authenticated;

-- Extends (never shortens) the workspace's own subscription of the plan by p_days; returns the new row.
create or replace function private.extend_workspace_plan(p_workspace uuid, p_plan text, p_days integer, p_source text, p_note text)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_row public.workspace_subscriptions;
begin
  select greatest(now(), max(s.ends_at)) into v_from
  from public.workspace_subscriptions s
  where s.workspace_id = p_workspace and s.plan_key = p_plan and s.status = 'active' and s.ends_at > now();
  v_from := coalesce(v_from, now());
  insert into public.workspace_subscriptions (workspace_id, plan_key, status, source, starts_at, ends_at, note, created_by)
  values (p_workspace, p_plan, 'active', p_source, v_from, v_from + make_interval(days => p_days), p_note, auth.uid())
  returning * into v_row;
  insert into public.subscription_events (workspace_id, subscription_id, type, data, actor_id)
  values (p_workspace, v_row.id, 'subscription.extended', jsonb_build_object('plan', p_plan, 'days', p_days, 'source', p_source), auth.uid());
  return v_row;
end;
$$;

-- Akkaunt → Promo kod.
create or replace function public.redeem_promo(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_promo public.promo_codes;
  v_ws public.workspaces;
  v_is_staff boolean := private.is_staff();
  v_profile public.profiles;
  v_sub public.workspace_subscriptions;
  v_plan_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if (select count(*) from private.promo_attempts a where a.user_id = v_uid and not a.success and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'PROMO_RATE_LIMIT' using errcode = 'P0429';
  end if;

  select * into v_promo from public.promo_codes
  where code = v_code and is_active and starts_at <= now() and (expires_at is null or expires_at > now())
  for update;
  if not found then
    insert into private.promo_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_is_staff then
    select * into v_ws from public.workspaces where kind = 'agency';
  else
    select w.* into v_ws from public.workspaces w
    where w.client_id = any (private.member_client_ids())
      and (cardinality(v_promo.eligible_client_ids) = 0 or w.client_id = any (v_promo.eligible_client_ids))
    order by w.created_at limit 1;
  end if;
  select * into v_profile from public.profiles where id = v_uid;

  if v_ws.id is null
     or (v_promo.audience = 'clients' and v_is_staff)
     or (v_promo.audience = 'agency' and not v_is_staff)
     or (v_promo.audience = 'new_users' and v_profile.created_at < now() - make_interval(days => v_promo.new_user_days)) then
    insert into private.promo_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  if (select count(*) from public.promo_redemptions r where r.promo_id = v_promo.id and r.user_id = v_uid) >= v_promo.per_user_limit
     or (select count(*) from public.promo_redemptions r where r.promo_id = v_promo.id and r.workspace_id = v_ws.id) >= v_promo.per_workspace_limit then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_promo.max_redemptions is not null and v_promo.redemption_count >= v_promo.max_redemptions then
    return jsonb_build_object('ok', false, 'reason', 'used_up');
  end if;

  v_sub := private.extend_workspace_plan(v_ws.id, v_promo.plan_key, v_promo.reward_days, 'promo', 'Promo ' || v_promo.code);
  insert into public.promo_redemptions (promo_id, user_id, workspace_id, subscription_id) values (v_promo.id, v_uid, v_ws.id, v_sub.id);
  update public.promo_codes set redemption_count = redemption_count + 1 where id = v_promo.id;
  insert into private.promo_attempts (user_id, success) values (v_uid, true);

  select name into v_plan_name from public.saas_plans where key = v_promo.plan_key;
  perform private.notify(array[v_uid], 'promo.redeemed',
    v_promo.reward_days || ' kunlik ' || v_plan_name || ' faollashtirildi',
    to_char(v_sub.ends_at at time zone private.agency_timezone(), 'DD.MM.YYYY') || ' gacha amal qiladi.',
    jsonb_build_object('route', '/account'), 'promo_codes', v_promo.id, null, 'normal', true);
  return jsonb_build_object('ok', true, 'plan', v_plan_name, 'days', v_promo.reward_days, 'ends_at', v_sub.ends_at, 'title', v_promo.title);
end;
$$;

grant execute on function public.redeem_promo(text) to authenticated;
revoke all on function public.redeem_promo(text) from anon;

-- ---------------------------------------------------------------------------
-- Gates on existing Pro features (the internal SUN MEDIA licence keeps them all open)
-- ---------------------------------------------------------------------------
create or replace function private.require_agency_feature(p_feature text)
returns void
language sql
stable
security definer
set search_path = ''
as $$
  select private.require_feature(private.agency_workspace_id(), p_feature);
$$;
grant execute on function private.require_agency_feature(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.saas_plans enable row level security;
alter table public.saas_features enable row level security;
alter table public.saas_plan_features enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

revoke insert, update, delete on public.workspaces, public.workspace_subscriptions, public.subscription_events,
  public.promo_redemptions from anon, authenticated;
revoke insert, update, delete on public.saas_plans, public.saas_features, public.saas_plan_features, public.promo_codes from anon;

-- The plan catalogue is shown on upgrade screens to every signed-in person.
create policy "read plan catalogue" on public.saas_plans for select to authenticated using (true);
create policy "read feature catalogue" on public.saas_features for select to authenticated using (true);
create policy "read plan features" on public.saas_plan_features for select to authenticated using (true);
create policy "system owner edits plans" on public.saas_plans for update to authenticated
  using ((select private.has_role('system_owner'))) with check ((select private.has_role('system_owner')));
create policy "system owner edits plan features" on public.saas_plan_features for all to authenticated
  using ((select private.has_role('system_owner'))) with check ((select private.has_role('system_owner')));

create policy "read own or managed workspaces" on public.workspaces for select to authenticated using (
  (select private.has_role('system_owner'))
  or (kind = 'agency' and (select private.is_staff()))
  or client_id = any ((select private.accessible_client_ids())::uuid[])
  or (select private.sees_all_clients())
);
create policy "system owner reads subscriptions" on public.workspace_subscriptions for select to authenticated using (
  (select private.has_role('system_owner'))
);
create policy "system owner reads subscription events" on public.subscription_events for select to authenticated using (
  (select private.has_role('system_owner'))
);

create policy "promo managers read codes" on public.promo_codes for select to authenticated using ((select private.has_permission('promo.manage')));
create policy "promo managers create codes" on public.promo_codes for insert to authenticated with check ((select private.has_permission('promo.manage')));
create policy "promo managers update codes" on public.promo_codes for update to authenticated
  using ((select private.has_permission('promo.manage'))) with check ((select private.has_permission('promo.manage')));
create policy "promo managers read redemptions" on public.promo_redemptions for select to authenticated using (
  (select private.has_permission('promo.manage')) or user_id = (select auth.uid())
);
-- No delete: codes are deactivated, so their history stays.
revoke delete on public.promo_codes from authenticated;

create trigger audit_promo_codes after insert or update on public.promo_codes
  for each row execute function private.audit_row();
create trigger audit_workspace_subscriptions after insert or update on public.workspace_subscriptions
  for each row execute function private.audit_row();
