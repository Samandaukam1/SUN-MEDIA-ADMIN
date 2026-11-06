-- SUN MEDIA — Smm Api, second step (additive; existing orders and catalogue copies are kept as they are):
--   * Split plans: one confirmed total → parts within the live min/max, each sent as its own ordinary order at its time
--     by the server (pg_cron → /api/smm/worker), never by a browser timer. A part's submission id is reserved with the
--     part, so a part can reach the provider at most once from our side.
--   * One active order per (provider account + service + canonical target): neosmm_queue holds the key itself. Manual
--     orders and plan parts take it the same way; a part that is being prepared, sent, in progress or whose result is
--     unclear keeps it. Only a recorded final status (or a certain rejection) frees it.
--   * Service health from evidence only (accepted / completed orders, explicit provider refusals of the service id,
--     absence from a successful catalogue, the owner's own switch); the owner's verified refill terms per service.
--   * Instagram profile cards: one profile per account, many orders; observations always carry their source and time.
--   * Recent targets for suggestions (hidden, never deleted, when the owner removes one).
-- Row-level security on and no grants to anon / authenticated, as for neosmm_orders: only the server reaches these,
-- after checking the signed-in person (or the plan's owner, for the worker) is one of the configured owners.

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles and observations
-- ---------------------------------------------------------------------------------------------------------------
create table public.neosmm_profiles (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram' check (platform = 'instagram'),
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  -- Only from a permitted API that returns it; never guessed from a link.
  ig_user_id text unique check (ig_user_id ~ '^[0-9]{1,40}$'),
  display_name text check (char_length(display_name) <= 150),
  display_name_source text check (display_name_source in ('manual', 'instagram_api')),
  avatar_url text check (char_length(avatar_url) <= 2000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, username)
);

create trigger neosmm_profiles_updated_at
  before update on public.neosmm_profiles
  for each row execute function private.set_updated_at();

-- A measured fact about a profile at a moment. NULL = not obtained (never a zero placeholder).
create table public.neosmm_profile_observations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.neosmm_profiles (id) on delete cascade,
  observed_at timestamptz not null,
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  media_count bigint check (media_count >= 0),
  display_name text check (char_length(display_name) <= 150),
  source text not null check (source in ('manual', 'instagram_api')),
  origin text not null check (char_length(origin) between 1 and 200),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (followers is not null or following is not null or media_count is not null or display_name is not null),
  check (observed_at <= created_at + interval '5 minutes')
);

create index neosmm_profile_observations_idx on public.neosmm_profile_observations (profile_id, observed_at desc);

create table public.neosmm_recent_targets (
  target_key text primary key check (char_length(target_key) <= 600),
  platform text not null check (char_length(platform) <= 40),
  target text not null check (char_length(target) <= 500),
  kind text not null check (kind in ('profile', 'post', 'link')),
  username text check (char_length(username) <= 64),
  profile_id uuid references public.neosmm_profiles (id) on delete set null,
  last_used_at timestamptz not null default now(),
  use_count integer not null default 1 check (use_count > 0),
  -- Removed from suggestions by the owner; the orders that used it stay.
  hidden_at timestamptz
);

create index neosmm_recent_targets_used_idx on public.neosmm_recent_targets (last_used_at desc) where hidden_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Service health (evidence) and the owner's verified refill terms
-- ---------------------------------------------------------------------------------------------------------------
create table public.neosmm_service_health (
  provider text not null default 'neosmm' check (provider = 'neosmm'),
  service_id bigint not null check (service_id > 0),
  service_name text check (char_length(service_name) <= 500),
  service_category text check (char_length(service_category) <= 200),
  last_accepted_at timestamptz,
  last_accepted_order uuid,
  last_completed_at timestamptz,
  last_completed_order uuid,
  -- The provider refused this service id after we sent its own catalogue value (Incorrect / Invalid service ID).
  blocked_at timestamptz,
  blocked_reason text check (char_length(blocked_reason) <= 1000),
  blocked_order uuid,
  -- Absent from a successful fresh catalogue (a failed fetch never sets it).
  missing_since timestamptz,
  last_seen_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles (id) on delete set null,
  -- The owner cleared a block: only evidence after this moment counts again.
  cleared_at timestamptz,
  cleared_by uuid references public.profiles (id) on delete set null,
  refill_days integer check (refill_days between 1 and 3650),
  refill_starts text check (refill_starts in ('accepted', 'completed')),
  refill_basis text check (char_length(refill_basis) <= 500),
  refill_verified_by uuid references public.profiles (id) on delete set null,
  refill_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, service_id),
  check ((refill_days is null) = (refill_starts is null) and (refill_days is null) = (refill_verified_at is null))
);

create trigger neosmm_service_health_updated_at
  before update on public.neosmm_service_health
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Plans, parts and the queue
-- ---------------------------------------------------------------------------------------------------------------
create table public.neosmm_plans (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  provider text not null default 'neosmm' check (provider = 'neosmm'),
  -- split: the owner's split plan; queued: one manual order waiting for the previous one on the same target.
  origin text not null check (origin in ('split', 'queued')),
  service_id bigint not null check (service_id > 0),
  service_name text not null check (char_length(service_name) <= 500),
  service_category text check (char_length(service_category) <= 200),
  service_type text check (char_length(service_type) <= 80),
  target text not null check (char_length(target) <= 500),
  target_key text not null check (char_length(target_key) <= 600),
  queue_key text not null check (char_length(queue_key) <= 700),
  profile_id uuid references public.neosmm_profiles (id) on delete set null,
  -- Provider parameters except action and quantity (service, link, and e.g. comments for a queued manual order).
  params jsonb not null default '{}',
  total_quantity integer not null check (total_quantity > 0),
  part_count integer not null check (part_count between 1 and 50),
  spacing_seconds integer not null check (spacing_seconds >= 0),
  start_at timestamptz not null,
  window_seconds integer not null check (window_seconds >= 0),
  -- The confirmed price basis: a part is never sent at a higher tariff without a new review.
  price text not null check (price ~ '^\d+(\.\d+)?$'),
  price_unit integer not null check (price_unit > 0),
  currency text not null default 'UZS' check (currency ~ '^[A-Z]{3}$'),
  estimate text not null check (estimate ~ '^\d+(\.\d+)?$'),
  can_cancel boolean not null default false,
  can_refill boolean not null default false,
  refill_policy jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'completed')),
  pause_reason text check (char_length(pause_reason) <= 500),
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index neosmm_plans_owner_idx on public.neosmm_plans (owner_id, created_at desc);
create index neosmm_plans_queue_idx on public.neosmm_plans (queue_key) where status in ('active', 'paused');

create trigger neosmm_plans_updated_at
  before update on public.neosmm_plans
  for each row execute function private.set_updated_at();

-- planned → dispatching (claimed, checks running) → sending (order row written, provider being called) →
-- sent | rejected | unknown; not_placed (owner confirmed it never arrived); cancelled (never sent).
create table public.neosmm_plan_parts (
  plan_id uuid not null references public.neosmm_plans (id) on delete restrict,
  part_index integer not null check (part_index >= 0 and part_index < 50),
  -- The submission id of this part's current attempt (= neosmm_orders.id once written).
  order_id uuid not null unique,
  quantity integer not null check (quantity > 0),
  billed integer not null check (billed > 0),
  estimate text not null check (estimate ~ '^\d+(\.\d+)?$'),
  planned_at timestamptz not null,
  due_at timestamptz not null,
  state text not null default 'planned' check (state in ('planned', 'dispatching', 'sending', 'sent', 'rejected', 'unknown', 'not_placed', 'cancelled')),
  lease_until timestamptz,
  note text check (char_length(note) <= 500),
  dispatched_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (plan_id, part_index)
);

create index neosmm_plan_parts_due_idx on public.neosmm_plan_parts (due_at) where state = 'planned';
create index neosmm_plan_parts_lease_idx on public.neosmm_plan_parts (lease_until) where state in ('dispatching', 'sending');

create trigger neosmm_plan_parts_updated_at
  before update on public.neosmm_plan_parts
  for each row execute function private.set_updated_at();

-- The reservation of a queue key: at most one holder, whatever path (manual / plan / another plan) asks for it.
create table public.neosmm_queue (
  queue_key text primary key check (char_length(queue_key) <= 700),
  order_id uuid not null unique,
  plan_id uuid,
  part_index integer,
  hold text not null check (hold in ('dispatching', 'sending', 'active', 'unknown')),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger neosmm_queue_updated_at
  before update on public.neosmm_queue
  for each row execute function private.set_updated_at();

-- One-time tokens for the worker call (pg_cron → HTTPS): only their hashes are stored; each is used once.
create table public.neosmm_worker_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------------------------------------------------------
-- Orders: links to plans / profiles, the queue key, the raw provider error, per-order refill policy
-- ---------------------------------------------------------------------------------------------------------------
alter table public.neosmm_orders
  add column plan_id uuid references public.neosmm_plans (id) on delete restrict,
  add column part_index integer check (part_index >= 0),
  add column target_key text check (char_length(target_key) <= 600),
  add column queue_key text check (char_length(queue_key) <= 700),
  add column profile_id uuid references public.neosmm_profiles (id) on delete set null,
  -- The provider's own words (sanitised; never the key).
  add column provider_error text check (char_length(provider_error) <= 1000),
  add column error_kind text check (error_kind in ('service', 'account', 'balance', 'input', 'active_order', 'maintenance', 'network', 'other')),
  -- When a status check first saw Completed (an observation time, not the provider's own completion time).
  add column completed_at timestamptz,
  -- Snapshot at submission: { api, verified, days, starts, basis, verified_at }; never rewritten from the catalogue.
  add column refill_policy jsonb,
  add column refill_requested_at timestamptz,
  add column refill_checked_at timestamptz,
  add column refill_error text check (char_length(refill_error) <= 500);

create index neosmm_orders_plan_idx on public.neosmm_orders (plan_id, part_index) where plan_id is not null;
create index neosmm_orders_profile_idx on public.neosmm_orders (profile_id, created_at desc) where profile_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.neosmm_status_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z]', '', 'g')) $$;

create or replace function private.neosmm_is_final(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select private.neosmm_status_key(p) in ('completed', 'partial', 'canceled', 'cancelled', 'refunded', 'failed') $$;

-- Later unsent parts keep the chosen spacing from the actual progress: never earlier than planned, never a burst.
create or replace function private.neosmm_reschedule(p_plan uuid, p_from_index integer, p_from_time timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.neosmm_plan_parts q
  set due_at = greatest(q.planned_at, p_from_time + make_interval(secs => pl.spacing_seconds::double precision * (q.part_index - p_from_index)))
  from public.neosmm_plans pl
  where pl.id = p_plan and q.plan_id = p_plan and q.part_index > p_from_index and q.state = 'planned';
$$;

create or replace function private.neosmm_pause(p_plan uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.neosmm_plans set status = 'paused', pause_reason = left(p_reason, 500), paused_at = now()
  where id = p_plan and status = 'active';
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Order state / status changes drive the queue, the plan and the service evidence — whichever path wrote them
-- (manual order, worker, the owner's status refresh, the owner settling an unclear result).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.neosmm_order_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final boolean := private.neosmm_is_final(new.status);
  v_was_final boolean := private.neosmm_is_final(old.status);
  v_completed boolean := private.neosmm_status_key(new.status) = 'completed';
  v_state_changed boolean := new.state is distinct from old.state;
begin
  if v_completed and new.completed_at is null then
    new.completed_at := now();
  end if;

  -- Service evidence (SMM only).
  if new.kind = 'smm' then
    if v_state_changed and new.state = 'accepted' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, last_accepted_at, last_accepted_order)
      values (new.item_id, new.item_name, new.item_category, now(), new.id)
      on conflict (provider, service_id) do update
        set last_accepted_at = excluded.last_accepted_at, last_accepted_order = excluded.last_accepted_order,
            service_name = excluded.service_name, service_category = excluded.service_category;
    end if;
    if v_completed and private.neosmm_status_key(old.status) <> 'completed' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, last_completed_at, last_completed_order)
      values (new.item_id, new.item_name, new.item_category, now(), new.id)
      on conflict (provider, service_id) do update
        set last_completed_at = excluded.last_completed_at, last_completed_order = excluded.last_completed_order;
    end if;
    if v_state_changed and new.state = 'rejected' and new.error_kind = 'service' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, blocked_at, blocked_reason, blocked_order)
      values (new.item_id, new.item_name, new.item_category, now(), left(coalesce(new.provider_error, new.error), 1000), new.id)
      on conflict (provider, service_id) do update
        set blocked_at = excluded.blocked_at, blocked_reason = excluded.blocked_reason, blocked_order = excluded.blocked_order;
    end if;
  end if;

  -- The queue: a certain rejection, "never arrived" or a final status frees it; anything else keeps it.
  if new.state in ('rejected', 'not_placed') or (new.state = 'accepted' and v_final) then
    delete from public.neosmm_queue where order_id = new.id;
  elsif v_state_changed and new.state = 'accepted' then
    update public.neosmm_queue set hold = 'active' where order_id = new.id;
  elsif v_state_changed and new.state = 'unknown' then
    update public.neosmm_queue set hold = 'unknown' where order_id = new.id;
  end if;

  -- The plan part behind this order (its current attempt only).
  if new.plan_id is not null then
    if v_state_changed then
      update public.neosmm_plan_parts
      set state = case new.state when 'accepted' then 'sent' when 'rejected' then 'rejected' when 'unknown' then 'unknown' when 'not_placed' then 'not_placed' else state end,
          lease_until = null,
          note = case when new.state in ('rejected', 'unknown') then left(new.error, 500) else note end
      where order_id = new.id and state in ('sending', 'unknown');
      if new.state = 'accepted' then
        perform private.neosmm_reschedule(new.plan_id, new.part_index, coalesce(new.accepted_at, now()));
      elsif new.state = 'rejected' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism qabul qilinmadi: %s', new.part_index + 1, coalesce(new.error, '—')));
      elsif new.state = 'unknown' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism: Natija noma’lum — tekshirish kerak', new.part_index + 1));
      elsif new.state = 'not_placed' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism provayderga tushmagan — davom ettirsangiz qayta yuboriladi', new.part_index + 1));
      end if;
    end if;
    if new.state = 'accepted' and v_final and not v_was_final then
      if v_completed then
        update public.neosmm_plans pl set status = 'completed', pause_reason = null
        where pl.id = new.plan_id and pl.status = 'active'
          and not exists (select 1 from public.neosmm_plan_parts p where p.plan_id = pl.id and p.state not in ('sent', 'cancelled'))
          and not exists (
            select 1 from public.neosmm_plan_parts p join public.neosmm_orders o on o.id = p.order_id
            where p.plan_id = pl.id and p.state = 'sent' and o.id <> new.id and private.neosmm_status_key(o.status) <> 'completed'
          );
      else
        -- Partial / cancelled / failed: a person decides; no automatic re-purchase of the remainder, no refill.
        perform private.neosmm_pause(new.plan_id, format('%s-qism yakunlandi: %s — ko‘rib chiqing', new.part_index + 1, new.status));
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger neosmm_orders_changed
  before update of state, status on public.neosmm_orders
  for each row execute function private.neosmm_order_changed();

-- ---------------------------------------------------------------------------------------------------------------
-- Server functions (service role only)
-- ---------------------------------------------------------------------------------------------------------------

-- Takes the queue key for a submission id; returns the id that holds it now (the caller's own when it got it).
create or replace function public.neosmm_queue_acquire(p_key text, p_order uuid, p_hold text default 'sending', p_plan uuid default null, p_part integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holder uuid;
begin
  insert into public.neosmm_queue (queue_key, order_id, plan_id, part_index, hold)
  values (p_key, p_order, p_plan, p_part, p_hold)
  on conflict do nothing;
  select order_id into v_holder from public.neosmm_queue where queue_key = p_key;
  return v_holder;
end;
$$;

-- Frees a key only for a submission that never reached the provider (the caller knows: e.g. the row could not be written).
create or replace function public.neosmm_queue_release(p_order uuid)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.neosmm_queue where order_id = p_order and hold in ('dispatching', 'sending')
        and not exists (select 1 from public.neosmm_orders o where o.id = p_order and o.state in ('submitting', 'accepted', 'unknown')); $$;

-- A plan with its parts, in one transaction (the plan id is the review token: a second click finds it).
create or replace function public.neosmm_create_plan(p_plan jsonb, p_parts jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_plan->>'id')::uuid;
begin
  if exists (select 1 from public.neosmm_plans where id = v_id) then
    return 'exists';
  end if;
  insert into public.neosmm_plans (
    id, owner_id, origin, service_id, service_name, service_category, service_type, target, target_key, queue_key, profile_id,
    params, total_quantity, part_count, spacing_seconds, start_at, window_seconds, price, price_unit, currency, estimate,
    can_cancel, can_refill, refill_policy
  ) values (
    v_id, (p_plan->>'owner_id')::uuid, p_plan->>'origin', (p_plan->>'service_id')::bigint, p_plan->>'service_name',
    p_plan->>'service_category', p_plan->>'service_type', p_plan->>'target', p_plan->>'target_key', p_plan->>'queue_key',
    nullif(p_plan->>'profile_id', '')::uuid, coalesce(p_plan->'params', '{}'), (p_plan->>'total_quantity')::integer,
    jsonb_array_length(p_parts), (p_plan->>'spacing_seconds')::integer, (p_plan->>'start_at')::timestamptz,
    (p_plan->>'window_seconds')::integer, p_plan->>'price', (p_plan->>'price_unit')::integer, coalesce(p_plan->>'currency', 'UZS'),
    p_plan->>'estimate', coalesce((p_plan->>'can_cancel')::boolean, false), coalesce((p_plan->>'can_refill')::boolean, false),
    p_plan->'refill_policy'
  );
  insert into public.neosmm_plan_parts (plan_id, part_index, order_id, quantity, billed, estimate, planned_at, due_at)
  select v_id, (x->>'part_index')::integer, (x->>'order_id')::uuid, (x->>'quantity')::integer, (x->>'billed')::integer,
         x->>'estimate', (x->>'planned_at')::timestamptz, (x->>'planned_at')::timestamptz
  from jsonb_array_elements(p_parts) x;
  if (select sum(quantity) from public.neosmm_plan_parts where plan_id = v_id) <> (p_plan->>'total_quantity')::integer then
    raise exception 'parts do not add up to the total';
  end if;
  return 'created';
exception when unique_violation then
  return 'exists';
end;
$$;

-- Claims due parts: plan active, earlier parts of the plan settled, the queue key taken in the same transaction.
create or replace function public.neosmm_claim_parts(p_limit integer, p_lease_seconds integer default 120, p_plan uuid default null)
returns table (plan_id uuid, part_index integer, order_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.plan_id as pid, p.part_index as idx, p.order_id as oid, pl.queue_key as qk
    from public.neosmm_plan_parts p
    join public.neosmm_plans pl on pl.id = p.plan_id
    where p.state = 'planned' and p.due_at <= now() and pl.status = 'active' and (p_plan is null or p.plan_id = p_plan)
      and not exists (
        select 1 from public.neosmm_plan_parts e
        where e.plan_id = p.plan_id and e.part_index < p.part_index and e.state in ('planned', 'dispatching', 'sending', 'unknown', 'rejected', 'not_placed')
      )
    order by p.due_at, p.plan_id, p.part_index
    for update of p, pl skip locked
  loop
    exit when n >= p_limit;
    insert into public.neosmm_queue (queue_key, order_id, plan_id, part_index, hold)
    values (r.qk, r.oid, r.pid, r.idx, 'dispatching')
    on conflict do nothing;
    continue when not exists (select 1 from public.neosmm_queue q where q.queue_key = r.qk and q.order_id = r.oid);
    update public.neosmm_plan_parts p
    set state = 'dispatching', lease_until = now() + make_interval(secs => p_lease_seconds), dispatched_at = now(), note = null
    where p.plan_id = r.pid and p.part_index = r.idx;
    plan_id := r.pid;
    part_index := r.idx;
    order_id := r.oid;
    n := n + 1;
    return next;
  end loop;
end;
$$;

-- A claimed part goes back to waiting (a check failed before anything was sent); optionally the plan pauses.
create or replace function public.neosmm_unclaim_part(p_order uuid, p_pause_reason text default null, p_due_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from public.neosmm_plan_parts where order_id = p_order and state = 'dispatching' for update;
  if not found then
    return;
  end if;
  update public.neosmm_plan_parts
  set state = 'planned', lease_until = null, note = left(p_pause_reason, 500), due_at = coalesce(greatest(p_due_at, due_at), due_at)
  where order_id = p_order;
  delete from public.neosmm_queue where order_id = p_order and hold = 'dispatching';
  if p_pause_reason is not null then
    perform private.neosmm_pause(r.plan_id, p_pause_reason);
  end if;
end;
$$;

-- The last check before the provider call, under the plan's lock: still active, still claimed, still holding the key.
-- Writes the order row (state "submitting") in the same transaction; from here the part is never resent by itself.
create or replace function public.neosmm_begin_send(p_order uuid, p_row jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select p.plan_id, p.part_index, p.state, pl.status as plan_status, pl.queue_key, pl.owner_id
  into r
  from public.neosmm_plan_parts p join public.neosmm_plans pl on pl.id = p.plan_id
  where p.order_id = p_order
  for update of p, pl;
  if not found then
    return 'missing';
  end if;
  if r.state <> 'dispatching' then
    return 'not_claimed';
  end if;
  if r.plan_status <> 'active' then
    update public.neosmm_plan_parts set state = case when r.plan_status = 'cancelled' then 'cancelled' else 'planned' end, lease_until = null
    where order_id = p_order;
    delete from public.neosmm_queue where order_id = p_order and hold = 'dispatching';
    return 'plan_' || r.plan_status;
  end if;
  if not exists (select 1 from public.neosmm_queue where order_id = p_order and queue_key = r.queue_key) then
    update public.neosmm_plan_parts set state = 'planned', lease_until = null where order_id = p_order;
    return 'queue_lost';
  end if;
  if (p_row->>'owner_id')::uuid is distinct from r.owner_id then
    raise exception 'owner mismatch';
  end if;
  insert into public.neosmm_orders
  select * from jsonb_populate_record(
    null::public.neosmm_orders,
    jsonb_build_object('provider', 'neosmm', 'kind', 'smm', 'params', '{}'::jsonb, 'can_cancel', false, 'can_refill', false, 'currency', 'UZS')
      || p_row
      || jsonb_build_object('id', p_order, 'state', 'submitting', 'plan_id', r.plan_id, 'part_index', r.part_index, 'queue_key', r.queue_key,
                            'created_at', now(), 'updated_at', now())
  );
  update public.neosmm_plan_parts set state = 'sending', lease_until = now() + interval '3 minutes' where order_id = p_order;
  update public.neosmm_queue set hold = 'sending' where order_id = p_order;
  return 'ok';
end;
$$;

-- After a crash or timeout: a claim that never wrote its order goes back to waiting; a send whose answer was never
-- recorded becomes "Natija noma’lum" (kept in the queue, plan paused) — never resent automatically. Stale holders go.
create or replace function public.neosmm_recover()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
begin
  with gone as (
    update public.neosmm_plan_parts p set state = 'planned', lease_until = null
    where p.state = 'dispatching' and p.lease_until < now()
      and not exists (select 1 from public.neosmm_orders o where o.id = p.order_id)
    returning p.order_id
  )
  delete from public.neosmm_queue q using gone where q.order_id = gone.order_id and q.hold = 'dispatching';
  get diagnostics k = row_count;
  n := n + k;

  -- Written but never answered (worker or a manual click that died mid-way): unclear, kept, never resent.
  update public.neosmm_orders o
  set state = 'unknown', error = 'Natija noma’lum — tekshirish kerak (yuborish jarayoni javobsiz uzildi)', error_kind = 'network'
  where o.state = 'submitting' and o.created_at < now() - interval '3 minutes'
    and not exists (select 1 from public.neosmm_plan_parts p where p.order_id = o.id and p.state = 'sending' and p.lease_until >= now());
  get diagnostics k = row_count;
  n := n + k;

  delete from public.neosmm_queue q
  where (q.hold = 'dispatching' and not exists (select 1 from public.neosmm_plan_parts p where p.order_id = q.order_id and p.state = 'dispatching'))
     -- A manual reservation whose order row was never written (the request died before it).
     or (q.hold = 'sending' and q.acquired_at < now() - interval '5 minutes'
         and not exists (select 1 from public.neosmm_orders o where o.id = q.order_id)
         and not exists (select 1 from public.neosmm_plan_parts p where p.order_id = q.order_id and p.state in ('dispatching', 'sending')))
     or exists (
       select 1 from public.neosmm_orders o
       where o.id = q.order_id and (o.state in ('rejected', 'not_placed') or (o.state = 'accepted' and private.neosmm_is_final(o.status)))
     );
  get diagnostics k = row_count;
  n := n + k;
  delete from public.neosmm_worker_tokens where expires_at < now();
  return n;
end;
$$;

-- Pauza / Davom ettirish / Yuborilmagan qismlarni bekor qilish — unsent parts only; real orders keep their states.
create or replace function public.neosmm_plan_control(p_plan uuid, p_action text, p_owner_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.neosmm_plans;
  v_first record;
  v_cancelled integer := 0;
  v_inflight integer := 0;
begin
  select * into r from public.neosmm_plans where id = p_plan and owner_id = any(p_owner_ids) for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_action = 'pause' then
    if r.status <> 'active' then
      return jsonb_build_object('ok', false, 'code', 'not_active');
    end if;
    update public.neosmm_plans set status = 'paused', pause_reason = 'Egasi pauza qildi', paused_at = now() where id = p_plan;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'resume' then
    if r.status <> 'paused' then
      return jsonb_build_object('ok', false, 'code', 'not_paused');
    end if;
    if exists (select 1 from public.neosmm_plan_parts where plan_id = p_plan and state in ('unknown', 'sending', 'dispatching')) then
      return jsonb_build_object('ok', false, 'code', 'unresolved');
    end if;
    -- A refused / never-arrived part gets a fresh submission id (its old row stays in the history).
    update public.neosmm_plan_parts set state = 'planned', order_id = gen_random_uuid(), note = null
    where plan_id = p_plan and state in ('rejected', 'not_placed');
    -- No catch-up burst: the first waiting part is due now at the earliest, the next ones keep the spacing from it.
    select part_index, greatest(due_at, now()) as at into v_first
    from public.neosmm_plan_parts where plan_id = p_plan and state = 'planned' order by part_index limit 1;
    if found then
      update public.neosmm_plan_parts set due_at = v_first.at where plan_id = p_plan and part_index = v_first.part_index;
      perform private.neosmm_reschedule(p_plan, v_first.part_index, v_first.at);
      update public.neosmm_plans set status = 'active', pause_reason = null, paused_at = null where id = p_plan;
    else
      -- Nothing left to send: active while a sent part is still running, otherwise finished.
      update public.neosmm_plans
      set status = case when exists (
            select 1 from public.neosmm_plan_parts p join public.neosmm_orders o on o.id = p.order_id
            where p.plan_id = p_plan and p.state = 'sent' and not private.neosmm_is_final(o.status)) then 'active' else 'completed' end,
          pause_reason = null, paused_at = null
      where id = p_plan;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'cancel' then
    if r.status in ('cancelled', 'completed') then
      return jsonb_build_object('ok', false, 'code', 'finished');
    end if;
    with c as (
      update public.neosmm_plan_parts set state = 'cancelled', lease_until = null, note = 'Egasi bekor qildi (yuborilmagan)'
      where plan_id = p_plan and state in ('planned', 'dispatching', 'rejected', 'not_placed')
      returning order_id
    ), q as (
      delete from public.neosmm_queue where order_id in (select order_id from c) and hold = 'dispatching'
    )
    select count(*) into v_cancelled from c;
    select count(*) into v_inflight from public.neosmm_plan_parts where plan_id = p_plan and state in ('sending', 'unknown');
    update public.neosmm_plans set status = 'cancelled', pause_reason = null where id = p_plan;
    return jsonb_build_object('ok', true, 'cancelled', v_cancelled, 'inflight', v_inflight);
  end if;

  return jsonb_build_object('ok', false, 'code', 'bad_action');
end;
$$;

-- A successful fresh services catalogue: what is present is seen (missing cleared), what vanished since the previous
-- copy is marked missing with its last known name. Blocks and the owner's switch are untouched.
create or replace function public.neosmm_store_services(p_owner uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  create temporary table neosmm_fresh on commit drop as
    select distinct (y->>'id')::bigint as id from jsonb_array_elements(p_items) y where (y->>'id') ~ '^[0-9]{1,15}$';

  insert into public.neosmm_service_health (service_id, service_name, service_category, missing_since)
  select distinct on ((x->>'id')::bigint) (x->>'id')::bigint, left(x->>'name', 500), left(x->>'category', 200), now()
  from public.neosmm_catalog_cache c, jsonb_array_elements(c.data) x
  where c.owner_id = p_owner and c.kind = 'services' and (x->>'id') ~ '^[0-9]{1,15}$'
    and not exists (select 1 from pg_temp.neosmm_fresh f where f.id = (x->>'id')::bigint)
  on conflict (provider, service_id) do update set missing_since = coalesce(public.neosmm_service_health.missing_since, now());

  update public.neosmm_service_health h set missing_since = now()
  where h.missing_since is null and not exists (select 1 from pg_temp.neosmm_fresh f where f.id = h.service_id);

  update public.neosmm_service_health h set missing_since = null, last_seen_at = now()
  from pg_temp.neosmm_fresh f where f.id = h.service_id;

  insert into public.neosmm_catalog_cache (owner_id, kind, data, fetched_at)
  values (p_owner, 'services', p_items, now())
  on conflict (owner_id, kind) do update set data = excluded.data, fetched_at = excluded.fetched_at;
  drop table pg_temp.neosmm_fresh;
end;
$$;

create or replace function public.neosmm_consume_worker_token(p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  delete from public.neosmm_worker_tokens where token_hash = p_hash and expires_at > now() returning true into v;
  return coalesce(v, false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The scheduler: every minute, only when there is work, one call to the deployed worker with a one-time token.
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

select cron.schedule('sunmedia-smm-worker', '* * * * *', $$select private.request_smm_worker()$$);

-- ---------------------------------------------------------------------------------------------------------------
-- Evidence already on record: the raw refusals of 949 / 1225 / 1485 ("Provider error: Incorrect service ID", sent with
-- the catalogue's own service value) and the accepted order. The raw text of older refusals that were stored only in
-- translation is not reconstructed.
-- ---------------------------------------------------------------------------------------------------------------
update public.neosmm_orders
set provider_error = 'Provider error: Incorrect service ID', error_kind = 'service'
where kind = 'smm' and state = 'rejected' and error ilike '%Incorrect service ID%' and provider_error is null;

insert into public.neosmm_service_health (service_id, service_name, service_category, blocked_at, blocked_reason, blocked_order)
select distinct on (item_id) item_id, item_name, item_category, coalesce(submitted_at, created_at), provider_error, id
from public.neosmm_orders
where kind = 'smm' and state = 'rejected' and error_kind = 'service'
order by item_id, created_at desc
on conflict (provider, service_id) do nothing;

insert into public.neosmm_service_health as h (service_id, service_name, service_category, last_accepted_at, last_accepted_order)
select distinct on (item_id) item_id, item_name, item_category, coalesce(accepted_at, created_at), id
from public.neosmm_orders
where kind = 'smm' and state = 'accepted'
order by item_id, created_at desc
on conflict (provider, service_id) do update set last_accepted_at = excluded.last_accepted_at, last_accepted_order = excluded.last_accepted_order;

update public.neosmm_service_health h
set last_completed_at = o.completed_at, last_completed_order = o.id
from (
  select distinct on (item_id) item_id, id, coalesce(checked_at, created_at) as completed_at
  from public.neosmm_orders where kind = 'smm' and state = 'accepted' and private.neosmm_status_key(status) = 'completed'
  order by item_id, created_at desc
) o
where h.service_id = o.item_id;

update public.neosmm_orders set completed_at = coalesce(checked_at, created_at)
where state = 'accepted' and private.neosmm_status_key(status) = 'completed' and completed_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Access: nobody but the server
-- ---------------------------------------------------------------------------------------------------------------
alter table public.neosmm_profiles enable row level security;
alter table public.neosmm_profile_observations enable row level security;
alter table public.neosmm_recent_targets enable row level security;
alter table public.neosmm_service_health enable row level security;
alter table public.neosmm_plans enable row level security;
alter table public.neosmm_plan_parts enable row level security;
alter table public.neosmm_queue enable row level security;
alter table public.neosmm_worker_tokens enable row level security;

revoke all on public.neosmm_profiles, public.neosmm_profile_observations, public.neosmm_recent_targets, public.neosmm_service_health,
  public.neosmm_plans, public.neosmm_plan_parts, public.neosmm_queue, public.neosmm_worker_tokens from public, anon, authenticated;
grant all on public.neosmm_profiles, public.neosmm_profile_observations, public.neosmm_recent_targets, public.neosmm_service_health,
  public.neosmm_plans, public.neosmm_plan_parts, public.neosmm_queue, public.neosmm_worker_tokens to service_role;

revoke all on function public.neosmm_queue_acquire(text, uuid, text, uuid, integer), public.neosmm_queue_release(uuid),
  public.neosmm_create_plan(jsonb, jsonb), public.neosmm_claim_parts(integer, integer, uuid), public.neosmm_unclaim_part(uuid, text, timestamptz),
  public.neosmm_begin_send(uuid, jsonb), public.neosmm_recover(), public.neosmm_plan_control(uuid, text, uuid[]),
  public.neosmm_store_services(uuid, jsonb), public.neosmm_consume_worker_token(text) from public, anon, authenticated;
grant execute on function public.neosmm_queue_acquire(text, uuid, text, uuid, integer), public.neosmm_queue_release(uuid),
  public.neosmm_create_plan(jsonb, jsonb), public.neosmm_claim_parts(integer, integer, uuid), public.neosmm_unclaim_part(uuid, text, timestamptz),
  public.neosmm_begin_send(uuid, jsonb), public.neosmm_recover(), public.neosmm_plan_control(uuid, text, uuid[]),
  public.neosmm_store_services(uuid, jsonb), public.neosmm_consume_worker_token(text) to service_role;
revoke all on function private.request_smm_worker(), private.neosmm_reschedule(uuid, integer, timestamptz), private.neosmm_pause(uuid, text),
  private.neosmm_order_changed() from public, anon, authenticated;
