-- SUN MEDIA — one list of tariffs. A tariff kept in Sayt › Tariflar is also the system tariff (Mijozlar › Tariflar,
-- assigning a client, the client cabinet and the mobile app): the same name, price and lines, synced automatically,
-- never entered twice.
--   * site_plan_items.service_key: which system service each line is (Fotopost → posts, Story → stories, ...);
--     a line without one is matched by name or gets its own service.
--   * plans.site_plan_id: the system tariff mirroring a site tariff. Only the sync writes it and its lines.
--   * plan_features / subscription_quotas: label, unit and position, so the system shows the lines as the site does.
--   * One published piece of content uses one service of the client's tariff, even when several services count
--     the same content type ("Video kontent" counts Reels and videos).
-- Additive: nothing is removed; the existing site tariffs are mirrored at the end.

-- ---------------------------------------------------------------------------
-- Services the site tariffs need
-- ---------------------------------------------------------------------------
insert into public.service_types (key, name, unit, content_types, counts_on, is_quantitative, position) values
  ('video_content', 'Video kontent', 'ta', '{reel,video}', 'published', true, 45),
  ('sales_funnel', 'Sotuv voronkasi', 'xizmat', '{}', 'manual', false, 117)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Links and display fields
-- ---------------------------------------------------------------------------
alter table public.site_plan_items add column service_key text references public.service_types (key) on delete restrict;
-- One line per service in a tariff (checked at commit, so lines can swap services in one save).
alter table public.site_plan_items add constraint site_plan_items_one_service unique (plan_id, service_key) deferrable initially deferred;

alter table public.plans add column site_plan_id uuid unique references public.site_plans (id) on delete set null;

alter table public.plan_features
  add column label text check (char_length(label) <= 120),
  add column unit text check (char_length(unit) <= 20),
  add column position integer;
alter table public.subscription_quotas
  add column label text check (char_length(label) <= 120),
  add column unit text check (char_length(unit) <= 20),
  add column position integer;

-- ---------------------------------------------------------------------------
-- Reading a site line: "10 ta" → 10 ta, "∞" / "cheksiz" → unlimited (null)
-- ---------------------------------------------------------------------------
create or replace function private.plan_line_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(regexp_replace(coalesce(p, ''), '[‘’ʻʼ`'']', '', 'g')), '\s+', ' ', 'g'));
$$;

create or replace function private.plan_line_slug(p text, p_sep text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(regexp_replace(coalesce(p, ''), '[‘’ʻʼ`'']', '', 'g')), '[^a-z0-9]+', p_sep, 'g'), p_sep);
$$;

create or replace function private.plan_quantity_unlimited(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p, '') ~* '∞|cheksiz|chegarasiz|limitsiz|unlimited|без ?лимит|безлимит';
$$;

create or replace function private.plan_quantity_number(p text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p, '') ~ '\d' then least(substring(p from '\d{1,9}')::integer, 100000) end;
$$;

create or replace function private.plan_quantity_unit(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p, '') ~ '^\s*\d+\s*\S' then nullif(left(btrim(regexp_replace(p, '^\s*\d+\s*', '')), 20), '') end;
$$;

-- The system service of a site line: the one chosen, else the one the same line uses in another tariff, else the
-- service with that name, else a new service with that name (counted by hand).
create or replace function private.resolve_plan_service(p_name text, p_quantity text, p_key text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.plan_line_name(p_name);
  v_key text;
  v_base text;
  v_n integer := 1;
  v_counted boolean;
begin
  if auth.uid() is not null and not private.has_permission('site.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if nullif(p_key, '') is not null then
    if not exists (select 1 from public.service_types where key = p_key) then
      raise exception 'SITE_PLAN_SERVICE_INVALID' using errcode = '22023';
    end if;
    return p_key;
  end if;
  -- A line without a name is refused by the table itself.
  if v_name = '' then
    return null;
  end if;

  select i.service_key into v_key
  from public.site_plan_items i join public.service_types st on st.key = i.service_key and st.is_active
  where private.plan_line_name(i.name) = v_name
  order by i.updated_at desc
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  select st.key into v_key from public.service_types st
  where st.is_active and private.plan_line_name(st.name) = v_name
  order by st.position
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  v_base := left(coalesce(nullif(private.plan_line_slug(p_name, '_'), ''), 'xizmat'), 40);
  if v_base !~ '^[a-z]' then
    v_base := 's_' || v_base;
  end if;
  v_key := v_base;
  while exists (select 1 from public.service_types where key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;
  v_counted := private.plan_quantity_unlimited(p_quantity) or coalesce(p_quantity, '') ~ '\d';
  insert into public.service_types (key, name, unit, content_types, counts_on, is_quantitative, position)
  values (v_key, btrim(p_name), case when v_counted then 'ta' else 'xizmat' end, '{}', 'manual', v_counted,
          coalesce((select max(position) from public.service_types), 0) + 10);
  return v_key;
end;
$$;

revoke all on function private.resolve_plan_service(text, text, text) from public, anon;
grant execute on function private.resolve_plan_service(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The sync: a site tariff → its system tariff and lines (only what changed is written)
-- ---------------------------------------------------------------------------
create or replace function private.sync_site_plan(p_site_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.site_plans;
  v_plan uuid;
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  select * into v_site from public.site_plans where id = p_site_plan_id;
  if not found then
    return null;
  end if;

  select id into v_plan from public.plans where site_plan_id = v_site.id;
  if v_plan is null then
    v_base := left(coalesce(nullif(private.plan_line_slug(v_site.name, '-'), ''), 'tarif'), 40);
    v_slug := v_base;
    while exists (select 1 from public.plans where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
    insert into public.plans (name, slug, description, price, currency, duration_months, is_public, client_id, is_active, position, site_plan_id)
    values (v_site.name, v_slug, nullif(v_site.description, ''), coalesce(v_site.price, 0), v_site.currency, 1, true, null,
            v_site.is_published, v_site.sort_order, v_site.id)
    returning id into v_plan;
  else
    update public.plans
    set name = v_site.name,
        description = nullif(v_site.description, ''),
        price = coalesce(v_site.price, 0),
        currency = v_site.currency,
        duration_months = 1,
        is_public = true,
        client_id = null,
        is_active = v_site.is_published,
        position = v_site.sort_order,
        deleted_at = null
    where id = v_plan
      and (name, description, price, currency::text, duration_months, is_public, client_id, is_active, position, deleted_at)
          is distinct from (v_site.name, nullif(v_site.description, ''), coalesce(v_site.price, 0), v_site.currency, 1, true,
                            null::uuid, v_site.is_published, v_site.sort_order, null::timestamptz);
  end if;

  delete from public.plan_features f
  where f.plan_id = v_plan
    and not exists (select 1 from public.site_plan_items i where i.plan_id = v_site.id and i.service_key = f.service_key);

  insert into public.plan_features (plan_id, service_key, quantity, is_included, note, label, unit, position)
  select distinct on (i.service_key)
    v_plan, i.service_key,
    case when st.is_quantitative and not private.plan_quantity_unlimited(i.quantity) then private.plan_quantity_number(i.quantity) end,
    true, nullif(i.note, ''), i.name,
    case when st.is_quantitative then private.plan_quantity_unit(i.quantity) end,
    i.sort_order
  from public.site_plan_items i join public.service_types st on st.key = i.service_key
  where i.plan_id = v_site.id
  order by i.service_key, i.sort_order, i.created_at
  on conflict (plan_id, service_key) do update
  set quantity = excluded.quantity, is_included = true, note = excluded.note, label = excluded.label, unit = excluded.unit, position = excluded.position
  where (plan_features.quantity, plan_features.is_included, plan_features.note, plan_features.label, plan_features.unit, plan_features.position)
        is distinct from (excluded.quantity, true, excluded.note, excluded.label, excluded.unit, excluded.position);

  return v_plan;
end;
$$;

revoke all on function private.sync_site_plan(uuid) from public, anon, authenticated;

create or replace function private.site_plans_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_site_plan(new.id);
  return null;
end;
$$;

-- A deleted site tariff leaves the catalogue: clients already on it keep their period, nobody new gets it.
create or replace function private.site_plans_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plans set is_active = false, deleted_at = coalesce(deleted_at, now()) where site_plan_id = old.id;
  return old;
end;
$$;

create or replace function private.site_plan_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_key is null then
    new.service_key := private.resolve_plan_service(new.name, new.quantity);
  end if;
  return new;
end;
$$;

create or replace function private.site_plan_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform private.sync_site_plan(old.plan_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.plan_id is distinct from old.plan_id) then
    perform private.sync_site_plan(new.plan_id);
  end if;
  return null;
end;
$$;

revoke all on function private.site_plans_after_write(), private.site_plans_before_delete(),
  private.site_plan_items_before_write(), private.site_plan_items_after_write() from public, anon, authenticated;

create trigger site_plans_sync after insert or update on public.site_plans
  for each row execute function private.site_plans_after_write();
create trigger site_plans_retire before delete on public.site_plans
  for each row execute function private.site_plans_before_delete();
create trigger site_plan_items_service before insert or update on public.site_plan_items
  for each row execute function private.site_plan_items_before_write();
-- Lines are synced at commit, once the whole save is in place.
create constraint trigger site_plan_items_sync after insert or update or delete on public.site_plan_items
  deferrable initially deferred
  for each row execute function private.site_plan_items_after_write();

-- The mirrored tariff is changed only through the site tariff (invoker: the sync itself is privileged).
create or replace function private.site_plan_mirror_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_context() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'plans' then
    if (tg_op = 'INSERT' and new.site_plan_id is not null)
       or (tg_op = 'UPDATE' and (old.site_plan_id is not null or new.site_plan_id is not null)) then
      raise exception 'SITE_PLAN_MIRROR' using errcode = '42501';
    end if;
  elsif exists (
    select 1 from public.plans p
    where p.site_plan_id is not null
      and p.id in (case when tg_op <> 'INSERT' then old.plan_id end, case when tg_op <> 'DELETE' then new.plan_id end)
  ) then
    raise exception 'SITE_PLAN_MIRROR' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger plans_site_mirror_guard before insert or update on public.plans
  for each row execute function private.site_plan_mirror_guard();
create trigger plan_features_site_mirror_guard before insert or update or delete on public.plan_features
  for each row execute function private.site_plan_mirror_guard();

-- ---------------------------------------------------------------------------
-- Saving a site tariff: each line names its system service (empty = matched automatically)
-- ---------------------------------------------------------------------------
create or replace function public.site_save_plan(p_plan jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_mode text := coalesce(p_plan ->> 'price_mode', 'fixed');
  v_price numeric := case when coalesce(p_plan ->> 'price_mode', 'fixed') = 'negotiable' then null else nullif(p_plan ->> 'price', '')::numeric end;
  v_featured boolean := coalesce((p_plan ->> 'is_featured')::boolean, false);
  v_items jsonb := coalesce(p_items, '[]');
  v_item jsonb;
  v_item_id uuid;
  v_key text;
  v_keys text[] := '{}';
  v_keep uuid[] := '{}';
  v_pos integer := 0;
begin
  if not private.has_permission('site.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 30 then
    raise exception 'SITE_PLAN_INVALID' using errcode = '22023';
  end if;
  if v_featured then
    update public.site_plans set is_featured = false where is_featured and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.site_plans (name, description, price, currency, price_mode, billing_period, is_featured, is_published, sort_order)
    values (btrim(p_plan ->> 'name'), btrim(coalesce(p_plan ->> 'description', '')), v_price, coalesce(p_plan ->> 'currency', 'UZS'), v_mode,
            coalesce(p_plan ->> 'billing_period', 'monthly'), v_featured, coalesce((p_plan ->> 'is_published')::boolean, true),
            coalesce((select max(sort_order) + 1 from public.site_plans), 0))
    returning id into v_id;
  else
    update public.site_plans
    set name = btrim(p_plan ->> 'name'),
        description = btrim(coalesce(p_plan ->> 'description', '')),
        price = v_price,
        currency = coalesce(p_plan ->> 'currency', 'UZS'),
        price_mode = v_mode,
        billing_period = coalesce(p_plan ->> 'billing_period', 'monthly'),
        is_featured = v_featured,
        is_published = coalesce((p_plan ->> 'is_published')::boolean, is_published)
    where id = v_id;
    if not found then
      raise exception 'SITE_PLAN_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_item_id := nullif(v_item ->> 'id', '')::uuid;
    if v_item_id is not null and not exists (select 1 from public.site_plan_items i where i.id = v_item_id and i.plan_id = v_id) then
      v_item_id := null;
    end if;
    -- No service_key sent for an existing line: it keeps its service.
    v_key := null;
    if v_item_id is not null and not (v_item ? 'service_key') then
      select i.service_key into v_key from public.site_plan_items i where i.id = v_item_id;
    end if;
    if v_key is null then
      v_key := private.resolve_plan_service(btrim(v_item ->> 'name'), btrim(coalesce(v_item ->> 'quantity', '')), nullif(v_item ->> 'service_key', ''));
    end if;
    if v_key is not null then
      if v_key = any (v_keys) then
        raise exception 'SITE_PLAN_SERVICE_DUPLICATE' using errcode = '22023';
      end if;
      v_keys := v_keys || v_key;
    end if;
    if v_item_id is not null then
      update public.site_plan_items
      set name = btrim(v_item ->> 'name'), quantity = btrim(coalesce(v_item ->> 'quantity', '')),
          note = btrim(coalesce(v_item ->> 'note', '')), sort_order = v_pos, service_key = v_key
      where id = v_item_id;
    else
      insert into public.site_plan_items (plan_id, name, quantity, note, sort_order, service_key)
      values (v_id, btrim(v_item ->> 'name'), btrim(coalesce(v_item ->> 'quantity', '')), btrim(coalesce(v_item ->> 'note', '')), v_pos, v_key)
      returning id into v_item_id;
    end if;
    v_keep := v_keep || v_item_id;
    v_pos := v_pos + 1;
  end loop;
  delete from public.site_plan_items i where i.plan_id = v_id and i.id <> all (v_keep);
  return v_id;
end;
$$;

revoke all on function public.site_save_plan(jsonb, jsonb) from public, anon;
grant execute on function public.site_save_plan(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The lines as the tariff names them, wherever the system shows them
-- ---------------------------------------------------------------------------
create or replace function private.snapshot_subscription_quotas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscription_quotas (subscription_id, service_key, quantity, is_included, note, label, unit, position)
  select new.id, pf.service_key, pf.quantity, pf.is_included, pf.note, pf.label, pf.unit, pf.position
  from public.plan_features pf
  where pf.plan_id = new.plan_id
  on conflict do nothing;
  return null;
end;
$$;

create or replace view public.subscription_usage_summary
with (security_invoker = true) as
select
  s.id as subscription_id,
  s.client_id,
  k.service_key,
  coalesce(q.label, st.name) as service_name,
  coalesce(q.unit, st.unit) as unit,
  coalesce(q.position, st.position) as position,
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

-- One piece of content uses one service: the one the client's tariff includes, else the first in the catalogue.
create or replace function private.record_content_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_date date;
  v_subscription uuid;
begin
  if not new.counts_toward_plan or new.deleted_at is not null or new.status = old.status
     or new.status::text not in ('published', 'approved') then
    return null;
  end if;
  v_date := (coalesce(case when new.status = 'published' then new.published_at else new.approved_at end, now())
             at time zone private.agency_timezone())::date;
  v_subscription := private.subscription_for_date(new.client_id, v_date);

  select st.key into v_key
  from public.service_types st
  where new.content_type = any (st.content_types) and st.is_active and st.counts_on = new.status::text
  order by exists (
             select 1 from public.subscription_quotas q
             where q.subscription_id = v_subscription and q.service_key = st.key and q.is_included
           ) desc,
           st.position, st.key
  limit 1;
  if v_key is null or exists (
    select 1 from public.client_plan_usage u join public.service_types st on st.key = u.service_key
    where u.content_id = new.id and u.source = 'auto' and st.counts_on = new.status::text
  ) then
    return null;
  end if;

  insert into public.client_plan_usage (client_id, subscription_id, service_key, quantity, source, content_id, occurred_on)
  values (new.client_id, v_subscription, v_key, 1, 'auto', new.id, v_date)
  on conflict do nothing;
  return null;
end;
$$;

create or replace function public.get_client_plan(p_client_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_current public.client_subscriptions;
begin
  if not private.can_view_subscription_of(p_client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_current from public.client_subscriptions
  where client_id = p_client_id and status in ('active', 'scheduled') and ends_on >= v_today
  order by case status when 'active' then 0 else 1 end, starts_on
  limit 1;

  return jsonb_build_object(
    'current', case when v_current.id is null then null else (
      select jsonb_build_object(
        'id', v_current.id, 'status', v_current.status, 'starts_on', v_current.starts_on, 'ends_on', v_current.ends_on,
        'price', v_current.price, 'currency', v_current.currency,
        'days_total', v_current.ends_on - v_current.starts_on + 1,
        'days_left', greatest(0, v_current.ends_on - greatest(v_today, v_current.starts_on - 1)),
        'plan', jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'duration_months', p.duration_months)
      )
      from public.plans p where p.id = v_current.plan_id
    ) end,
    'upcoming', (
      select jsonb_build_object('id', s.id, 'plan_name', p.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'price', s.price, 'currency', s.currency)
      from public.client_subscriptions s join public.plans p on p.id = s.plan_id
      where s.client_id = p_client_id and s.status = 'scheduled' and s.starts_on > v_today
        and (v_current.id is null or s.id <> v_current.id)
      order by s.starts_on
      limit 1
    ),
    'usage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_key', u.service_key, 'service_name', u.service_name, 'unit', u.unit,
        'planned', u.planned, 'used', u.used, 'is_included', u.is_included, 'is_quantitative', u.is_quantitative
      ) order by u.position)
      from public.subscription_usage_summary u where u.subscription_id = v_current.id
    ), '[]'::jsonb),
    'pending_request', (
      select jsonb_build_object('id', r.id, 'plan_name', p.name, 'message', r.message, 'created_at', r.created_at)
      from public.plan_upgrade_requests r join public.plans p on p.id = r.requested_plan_id
      where r.client_id = p_client_id and r.status = 'pending'
      limit 1
    ),
    'last_decision', (
      select jsonb_build_object('status', r.status, 'plan_name', p.name, 'response', r.response, 'handled_at', r.handled_at)
      from public.plan_upgrade_requests r join public.plans p on p.id = r.requested_plan_id
      where r.client_id = p_client_id and r.status in ('approved', 'rejected') and r.handled_at > now() - interval '30 days'
      order by r.handled_at desc
      limit 1
    ),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'price', p.price, 'currency', p.currency,
        'duration_months', p.duration_months, 'is_custom', p.client_id is not null,
        'is_current', p.id = v_current.plan_id,
        'features', coalesce((
          select jsonb_agg(jsonb_build_object('service_name', coalesce(f.label, st.name), 'unit', coalesce(f.unit, st.unit),
                                              'quantity', f.quantity, 'is_included', f.is_included, 'note', f.note,
                                              'is_quantitative', st.is_quantitative)
                           order by coalesce(f.position, st.position), st.position)
          from public.plan_features f join public.service_types st on st.key = f.service_key
          where f.plan_id = p.id and f.is_included
        ), '[]'::jsonb)
      ) order by p.position, p.price)
      from public.plans p
      where p.is_active and p.deleted_at is null and (p.is_public or p.client_id = p_client_id)
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'plan_name', p.name, 'status', s.status, 'starts_on', s.starts_on, 'ends_on', s.ends_on
      ) order by s.starts_on desc)
      from (
        select * from public.client_subscriptions
        where client_id = p_client_id and (v_current.id is null or id <> v_current.id) and starts_on <= v_today
        order by starts_on desc limit 6
      ) s join public.plans p on p.id = s.plan_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_client_plan(uuid) from public, anon;
grant execute on function public.get_client_plan(uuid) to authenticated;

-- The next-tariff forecast counts the tariff's video lines, whatever service they use.
create or replace function public.get_client_forecast(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_sub public.client_subscriptions;
  v_plan public.plans;
  v_next public.plans;
  v_account uuid;
  v_days integer;
  v_reels integer;
  v_p25 numeric;
  v_p75 numeric;
  v_views30 numeric;
  v_growth30 numeric;
  v_f_start integer;
  v_f_end integer;
  v_cur_reels integer;
  v_next_reels integer;
  v_extra integer;
  v_views_low numeric;
  v_views_high numeric;
  v_leads30 numeric;
  v_cur_ads integer;
  v_next_ads integer;
  v_first_lead timestamptz;
  v_result jsonb;
  -- Every service that counts Reels or videos (Reels, Videolar, Video kontent).
  v_video_keys text[] := array(select st.key from public.service_types st where st.content_types && '{reel,video}'::public.content_type[]);
begin
  if not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.require_feature(private.client_workspace_id(p_client), 'client.forecast');

  select * into v_sub from public.client_subscriptions s where s.id = private.subscription_for_date(p_client, v_today);
  if v_sub.id is null then
    return jsonb_build_object('available', false, 'reason', 'no_plan');
  end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  select * into v_next from public.plans p
  where p.is_active and p.is_public and p.deleted_at is null and p.currency = v_plan.currency and p.price > v_plan.price
  order by p.price limit 1;
  if v_next.id is null then
    return jsonb_build_object('available', false, 'reason', 'top_plan');
  end if;

  select coalesce(sum(q.quantity) filter (where q.service_key = any (v_video_keys)), 0),
         coalesce(sum(q.quantity) filter (where q.service_key = 'ad_creatives'), 0)
  into v_cur_reels, v_cur_ads
  from public.subscription_quotas q where q.subscription_id = v_sub.id and q.is_included;
  select coalesce(sum(f.quantity) filter (where f.service_key = any (v_video_keys)), 0),
         coalesce(sum(f.quantity) filter (where f.service_key = 'ad_creatives'), 0)
  into v_next_reels, v_next_ads
  from public.plan_features f where f.plan_id = v_next.id and f.is_included;
  v_extra := v_next_reels - v_cur_reels;

  select s.id into v_account from public.social_accounts s
  where s.client_id = p_client and s.platform = 'instagram' and s.deleted_at is null
  order by (s.connection = 'connected') desc limit 1;

  select count(*) into v_days from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.snapshot_date > v_today - 90 and d.views is not null;
  select count(*), percentile_cont(0.25) within group (order by m.views), percentile_cont(0.75) within group (order by m.views)
  into v_reels, v_p25, v_p75
  from public.social_media_items m
  where m.social_account_id = v_account and m.product_type = 'REELS' and m.views is not null
    and m.posted_at >= now() - interval '90 days';

  if v_account is null or v_days < 30 or v_reels < 4 then
    return jsonb_build_object('available', false, 'reason', 'not_enough_data', 'days', coalesce(v_days, 0), 'reels', coalesce(v_reels, 0),
      'current_plan', v_plan.name, 'current_price', v_sub.price, 'next_plan', v_next.name, 'next_price', v_next.price, 'currency', v_plan.currency);
  end if;
  if v_extra <= 0 then
    return jsonb_build_object('available', false, 'reason', 'no_extra_content', 'next_plan', v_next.name, 'next_price', v_next.price,
      'current_plan', v_plan.name, 'current_price', v_sub.price, 'currency', v_plan.currency);
  end if;

  select sum(d.views) into v_views30 from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.snapshot_date > v_today - 30;
  select d.followers into v_f_end from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.followers is not null order by d.snapshot_date desc limit 1;
  select d.followers into v_f_start from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.followers is not null and d.snapshot_date > v_today - 31
  order by d.snapshot_date limit 1;
  v_growth30 := v_f_end - v_f_start;

  -- More Reels a month, each performing like this client's weaker (p25) to stronger (p75) Reels.
  v_views_low := v_views30 + v_extra * v_p25 * 0.8;
  v_views_high := v_views30 + v_extra * v_p75;

  v_result := jsonb_build_object(
    'available', true,
    'current_plan', v_plan.name,
    'current_price', v_sub.price,
    'next_plan', v_next.name,
    'next_price', v_next.price,
    'currency', v_plan.currency,
    'extra_reels', v_extra,
    'basis', jsonb_build_object('days', v_days, 'reels', v_reels, 'views_30d', v_views30, 'reel_views_p25', round(v_p25), 'reel_views_p75', round(v_p75)),
    'views', jsonb_build_object('low', round(v_views_low, -3), 'high', round(v_views_high, -3)),
    -- Followers grow with views at the rate this account has shown over the last 30 days.
    'followers', case when coalesce(v_growth30, 0) > 0 and coalesce(v_views30, 0) > 0 then
      jsonb_build_object('low', round(v_growth30 * v_views_low / v_views30, -1), 'high', round(v_growth30 * v_views_high / v_views30, -1)) end
  );

  -- Leads only when ads are part of both tariffs and there is a full month of lead history.
  select min(l.lead_at), count(*) filter (where l.lead_at >= now() - interval '30 days')
  into v_first_lead, v_leads30
  from public.leads l where l.client_id = p_client and l.delivery_status <> 'discarded';
  if v_first_lead <= now() - interval '30 days' and v_leads30 > 0 and v_cur_ads > 0 and v_next_ads > v_cur_ads then
    v_result := v_result || jsonb_build_object('leads', jsonb_build_object(
      'low', round(v_leads30 * (1 + (v_next_ads::numeric / v_cur_ads - 1) * 0.3)),
      'high', round(v_leads30 * (1 + (v_next_ads::numeric / v_cur_ads - 1) * 0.6))
    ));
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The site tariffs already published become the system tariffs
-- ---------------------------------------------------------------------------
update public.site_plan_items i
set service_key = m.service_key
from (values ('video kontent', 'video_content'), ('fotopost', 'posts'), ('story', 'stories'),
             ('target+', 'ad_management'), ('smm strategiya', 'strategy'), ('sotuv voronkasi', 'sales_funnel')) m(line, service_key)
where i.service_key is null and private.plan_line_name(i.name) = m.line
  and not exists (select 1 from public.site_plan_items o where o.plan_id = i.plan_id and o.service_key = m.service_key);
-- Any other line: matched by name or given its own service (the before-write trigger).
update public.site_plan_items set name = name where service_key is null;

select private.sync_site_plan(id) from public.site_plans order by sort_order, created_at;
