-- SUN MEDIA — tariffs, client subscriptions, quotas, usage ledger, upgrade requests, contracts.

-- Catalogue of countable services a plan can include.
create table public.service_types (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  unit text not null default 'dona',
  -- Content types that consume this service automatically
  content_types public.content_type[] not null default '{}',
  -- When usage is recorded: on content 'published' / 'approved', on completed shooting, or manually
  counts_on text not null default 'manual' check (counts_on in ('published', 'approved', 'shooting_completed', 'manual')),
  is_quantitative boolean not null default true,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_types_updated_at
  before update on public.service_types
  for each row execute function private.set_updated_at();

insert into public.service_types (key, name, unit, content_types, counts_on, is_quantitative, position) values
  ('reels', 'Reels', 'dona', '{reel}', 'published', true, 10),
  ('posts', 'Postlar', 'dona', '{post,carousel}', 'published', true, 20),
  ('stories', 'Stories', 'dona', '{story}', 'published', true, 30),
  ('videos', 'Videolar', 'dona', '{video}', 'published', true, 40),
  ('shooting_days', 'Syomka kunlari', 'kun', '{}', 'shooting_completed', true, 50),
  ('designs', 'Dizaynlar', 'dona', '{design}', 'approved', true, 60),
  ('ad_creatives', 'Reklama kreativlari', 'dona', '{ad_creative}', 'approved', true, 70),
  ('copywriting', 'Kopirayting', 'dona', '{}', 'manual', true, 80),
  ('editing', 'Montaj', 'dona', '{}', 'manual', true, 90),
  ('strategy', 'Strategiya', 'xizmat', '{}', 'manual', false, 100),
  ('report', 'Oylik hisobot', 'xizmat', '{}', 'manual', false, 110),
  ('account_manager', 'Account manager', 'xizmat', '{}', 'manual', false, 120),
  ('additional', 'Qo''shimcha xizmatlar', 'xizmat', '{}', 'manual', false, 130);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  description text,
  price numeric(14, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'UZS',
  duration_months integer not null default 1 check (duration_months between 1 and 36),
  is_public boolean not null default true,
  -- Custom plans are built for a single client and hidden from others
  client_id uuid references public.clients (id) on delete cascade,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (client_id is null or not is_public)
);

create trigger plans_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

create table public.plan_features (
  plan_id uuid not null references public.plans (id) on delete cascade,
  service_key text not null references public.service_types (key) on delete restrict,
  quantity integer check (quantity >= 0),
  is_included boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, service_key)
);

create trigger plan_features_updated_at
  before update on public.plan_features
  for each row execute function private.set_updated_at();

create table public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status public.subscription_status not null default 'active',
  starts_on date not null,
  ends_on date not null,
  price numeric(14, 2) not null check (price >= 0),
  currency char(3) not null default 'UZS',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  constraint client_subscriptions_no_overlap exclude using gist (
    client_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status in ('scheduled', 'active'))
);

create index client_subscriptions_client_idx on public.client_subscriptions (client_id, starts_on desc);

create trigger client_subscriptions_updated_at
  before update on public.client_subscriptions
  for each row execute function private.set_updated_at();

-- Quotas are snapshotted from the plan when the subscription is created, so later plan edits
-- never change what a client already bought.
create table public.subscription_quotas (
  subscription_id uuid not null references public.client_subscriptions (id) on delete cascade,
  service_key text not null references public.service_types (key) on delete restrict,
  quantity integer check (quantity >= 0),
  is_included boolean not null default true,
  note text,
  primary key (subscription_id, service_key)
);

create table public.client_plan_usage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  subscription_id uuid references public.client_subscriptions (id) on delete set null,
  service_key text not null references public.service_types (key) on delete restrict,
  quantity integer not null check (quantity <> 0),
  source public.usage_source not null default 'manual',
  content_id uuid references public.content_items (id) on delete set null,
  shooting_id uuid references public.shootings (id) on delete set null,
  occurred_on date not null default private.agency_today(),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index client_plan_usage_auto_content_idx
  on public.client_plan_usage (service_key, content_id) where source = 'auto' and content_id is not null;
create unique index client_plan_usage_auto_shooting_idx
  on public.client_plan_usage (service_key, shooting_id) where source = 'auto' and shooting_id is not null;
create index client_plan_usage_client_date_idx on public.client_plan_usage (client_id, occurred_on);
create index client_plan_usage_subscription_idx on public.client_plan_usage (subscription_id);

create table public.plan_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  current_subscription_id uuid references public.client_subscriptions (id) on delete set null,
  requested_plan_id uuid not null references public.plans (id) on delete restrict,
  message text check (char_length(message) <= 2000),
  status public.request_status not null default 'pending',
  requested_by uuid references public.profiles (id) on delete set null,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  response text check (char_length(response) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index plan_upgrade_requests_one_pending_idx on public.plan_upgrade_requests (client_id) where status = 'pending';

create trigger plan_upgrade_requests_updated_at
  before update on public.plan_upgrade_requests
  for each row execute function private.set_updated_at();

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  number text not null check (char_length(number) between 1 and 60),
  title text,
  starts_on date not null,
  ends_on date,
  amount numeric(14, 2) check (amount >= 0),
  currency char(3) not null default 'UZS',
  status public.contract_status not null default 'draft',
  file_id uuid references public.files (id) on delete set null,
  signed_on date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (client_id, number),
  check (ends_on is null or ends_on >= starts_on)
);

create trigger contracts_updated_at
  before update on public.contracts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Behaviour
-- ---------------------------------------------------------------------------
create or replace function private.snapshot_subscription_quotas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscription_quotas (subscription_id, service_key, quantity, is_included, note)
  select new.id, pf.service_key, pf.quantity, pf.is_included, pf.note
  from public.plan_features pf
  where pf.plan_id = new.plan_id
  on conflict do nothing;
  return null;
end;
$$;

create trigger client_subscriptions_snapshot_quotas
  after insert on public.client_subscriptions
  for each row execute function private.snapshot_subscription_quotas();

create or replace function private.subscription_for_date(p_client uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.client_subscriptions
  where client_id = p_client
    and status in ('active', 'expired', 'scheduled')
    and p_date between starts_on and ends_on
  order by case status when 'active' then 0 when 'scheduled' then 1 else 2 end, starts_on desc
  limit 1;
$$;

grant execute on function private.subscription_for_date(uuid, date) to authenticated;

create or replace function private.record_content_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.service_types;
  v_date date;
begin
  if not new.counts_toward_plan or new.deleted_at is not null or new.status = old.status then
    return null;
  end if;
  for v_type in
    select * from public.service_types st
    where new.content_type = any (st.content_types)
      and st.is_active
      and ((st.counts_on = 'published' and new.status = 'published')
        or (st.counts_on = 'approved' and new.status = 'approved'))
  loop
    v_date := (coalesce(case when new.status = 'published' then new.published_at else new.approved_at end, now())
               at time zone private.agency_timezone())::date;
    insert into public.client_plan_usage (client_id, subscription_id, service_key, quantity, source, content_id, occurred_on)
    values (new.client_id, private.subscription_for_date(new.client_id, v_date), v_type.key, 1, 'auto', new.id, v_date)
    on conflict do nothing;
  end loop;
  return null;
end;
$$;

create trigger content_items_record_usage
  after update of status on public.content_items
  for each row execute function private.record_content_usage();

create or replace function private.record_shooting_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.deleted_at is null then
    v_date := (new.starts_at at time zone private.agency_timezone())::date;
    insert into public.client_plan_usage (client_id, subscription_id, service_key, quantity, source, shooting_id, occurred_on)
    select new.client_id, private.subscription_for_date(new.client_id, v_date), st.key, 1, 'auto', new.id, v_date
    from public.service_types st
    where st.counts_on = 'shooting_completed' and st.is_active
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger shootings_record_usage
  after update of status on public.shootings
  for each row execute function private.record_shooting_usage();

create or replace function private.client_plan_usage_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_context() then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.source = 'auto' then
    raise exception 'Automatic usage entries cannot be edited; add a manual correction instead' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new.source := 'manual';
    new.created_by := auth.uid();
    if new.subscription_id is null then
      new.subscription_id := private.subscription_for_date(new.client_id, new.occurred_on);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger client_plan_usage_10_before_write
  before insert or update or delete on public.client_plan_usage
  for each row execute function private.client_plan_usage_before_write();

create or replace function private.plan_upgrade_requests_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.status := 'pending';
    new.handled_by := null;
    new.handled_at := null;
    new.response := null;
    new.current_subscription_id := private.subscription_for_date(new.client_id, private.agency_today());
    return new;
  end if;
  if private.can_manage_client(old.client_id, 'subscriptions.manage') then
    if new.status is distinct from old.status then
      new.handled_by := auth.uid();
      new.handled_at := now();
    end if;
    return new;
  end if;
  -- Client side: only cancel their own pending request
  if old.status <> 'pending' or new.status <> 'cancelled'
     or (to_jsonb(new) - array['status', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'You can only cancel a pending request' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger plan_upgrade_requests_10_before_write
  before insert or update on public.plan_upgrade_requests
  for each row execute function private.plan_upgrade_requests_before_write();

-- Daily status maintenance (scheduled → active → expired).
create or replace function private.refresh_subscription_statuses()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.client_subscriptions set status = 'expired'
  where status = 'active' and ends_on < private.agency_today();
  update public.client_subscriptions set status = 'active'
  where status = 'scheduled' and starts_on <= private.agency_today() and ends_on >= private.agency_today();
  update public.contracts set status = 'expired'
  where status = 'active' and ends_on is not null and ends_on < private.agency_today();
$$;

select cron.schedule('sunmedia-subscription-statuses', '5 0 * * *', $$select private.refresh_subscription_statuses()$$);

-- Planned vs used per service for a subscription.
create or replace view public.subscription_usage_summary
with (security_invoker = true) as
select
  s.id as subscription_id,
  s.client_id,
  k.service_key,
  st.name as service_name,
  st.unit,
  st.position,
  st.is_quantitative,
  q.quantity as planned,
  coalesce(q.is_included, false) as is_included,
  coalesce((
    select sum(u.quantity) from public.client_plan_usage u
    where u.subscription_id = s.id and u.service_key = k.service_key
  ), 0)::integer as used
from public.client_subscriptions s
cross join lateral (
  select sq.service_key from public.subscription_quotas sq where sq.subscription_id = s.id
  union
  select u.service_key from public.client_plan_usage u where u.subscription_id = s.id
) k
join public.service_types st on st.key = k.service_key
left join public.subscription_quotas q on q.subscription_id = s.id and q.service_key = k.service_key;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_plans after insert or update or delete on public.plans
  for each row execute function private.audit_row();
create trigger audit_plan_features after insert or update or delete on public.plan_features
  for each row execute function private.audit_row('plan_id', 'service_key');
create trigger audit_client_subscriptions after insert or update or delete on public.client_subscriptions
  for each row execute function private.audit_row();
create trigger audit_subscription_quotas after update or delete on public.subscription_quotas
  for each row execute function private.audit_row('subscription_id', 'service_key');
create trigger audit_client_plan_usage after insert or update or delete on public.client_plan_usage
  for each row execute function private.audit_row();
create trigger audit_plan_upgrade_requests after insert or update on public.plan_upgrade_requests
  for each row execute function private.audit_row();
create trigger audit_contracts after insert or update or delete on public.contracts
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.service_types enable row level security;
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.subscription_quotas enable row level security;
alter table public.client_plan_usage enable row level security;
alter table public.plan_upgrade_requests enable row level security;
alter table public.contracts enable row level security;

-- Who may see a client's subscription, quotas and usage
create or replace function private.can_view_subscription_of(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_client(p_client, 'subscriptions.read')
    or private.has_client_permission(p_client, 'client.plan.view');
$$;

grant execute on function private.can_view_subscription_of(uuid) to authenticated;

create policy "read service types" on public.service_types
  for select to authenticated using ((select private.is_active_user()));
create policy "plan managers write service types" on public.service_types
  for update to authenticated
  using ((select private.has_permission('plans.manage')))
  with check ((select private.has_permission('plans.manage')));

create policy "read plans" on public.plans
  for select to authenticated using (
    (select private.is_staff())
    or (is_public and is_active and deleted_at is null)
    or client_id = any ((select private.member_client_ids())::uuid[])
    or exists (
      select 1 from public.client_subscriptions s
      where s.plan_id = plans.id and s.client_id = any ((select private.member_client_ids())::uuid[])
    )
  );
create policy "create plans" on public.plans
  for insert to authenticated with check ((select private.has_permission('plans.manage')));
create policy "update plans" on public.plans
  for update to authenticated
  using ((select private.has_permission('plans.manage')))
  with check ((select private.has_permission('plans.manage')));

create policy "read plan features" on public.plan_features
  for select to authenticated using (exists (select 1 from public.plans p where p.id = plan_id));
create policy "add plan features" on public.plan_features
  for insert to authenticated with check ((select private.has_permission('plans.manage')));
create policy "update plan features" on public.plan_features
  for update to authenticated
  using ((select private.has_permission('plans.manage')))
  with check ((select private.has_permission('plans.manage')));
create policy "remove plan features" on public.plan_features
  for delete to authenticated using ((select private.has_permission('plans.manage')));

create policy "read subscriptions" on public.client_subscriptions
  for select to authenticated using (private.can_view_subscription_of(client_id));
create policy "create subscriptions" on public.client_subscriptions
  for insert to authenticated with check (private.can_manage_client(client_id, 'subscriptions.manage'));
create policy "update subscriptions" on public.client_subscriptions
  for update to authenticated
  using (private.can_manage_client(client_id, 'subscriptions.manage'))
  with check (private.can_manage_client(client_id, 'subscriptions.manage'));

create policy "read quotas" on public.subscription_quotas
  for select to authenticated using (
    exists (select 1 from public.client_subscriptions s where s.id = subscription_id)
  );
create policy "adjust quotas" on public.subscription_quotas
  for insert to authenticated with check (exists (
    select 1 from public.client_subscriptions s
    where s.id = subscription_id and private.can_manage_client(s.client_id, 'subscriptions.manage')
  ));
create policy "update quotas" on public.subscription_quotas
  for update to authenticated
  using (exists (
    select 1 from public.client_subscriptions s
    where s.id = subscription_id and private.can_manage_client(s.client_id, 'subscriptions.manage')
  ))
  with check (exists (
    select 1 from public.client_subscriptions s
    where s.id = subscription_id and private.can_manage_client(s.client_id, 'subscriptions.manage')
  ));
create policy "remove quotas" on public.subscription_quotas
  for delete to authenticated using (exists (
    select 1 from public.client_subscriptions s
    where s.id = subscription_id and private.can_manage_client(s.client_id, 'subscriptions.manage')
  ));

create policy "read usage" on public.client_plan_usage
  for select to authenticated using (private.can_view_subscription_of(client_id));
create policy "record manual usage" on public.client_plan_usage
  for insert to authenticated with check (private.can_manage_client(client_id, 'subscriptions.manage'));
create policy "correct manual usage" on public.client_plan_usage
  for update to authenticated
  using (private.can_manage_client(client_id, 'subscriptions.manage'))
  with check (private.can_manage_client(client_id, 'subscriptions.manage'));
create policy "delete manual usage" on public.client_plan_usage
  for delete to authenticated using (private.can_manage_client(client_id, 'subscriptions.manage'));

create policy "read upgrade requests" on public.plan_upgrade_requests
  for select to authenticated using (
    private.can_manage_client(client_id, 'subscriptions.read')
    or private.has_client_permission(client_id, 'client.plan.view')
  );
create policy "clients request upgrades" on public.plan_upgrade_requests
  for insert to authenticated with check (
    private.has_client_permission(client_id, 'client.plan.request_upgrade')
    and exists (select 1 from public.plans p where p.id = requested_plan_id)
  );
create policy "handle upgrade requests" on public.plan_upgrade_requests
  for update to authenticated
  using (
    private.can_manage_client(client_id, 'subscriptions.manage')
    or (requested_by = (select auth.uid()) and status = 'pending')
  )
  with check (
    private.can_manage_client(client_id, 'subscriptions.manage')
    or requested_by = (select auth.uid())
  );

create policy "read contracts" on public.contracts
  for select to authenticated using (
    (deleted_at is null or (select private.has_permission('contracts.manage')))
    and (
      private.can_manage_client(client_id, 'contracts.manage')
      or (select private.has_permission('finance.read'))
      or (private.has_client_permission(client_id, 'client.contracts.view') and status <> 'draft' and deleted_at is null)
    )
  );
create policy "create contracts" on public.contracts
  for insert to authenticated with check (private.can_manage_client(client_id, 'contracts.manage'));
create policy "update contracts" on public.contracts
  for update to authenticated
  using (private.can_manage_client(client_id, 'contracts.manage'))
  with check (private.can_manage_client(client_id, 'contracts.manage'));
