-- Speed: access helpers evaluated once per query instead of once per row. Same results, same rules.
-- * private.my_chat_room_ids() checked accessible_client_ids() / sees_all_clients() for every membership row; it is
--   behind the RLS of chat_rooms, chat_members, messages and message reads, so every chat query paid it several times
--   (get_my_chats, on every panel page: ~300 ms -> ~12 ms for an owner in 76 rooms).
-- * get_crm_summary() ran sees_all_clients() / staff_client_ids() for every lead (20k leads: 5.5 s, and past the 8 s
--   statement timeout for scoped staff).
-- * get_client_leads() worked out "today / 7 days / 30 days" again for every lead it counted.
-- The helpers are STABLE: inside one statement they give one answer, so `(select helper())` (the pattern the RLS
-- policies already use) returns exactly what the per-row calls did. Only function bodies change; no table or data.

create or replace function private.my_chat_room_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_active_user() then '{}'::uuid[] else
    (select coalesce(array_agg(cm.room_id), '{}')
     from public.chat_members cm
     join public.chat_rooms r on r.id = cm.room_id
     where cm.user_id = (select auth.uid())
       and (r.client_id is null
            or r.client_id = any ((select private.accessible_client_ids())::uuid[])
            or (select private.sees_all_clients())))
  end;
$$;

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
      where (select private.sees_all_clients()) or l.client_id = any ((select private.staff_client_ids())::uuid[])
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
  v_today date := private.agency_today();
  -- The period starts, worked out once.
  v_day timestamptz := v_today::timestamp at time zone v_tz;
  v_week timestamptz := (v_today - 6)::timestamp at time zone v_tz;
  v_month timestamptz := (v_today - 29)::timestamp at time zone v_tz;
begin
  if not private.can_see_client_leads(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_from := case p_period
    when 'today' then v_day
    when '7d' then v_week
    when '30d' then v_month
    when 'all' then '-infinity'::timestamptz
  end;
  if v_from is null then
    raise exception 'Unknown period' using errcode = '22023';
  end if;
  select coalesce(s.template = 'full', false) into v_full from public.client_crm_settings s where s.client_id = p_client;

  return jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'today', count(*) filter (where l.lead_at >= v_day),
        '7d', count(*) filter (where l.lead_at >= v_week),
        '30d', count(*) filter (where l.lead_at >= v_month),
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
