-- SUN MEDIA — read models for the role home screens and the owner command center.
--   * content pipeline transitions for assignees include READY_FOR_SHOOT and SHOT
--   * get_command_center: + deadline radar, delayed publications, per-client status
--   * get_activity_feed: human-readable operational stream from the audit log
--   * get_client_home / get_employee_home: SECURITY INVOKER — every row passes the caller's RLS

-- ---------------------------------------------------------------------------
-- Pipeline: which moves an assigned (non-manager) employee may make
-- ---------------------------------------------------------------------------
create or replace function private.assignee_transition_allowed(p_from public.content_status, p_to public.content_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('idea'::public.content_status, 'script'::public.content_status),
    ('script', 'ready_for_shoot'),
    ('script', 'editing'),
    ('ready_for_shoot', 'shooting'),
    ('shooting', 'shot'),
    ('shot', 'editing'),
    ('shooting', 'editing'),
    ('revision', 'editing'),
    ('approved', 'scheduled'),
    ('scheduled', 'published')
  );
$$;

-- Statuses in which a content item is actively being produced (used by several read models).
create or replace function private.content_in_production(p_status public.content_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('script', 'ready_for_shoot', 'shooting', 'shot', 'editing', 'internal_review', 'client_review', 'revision');
$$;

grant execute on function private.content_in_production(public.content_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Daily Command Center (Owner / Director / Admin)
-- ---------------------------------------------------------------------------
create or replace function public.get_command_center(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_date, private.agency_today());
  v_from timestamptz := v_date::timestamp at time zone private.agency_timezone();
  v_to timestamptz := (v_date + 1)::timestamp at time zone private.agency_timezone();
begin
  if not private.has_permission('dashboard.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'date', v_date,
    'generated_at', now(),
    'tasks', (
      select jsonb_build_object(
        'total', count(*),
        'completed', count(*) filter (where t.status = 'done'),
        'in_progress', count(*) filter (where t.status in ('in_progress', 'in_review', 'revision')),
        'todo', count(*) filter (where t.status = 'todo'),
        'overdue', (select count(*) from public.tasks o
                    where o.deleted_at is null and o.status not in ('done', 'cancelled') and o.due_at < now())
      )
      from public.tasks t
      where t.deleted_at is null and t.status <> 'cancelled' and t.due_at >= v_from and t.due_at < v_to
    ),
    'shootings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title, 'status', s.status,
        'client_id', s.client_id, 'client_name', c.name, 'location_name', s.location_name,
        'location_address', s.location_address,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', sm.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
            'role', sm.role, 'attendance', sa.status
          ) order by p.full_name)
          from public.shooting_members sm
          join public.profiles p on p.id = sm.user_id
          left join public.shooting_attendance sa on sa.shooting_id = sm.shooting_id and sa.user_id = sm.user_id
          where sm.shooting_id = s.id
        ), '[]')
      ) order by s.starts_at)
      from public.shootings s
      join public.clients c on c.id = s.client_id
      where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= v_from and s.starts_at < v_to
    ), '[]'),
    'attendance', (
      select jsonb_build_object(
        'employees', count(*),
        'present', count(*) filter (where a.status = 'present'),
        'late', count(*) filter (where a.status = 'late'),
        'absent', count(*) filter (where a.status = 'absent'),
        'excused', count(*) filter (where a.status = 'excused'),
        'vacation', count(*) filter (where a.status = 'vacation'),
        'remote', count(*) filter (where a.status = 'remote'),
        'unmarked', count(*) filter (where a.id is null),
        'people', coalesce(jsonb_agg(jsonb_build_object(
          'user_id', e.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'job_title', e.job_title,
          'status', a.status, 'late_minutes', a.late_minutes, 'arrived_at', a.arrived_at
        ) order by p.full_name), '[]')
      )
      from public.employees e
      join public.profiles p on p.id = e.user_id and p.status = 'active' and p.deleted_at is null
      left join public.attendance a on a.user_id = e.user_id and a.work_date = v_date
      where e.status <> 'terminated'
        and (extract(isodow from v_date)::smallint = any (e.work_days) or a.id is not null)
    ),
    'approvals', jsonb_build_object(
      'client_review', (select count(*) from public.content_items where deleted_at is null and status = 'client_review'),
      'internal_review', (select count(*) from public.content_items where deleted_at is null and status = 'internal_review'),
      'revision', (select count(*) from public.content_items where deleted_at is null and status = 'revision'),
      'items', coalesce((
        select jsonb_agg(x order by x ->> 'since')
        from (
          select jsonb_build_object(
            'content_id', ci.id, 'label', private.content_label(ci.id), 'title', ci.title, 'status', ci.status,
            'content_type', ci.content_type, 'client_name', c.name, 'since', ci.status_changed_at,
            'due_at', ci.client_approval_due_at
          ) as x
          from public.content_items ci
          join public.clients c on c.id = ci.client_id
          where ci.deleted_at is null and ci.status in ('client_review', 'internal_review')
          order by ci.status_changed_at
          limit 20
        ) q
      ), '[]')
    ),
    'overdue', coalesce((
      select jsonb_agg(x)
      from (
        select jsonb_build_object(
          'task_id', t.id, 'title', t.title, 'task_type', t.task_type, 'due_at', t.due_at,
          'client_name', c.name,
          'assignees', coalesce((
            select jsonb_agg(p.full_name order by p.full_name)
            from public.task_assignments ta join public.profiles p on p.id = ta.user_id
            where ta.task_id = t.id
          ), '[]')
        ) as x
        from public.tasks t
        left join public.clients c on c.id = t.client_id
        where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at < now()
        order by t.due_at
        limit 20
      ) q
    ), '[]'),
    -- Deadline radar: overdue, critical (< 2h) and upcoming (< 24h) open tasks
    'deadlines', (
      select jsonb_build_object(
        'overdue', count(*) filter (where t.due_at < now()),
        'critical', count(*) filter (where t.due_at >= now() and t.due_at < now() + interval '2 hours'),
        'upcoming', count(*) filter (where t.due_at >= now() + interval '2 hours'),
        'items', coalesce((
          select jsonb_agg(x order by x ->> 'due_at')
          from (
            select jsonb_build_object(
              'task_id', d.id, 'title', d.title, 'task_type', d.task_type, 'due_at', d.due_at,
              'client_name', dc.name, 'content_id', d.content_id,
              'state', case when d.due_at < now() then 'overdue'
                            when d.due_at < now() + interval '2 hours' then 'critical'
                            else 'upcoming' end,
              'assignees', coalesce((
                select jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url) order by p.full_name)
                from public.task_assignments ta join public.profiles p on p.id = ta.user_id
                where ta.task_id = d.id
              ), '[]')
            ) as x
            from public.tasks d
            left join public.clients dc on dc.id = d.client_id
            where d.deleted_at is null and d.status not in ('done', 'cancelled')
              and d.due_at < now() + interval '24 hours'
            order by d.due_at
            limit 15
          ) q
        ), '[]')
      )
      from public.tasks t
      where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at < now() + interval '24 hours'
    ),
    'publications', (
      select jsonb_build_object(
        'scheduled', count(*),
        'published', count(*) filter (where p.status = 'published'),
        'delayed', count(*) filter (where p.status in ('planned', 'scheduled') and p.scheduled_at < now()),
        'failed', count(*) filter (where p.status = 'failed'),
        'items', coalesce(jsonb_agg(jsonb_build_object(
          'publication_id', p.id, 'content_id', p.content_id, 'label', private.content_label(p.content_id),
          'platform', p.platform, 'scheduled_at', p.scheduled_at, 'status', p.status, 'client_name', c.name,
          'delayed', p.status in ('planned', 'scheduled') and p.scheduled_at < now()
        ) order by p.scheduled_at), '[]')
      )
      from public.content_publications p
      join public.clients c on c.id = p.client_id
      where p.status <> 'cancelled' and p.scheduled_at >= v_from and p.scheduled_at < v_to
    ),
    'clients', coalesce((
      select jsonb_agg(x order by (x ->> 'today_events')::int desc, x ->> 'name')
      from (
        select jsonb_build_object(
          'id', c.id, 'name', c.name, 'code', c.code, 'logo_url', c.logo_url, 'status', c.status,
          'active_projects', (select count(*) from public.projects pr
                              where pr.client_id = c.id and pr.deleted_at is null and pr.status in ('planning', 'active')),
          'in_production', (select count(*) from public.content_items ci
                            where ci.client_id = c.id and ci.deleted_at is null and private.content_in_production(ci.status)),
          'waiting_approval', (select count(*) from public.content_items ci
                               where ci.client_id = c.id and ci.deleted_at is null and ci.status = 'client_review'),
          'overdue_tasks', (select count(*) from public.tasks t
                            where t.client_id = c.id and t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at < now()),
          'today_events',
            (select count(*) from public.shootings s
             where s.client_id = c.id and s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= v_from and s.starts_at < v_to)
            + (select count(*) from public.content_publications p
               where p.client_id = c.id and p.status <> 'cancelled' and p.scheduled_at >= v_from and p.scheduled_at < v_to)
            + (select count(*) from public.content_items ci
               where ci.client_id = c.id and ci.deleted_at is null and ci.status <> 'cancelled' and ci.due_at >= v_from and ci.due_at < v_to)
        ) as x
        from public.clients c
        where c.deleted_at is null and c.status = 'active'
      ) q
    ), '[]'),
    'activity_today', (
      select count(*) from public.audit_logs a where a.occurred_at >= v_from and a.occurred_at < v_to
    )
  );
end;
$$;

grant execute on function public.get_command_center(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Activity feed: operational events from the audit log, labelled for people
-- ---------------------------------------------------------------------------
create or replace function public.get_activity_feed(
  p_limit integer default 30,
  p_before bigint default null,
  p_client_id uuid default null
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_avatar text,
  action text,
  entity_type text,
  entity_id text,
  client_id uuid,
  client_name text,
  label text,
  subject_name text,
  changes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission('audit.read') or private.has_permission('dashboard.view')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.occurred_at,
    a.actor_id,
    ap.full_name,
    ap.avatar_url,
    a.action,
    a.entity_type,
    a.entity_id,
    a.client_id,
    c.name,
    case a.entity_type
      when 'content_items' then private.content_label(a.entity_id::uuid)
      when 'content_publications' then private.content_label((select cp.content_id from public.content_publications cp where cp.id = a.entity_id::uuid))
      when 'revisions' then private.content_label((select r.content_id from public.revisions r where r.id = a.entity_id::uuid))
      when 'tasks' then (select t.title from public.tasks t where t.id = a.entity_id::uuid)
      when 'shootings' then (select s.title from public.shootings s where s.id = a.entity_id::uuid)
      when 'shooting_attendance' then (select s.title from public.shootings s where s.id = split_part(a.entity_id, ':', 1)::uuid)
      when 'files' then (select f.name from public.files f where f.id = a.entity_id::uuid)
      when 'projects' then (select pr.name from public.projects pr where pr.id = a.entity_id::uuid)
      when 'clients' then (select cl.name from public.clients cl where cl.id = a.entity_id::uuid)
      when 'monthly_reports' then (select coalesce(mr.title, to_char(mr.period_month, 'YYYY-MM')) from public.monthly_reports mr where mr.id = a.entity_id::uuid)
      else null
    end,
    case a.entity_type
      when 'attendance' then (select sp.full_name from public.profiles sp
                              where sp.id = coalesce((select at.user_id from public.attendance at where at.id = a.entity_id::uuid),
                                                     (a.new_values ->> 'user_id')::uuid))
      when 'shooting_attendance' then (select sp.full_name from public.profiles sp where sp.id = split_part(a.entity_id, ':', 2)::uuid)
      when 'task_assignments' then null
      else null
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'status', a.new_values -> 'status',
      'old_status', a.old_values -> 'status',
      'late_minutes', a.new_values -> 'late_minutes',
      'title', a.new_values -> 'title'
    ))
  from public.audit_logs a
  left join public.profiles ap on ap.id = a.actor_id
  left join public.clients c on c.id = a.client_id
  where (p_before is null or a.id < p_before)
    and (p_client_id is null or a.client_id = p_client_id)
    and a.entity_type in ('content_items', 'content_publications', 'revisions', 'tasks', 'shootings',
                          'shooting_attendance', 'attendance', 'files', 'projects', 'clients', 'monthly_reports')
    -- Updates only matter when a status moved; inserts are always meaningful.
    and (a.action not like '%.update' or a.new_values ? 'status')
    and a.action not like '%.delete'
    -- Uploads are reported once they finish, not when the upload is reserved.
    and not (a.entity_type = 'files' and a.action = 'files.insert')
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

grant execute on function public.get_activity_feed(integer, bigint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Client home (SECURITY INVOKER: the client's own RLS decides every row)
-- ---------------------------------------------------------------------------
create or replace function public.get_client_home(p_client_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_from timestamptz := v_today::timestamp at time zone private.agency_timezone();
  v_to timestamptz := (v_today + 1)::timestamp at time zone private.agency_timezone();
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_from timestamptz := v_month_start::timestamp at time zone private.agency_timezone();
  v_client public.clients;
  v_sub public.client_subscriptions;
begin
  select * into v_client from public.clients where id = p_client_id and deleted_at is null;
  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  select * into v_sub from public.client_subscriptions s
  where s.client_id = p_client_id and s.status = 'active' and v_today between s.starts_on and s.ends_on
  order by s.starts_on desc limit 1;

  return jsonb_build_object(
    'date', v_today,
    'client', jsonb_build_object('id', v_client.id, 'name', v_client.name, 'code', v_client.code,
                                 'logo_url', v_client.logo_url, 'industry', v_client.industry),
    'subscription', case when v_sub.id is null then null else (
      select jsonb_build_object('id', v_sub.id, 'plan_id', pl.id, 'plan_name', pl.name, 'plan_slug', pl.slug,
                                'starts_on', v_sub.starts_on, 'ends_on', v_sub.ends_on, 'status', v_sub.status)
      from public.plans pl where pl.id = v_sub.plan_id
    ) end,
    'usage', case when v_sub.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('service_key', u.service_key, 'service_name', u.service_name, 'unit', u.unit,
                                          'planned', u.planned, 'used', u.used, 'is_quantitative', u.is_quantitative,
                                          'is_included', u.is_included) order by u.position)
      from public.subscription_usage_summary u where u.subscription_id = v_sub.id
    ), '[]') end,
    'today', coalesce((
      select jsonb_agg(jsonb_build_object('event_type', e.event_type, 'entity_id', e.entity_id, 'starts_at', e.starts_at,
                                          'ends_at', e.ends_at, 'title', e.title, 'content_id', e.content_id,
                                          'content_type', e.content_type, 'platform', e.platform, 'status', e.status,
                                          'location_name', e.location_name) order by e.starts_at)
      from public.get_calendar_events(v_from, v_to, p_client_id) e
    ), '[]'),
    'upcoming', coalesce((
      select jsonb_agg(x order by x ->> 'starts_at')
      from (
        select jsonb_build_object('event_type', e.event_type, 'entity_id', e.entity_id, 'starts_at', e.starts_at,
                                  'title', e.title, 'content_id', e.content_id, 'content_type', e.content_type,
                                  'platform', e.platform, 'status', e.status, 'location_name', e.location_name) as x
        from public.get_calendar_events(v_to, v_to + interval '14 days', p_client_id) e
        where e.event_type in ('shooting', 'publication', 'approval_deadline')
        order by e.starts_at
        limit 8
      ) q
    ), '[]'),
    'stats', jsonb_build_object(
      'in_production', (select count(*) from public.content_items ci
                        where ci.client_id = p_client_id and ci.deleted_at is null and private.content_in_production(ci.status)),
      'editing', (select count(*) from public.content_items ci
                  where ci.client_id = p_client_id and ci.deleted_at is null and ci.status in ('shot', 'editing', 'internal_review')),
      'waiting_approval', (select count(*) from public.content_items ci
                           where ci.client_id = p_client_id and ci.deleted_at is null and ci.status = 'client_review'),
      'publishing_today', (select count(*) from public.content_publications p
                           where p.client_id = p_client_id and p.status <> 'cancelled' and p.scheduled_at >= v_from and p.scheduled_at < v_to),
      'published_month', (select count(*) from public.content_items ci
                          where ci.client_id = p_client_id and ci.deleted_at is null and ci.status = 'published' and ci.published_at >= v_month_from),
      'shootings_month', (select count(*) from public.shootings s
                          where s.client_id = p_client_id and s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= v_month_from
                            and s.starts_at < (v_month_start + interval '1 month')::timestamp at time zone private.agency_timezone())
    ),
    'month_delivered', coalesce((
      select jsonb_object_agg(t.content_type, t.n)
      from (
        select ci.content_type, count(*) as n from public.content_items ci
        where ci.client_id = p_client_id and ci.deleted_at is null and ci.status = 'published' and ci.published_at >= v_month_from
        group by ci.content_type
      ) t
    ), '{}'),
    'awaiting_approval', coalesce((
      select jsonb_agg(x order by x ->> 'due_at' nulls last)
      from (
        select jsonb_build_object(
          'content_id', ci.id, 'title', ci.title, 'content_type', ci.content_type, 'number', ci.number,
          'due_at', ci.client_approval_due_at, 'revision_count', ci.revision_count,
          'version', (select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'sent_at', v.sent_to_client_at)
                      from public.content_versions v where v.content_id = ci.id and v.status = 'client_review'
                      order by v.version_number desc limit 1)
        ) as x
        from public.content_items ci
        where ci.client_id = p_client_id and ci.deleted_at is null and ci.status = 'client_review'
        limit 10
      ) q
    ), '[]'),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
                                          'team_role', tm.team_role) order by tm.team_role, p.full_name)
      from public.client_team_members tm join public.profiles p on p.id = tm.user_id
      where tm.client_id = p_client_id
    ), '[]'),
    'notifications', coalesce((
      select jsonb_agg(x order by x ->> 'created_at' desc)
      from (
        select jsonb_build_object('id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at,
                                  'read_at', n.read_at, 'entity_type', n.entity_type, 'entity_id', n.entity_id) as x
        from public.notifications n
        where n.user_id = auth.uid()
        order by n.created_at desc
        limit 5
      ) q
    ), '[]'),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null)
  );
end;
$$;

grant execute on function public.get_client_home(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Employee home (SECURITY INVOKER; always about the caller)
-- ---------------------------------------------------------------------------
create or replace function public.get_employee_home()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := private.agency_today();
  v_from timestamptz := v_today::timestamp at time zone private.agency_timezone();
  v_to timestamptz := (v_today + 1)::timestamp at time zone private.agency_timezone();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'date', v_today,
    'attendance', (
      select jsonb_build_object('status', a.status, 'arrived_at', a.arrived_at, 'late_minutes', a.late_minutes)
      from public.attendance a where a.user_id = v_uid and a.work_date = v_today
    ),
    'task_stats', (
      select jsonb_build_object(
        'open', count(*) filter (where t.status not in ('done', 'cancelled')),
        'due_today', count(*) filter (where t.status not in ('done', 'cancelled') and t.due_at >= v_from and t.due_at < v_to),
        'overdue', count(*) filter (where t.status not in ('done', 'cancelled') and t.due_at < now()),
        'in_progress', count(*) filter (where t.status in ('in_progress', 'in_review', 'revision')),
        'done_today', count(*) filter (where t.status = 'done' and t.completed_at >= v_from and t.completed_at < v_to)
      )
      from public.tasks t
      join public.task_assignments ta on ta.task_id = t.id and ta.user_id = v_uid
      where t.deleted_at is null
    ),
    'tasks', coalesce((
      select jsonb_agg(x order by (x ->> 'due_at') nulls last)
      from (
        select jsonb_build_object(
          'id', t.id, 'title', t.title, 'task_type', t.task_type, 'status', t.status, 'priority', t.priority,
          'due_at', t.due_at, 'client_name', c.name, 'client_code', c.code, 'content_id', t.content_id,
          'content_title', ci.title, 'content_type', ci.content_type, 'revision_count', ci.revision_count
        ) as x
        from public.tasks t
        join public.task_assignments ta on ta.task_id = t.id and ta.user_id = v_uid
        left join public.clients c on c.id = t.client_id
        left join public.content_items ci on ci.id = t.content_id
        where t.deleted_at is null and t.status not in ('done', 'cancelled')
          and (t.due_at is null or t.due_at < now() + interval '3 days')
        order by t.due_at nulls last
        limit 20
      ) q
    ), '[]'),
    'shootings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
        'location_name', s.location_name, 'location_address', s.location_address, 'location_url', s.location_url,
        'client_name', c.name, 'my_role', sm.role,
        'my_attendance', (select sa.status from public.shooting_attendance sa where sa.shooting_id = s.id and sa.user_id = v_uid),
        'crew', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'role', m.role) order by p.full_name)
          from public.shooting_members m join public.profiles p on p.id = m.user_id where m.shooting_id = s.id
        ), '[]'),
        'content', coalesce((
          select jsonb_agg(jsonb_build_object('id', ci.id, 'title', ci.title, 'content_type', ci.content_type) order by ci.number)
          from public.content_items ci where ci.shooting_id = s.id and ci.deleted_at is null
        ), '[]')
      ) order by s.starts_at)
      from public.shootings s
      join public.shooting_members sm on sm.shooting_id = s.id and sm.user_id = v_uid
      -- An assignee may not be on the client team, so the client row can be invisible to them.
      left join public.clients c on c.id = s.client_id
      where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= v_from and s.starts_at < v_to + interval '1 day'
    ), '[]'),
    'content', coalesce((
      select jsonb_agg(x order by (x ->> 'due_at') nulls last)
      from (
        select jsonb_build_object(
          'id', ci.id, 'title', ci.title, 'content_type', ci.content_type, 'status', ci.status, 'number', ci.number,
          'due_at', ci.due_at, 'client_name', c.name, 'client_code', c.code, 'my_role', ca.role,
          'revision_count', ci.revision_count
        ) as x
        from public.content_items ci
        join public.content_assignments ca on ca.content_id = ci.id and ca.user_id = v_uid
        left join public.clients c on c.id = ci.client_id
        where ci.deleted_at is null and private.content_in_production(ci.status)
        order by ci.due_at nulls last
        limit 12
      ) q
    ), '[]'),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = v_uid and n.read_at is null)
  );
end;
$$;

grant execute on function public.get_employee_home() to authenticated;
