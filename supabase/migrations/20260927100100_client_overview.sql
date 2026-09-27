-- SUN MEDIA — client resource view for the owner and managers: everything about one client on one
-- screen. Runs as the caller (RLS): plan figures only appear for people allowed to see them.

create or replace function public.get_client_overview(p_client_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_client public.clients;
  v_tz text := private.agency_timezone();
  v_today date := private.agency_today();
  v_sub public.client_subscriptions;
  v_plan_visible boolean;
begin
  if auth.uid() is null or not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_client from public.clients where id = p_client_id and deleted_at is null;
  if not found then
    return null;
  end if;
  v_plan_visible := private.can_view_subscription_of(p_client_id);
  if v_plan_visible then
    select * into v_sub from public.client_subscriptions
    where client_id = p_client_id and status in ('active', 'scheduled') and ends_on >= v_today
    order by case status when 'active' then 0 else 1 end, starts_on limit 1;
  end if;

  return jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'name', v_client.name, 'code', v_client.code, 'logo_url', v_client.logo_url,
      'status', v_client.status, 'industry', v_client.industry, 'website', v_client.website, 'created_at', v_client.created_at),
    'pipeline', coalesce((
      select jsonb_object_agg(status, n) from (
        select c.status, count(*) as n from public.content_items c
        where c.client_id = p_client_id and c.deleted_at is null and c.status <> 'cancelled'
        group by c.status
      ) s
    ), '{}'::jsonb),
    'overdue_content', (
      select count(*) from public.content_items c
      where c.client_id = p_client_id and c.deleted_at is null and c.due_at < now()
        and c.status not in ('approved', 'scheduled', 'published', 'cancelled')
    ),
    'waiting_client', (
      select jsonb_build_object('count', count(*), 'oldest', min(v.sent_to_client_at))
      from public.content_versions v where v.client_id = p_client_id and v.status = 'client_review'
    ),
    'plan', case when v_sub.id is null then null else jsonb_build_object(
      'name', (select name from public.plans where id = v_sub.plan_id),
      'status', v_sub.status, 'starts_on', v_sub.starts_on, 'ends_on', v_sub.ends_on,
      'days_left', greatest(0, v_sub.ends_on - greatest(v_today, v_sub.starts_on - 1)),
      'usage', coalesce((
        select jsonb_agg(jsonb_build_object('service_name', u.service_name, 'unit', u.unit, 'planned', u.planned, 'used', u.used) order by u.position)
        from public.subscription_usage_summary u
        where u.subscription_id = v_sub.id and u.is_quantitative and u.is_included
      ), '[]'::jsonb)
    ) end,
    'plan_visible', v_plan_visible,
    'shootings', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'location_name', s.location_name, 'status', s.status) order by s.starts_at)
      from (
        select * from public.shootings s
        where s.client_id = p_client_id and s.deleted_at is null and s.status not in ('cancelled', 'completed')
          and s.ends_at >= now()
        order by s.starts_at limit 5
      ) s
    ), '[]'::jsonb),
    'tasks', jsonb_build_object(
      'open', (select count(*) from public.tasks t where t.client_id = p_client_id and t.deleted_at is null and t.status not in ('done', 'cancelled')),
      'overdue', (select count(*) from public.tasks t where t.client_id = p_client_id and t.deleted_at is null
                    and t.status not in ('done', 'cancelled') and t.due_at < now()),
      'soon', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_at', t.due_at, 'status', t.status, 'priority', t.priority) order by t.due_at)
        from (
          select * from public.tasks t
          where t.client_id = p_client_id and t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at is not null
          order by t.due_at limit 5
        ) t
      ), '[]'::jsonb)
    ),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'team_role', m.team_role, 'full_name', p.full_name, 'avatar_url', p.avatar_url) order by m.team_role, p.full_name)
      from public.client_team_members m join public.profiles p on p.id = m.user_id
      where m.client_id = p_client_id and p.deleted_at is null
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'full_name', p.full_name, 'role_name', r.name, 'title', m.title,
                                          'phone', p.phone, 'email', p.email, 'last_seen_at', p.last_seen_at) order by r.rank, p.full_name)
      from public.client_members m join public.profiles p on p.id = m.user_id left join public.roles r on r.id = m.role_id
      where m.client_id = p_client_id and p.deleted_at is null
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'period_month', r.period_month, 'status', r.status) order by r.period_month desc)
      from (select * from public.monthly_reports r where r.client_id = p_client_id order by r.period_month desc limit 3) r
    ), '[]'::jsonb),
    'files', (
      select jsonb_build_object('count', count(*), 'bytes', coalesce(sum(f.size_bytes), 0))
      from public.files f where f.client_id = p_client_id and f.deleted_at is null and f.status = 'uploaded' and f.chat_room_id is null
    ),
    'chat_room_id', (select id from public.chat_rooms where client_id = p_client_id and kind = 'project' and is_default and id = any (private.my_chat_room_ids())),
    'published_this_month', (
      select count(*) from public.content_items c where c.client_id = p_client_id and c.status = 'published' and c.deleted_at is null
        and (c.published_at at time zone v_tz)::date >= date_trunc('month', v_today)::date
    )
  );
end;
$$;

revoke execute on function public.get_client_overview(uuid) from public, anon;
grant execute on function public.get_client_overview(uuid) to authenticated;
