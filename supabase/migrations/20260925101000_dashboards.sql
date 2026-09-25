-- SUN MEDIA — read models: calendar feed, daily command center, employee scorecards, client resource view.

-- ---------------------------------------------------------------------------
-- Calendar (SECURITY INVOKER: every row passes the caller's RLS, so clients only see their own
-- plan and never internal task deadlines)
-- ---------------------------------------------------------------------------
create or replace function public.get_calendar_events(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id uuid default null
)
returns table (
  event_type text,
  entity_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  title text,
  client_id uuid,
  client_name text,
  content_id uuid,
  content_type public.content_type,
  platform public.social_platform,
  status text,
  location_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'shooting', s.id, s.starts_at, s.ends_at, s.title, s.client_id, c.name,
         null::uuid, null::public.content_type, null::public.social_platform, s.status::text, s.location_name
  from public.shootings s
  join public.clients c on c.id = s.client_id
  where s.deleted_at is null and s.starts_at < p_to and s.ends_at >= p_from
    and (p_client_id is null or s.client_id = p_client_id)

  union all
  select 'publication', p.id, p.scheduled_at, p.scheduled_at, ci.title, p.client_id, c.name,
         ci.id, ci.content_type, p.platform, p.status::text, null
  from public.content_publications p
  join public.content_items ci on ci.id = p.content_id
  join public.clients c on c.id = p.client_id
  where p.scheduled_at >= p_from and p.scheduled_at < p_to and p.status <> 'cancelled'
    and (p_client_id is null or p.client_id = p_client_id)

  union all
  select 'approval_deadline', ci.id, ci.client_approval_due_at, ci.client_approval_due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.client_approval_due_at >= p_from and ci.client_approval_due_at < p_to
    and ci.status not in ('approved', 'scheduled', 'published', 'cancelled')
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select 'content_due', ci.id, ci.due_at, ci.due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.due_at >= p_from and ci.due_at < p_to
    and ci.status not in ('cancelled')
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select case t.task_type when 'editing' then 'editing_deadline' when 'meeting' then 'meeting' when 'design' then 'design_deadline' else 'task_deadline' end,
         t.id, coalesce(t.starts_at, t.due_at), t.due_at, t.title, t.client_id, c.name,
         t.content_id, null, null, t.status::text, null
  from public.tasks t
  left join public.clients c on c.id = t.client_id
  where t.deleted_at is null and t.due_at >= p_from and t.due_at < p_to and t.status <> 'cancelled'
    and (p_client_id is null or t.client_id = p_client_id)

  order by 3;
$$;

grant execute on function public.get_calendar_events(timestamptz, timestamptz, uuid) to authenticated;

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
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', sm.user_id, 'full_name', p.full_name, 'role', sm.role, 'attendance', sa.status
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
          'user_id', e.user_id, 'full_name', p.full_name, 'job_title', e.job_title,
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
      'items', coalesce((
        select jsonb_agg(x order by x ->> 'since')
        from (
          select jsonb_build_object(
            'content_id', ci.id, 'label', private.content_label(ci.id), 'status', ci.status,
            'client_name', c.name, 'since', ci.status_changed_at, 'due_at', ci.client_approval_due_at
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
    'publications', (
      select jsonb_build_object(
        'scheduled', count(*),
        'published', count(*) filter (where p.status = 'published'),
        'items', coalesce(jsonb_agg(jsonb_build_object(
          'publication_id', p.id, 'content_id', p.content_id, 'label', private.content_label(p.content_id),
          'platform', p.platform, 'scheduled_at', p.scheduled_at, 'status', p.status, 'client_name', c.name
        ) order by p.scheduled_at), '[]')
      )
      from public.content_publications p
      join public.clients c on c.id = p.client_id
      where p.status <> 'cancelled' and p.scheduled_at >= v_from and p.scheduled_at < v_to
    )
  );
end;
$$;

grant execute on function public.get_command_center(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Employee performance scorecards
-- ---------------------------------------------------------------------------
create or replace function private.compute_employee_scorecards(p_from date, p_to date, p_user uuid default null)
returns table (user_id uuid, full_name text, role_keys text[], metrics jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone private.agency_timezone()) as t_from,
           ((p_to + 1)::timestamp at time zone private.agency_timezone()) as t_to
  ),
  staff as (
    select e.user_id, p.full_name,
           (select coalesce(array_agg(r.key order by r.rank), '{}')
            from public.user_roles ur join public.roles r on r.id = ur.role_id
            where ur.user_id = e.user_id) as role_keys
    from public.employees e
    join public.profiles p on p.id = e.user_id
    where e.status <> 'terminated' and (p_user is null or e.user_id = p_user)
  ),
  task_stats as (
    select ta.user_id,
           count(*) as assigned,
           count(*) filter (where t.status = 'done') as completed,
           count(*) filter (where t.status = 'done' and (t.due_at is null or t.completed_at <= t.due_at)) as on_time,
           count(*) filter (where t.overdue_at is not null) as overdue,
           round(avg(extract(epoch from (t.completed_at - coalesce(t.started_at, t.created_at))) / 60)
             filter (where t.status = 'done')) as avg_completion_minutes,
           sum(coalesce(t.estimated_minutes, 0)) as workload_minutes,
           count(*) filter (where t.task_type = 'editing') as editing_assigned,
           count(*) filter (where t.task_type = 'editing' and t.status = 'done') as editing_done,
           count(*) filter (where t.task_type = 'editing' and t.status = 'done'
                            and (t.due_at is null or t.completed_at <= t.due_at)) as editing_on_time,
           round(avg(extract(epoch from (t.completed_at - coalesce(t.started_at, t.created_at))) / 60)
             filter (where t.task_type = 'editing' and t.status = 'done')) as avg_editing_minutes
    from public.task_assignments ta
    join public.tasks t on t.id = ta.task_id
    cross join bounds b
    where t.deleted_at is null and t.status <> 'cancelled'
      and coalesce(t.due_at, t.created_at) >= b.t_from and coalesce(t.due_at, t.created_at) < b.t_to
    group by ta.user_id
  ),
  version_stats as (
    select cv.submitted_by as user_id,
           count(distinct cv.content_id) as contents_submitted,
           count(distinct cv.content_id) filter (where cv.status = 'approved') as videos_edited
    from public.content_versions cv
    cross join bounds b
    where cv.submitted_at >= b.t_from and cv.submitted_at < b.t_to
    group by cv.submitted_by
  ),
  revision_stats as (
    select ca.user_id, count(distinct r.id) as revisions
    from public.revisions r
    join public.content_assignments ca on ca.content_id = r.content_id and ca.role in ('editor', 'designer')
    cross join bounds b
    where r.requested_at >= b.t_from and r.requested_at < b.t_to
    group by ca.user_id
  ),
  approval_stats as (
    select ca.user_id,
           count(distinct c.id) as approved_contents,
           count(distinct c.id) filter (
             where not exists (select 1 from public.revisions r where r.content_id = c.id and r.stage = 'client')
           ) as approved_first_attempt
    from public.content_items c
    join public.content_assignments ca on ca.content_id = c.id and ca.role in ('editor', 'designer')
    cross join bounds b
    where c.approved_at >= b.t_from and c.approved_at < b.t_to
    group by ca.user_id
  ),
  shooting_stats as (
    select sm.user_id,
           count(*) as shootings_assigned,
           count(*) filter (where s.status = 'completed') as shootings_completed,
           count(*) filter (where sa.status = 'arrived') as shootings_arrived,
           count(*) filter (where sa.status = 'late') as shootings_late,
           count(*) filter (where sa.status = 'absent') as shootings_absent
    from public.shooting_members sm
    join public.shootings s on s.id = sm.shooting_id
    left join public.shooting_attendance sa on sa.shooting_id = sm.shooting_id and sa.user_id = sm.user_id
    cross join bounds b
    where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= b.t_from and s.starts_at < b.t_to
    group by sm.user_id
  ),
  attendance_stats as (
    select a.user_id,
           count(*) filter (where a.status in ('present', 'remote')) as present_days,
           count(*) filter (where a.status = 'late') as late_days,
           sum(a.late_minutes) as late_minutes,
           count(*) filter (where a.status = 'absent') as absent_days,
           count(*) filter (where a.status = 'excused') as excused_days,
           count(*) filter (where a.status = 'vacation') as vacation_days
    from public.attendance a
    where a.work_date between p_from and p_to
    group by a.user_id
  ),
  publication_stats as (
    select p.published_by as user_id,
           count(*) as published,
           count(*) filter (where p.scheduled_at is not null and p.published_at > p.scheduled_at + interval '1 hour') as delayed
    from public.content_publications p
    cross join bounds b
    where p.status = 'published' and p.published_at >= b.t_from and p.published_at < b.t_to
    group by p.published_by
  ),
  smm_calendar as (
    select ctm.user_id,
           count(ci.id) as planned,
           count(ci.id) filter (where ci.status in ('approved', 'scheduled', 'published')) as completed
    from public.client_team_members ctm
    join public.content_items ci on ci.client_id = ctm.client_id
    where ctm.team_role = 'smm_manager'
      and ci.deleted_at is null and ci.status <> 'cancelled' and ci.counts_toward_plan
      and ci.plan_month between date_trunc('month', p_from)::date and p_to
    group by ctm.user_id
  )
  select s.user_id, s.full_name, s.role_keys, jsonb_strip_nulls(jsonb_build_object(
    'assigned_tasks', coalesce(ts.assigned, 0),
    'completed_tasks', coalesce(ts.completed, 0),
    'completed_on_time', coalesce(ts.on_time, 0),
    'overdue_tasks', coalesce(ts.overdue, 0),
    'on_time_rate', case when ts.completed > 0 then round(100.0 * ts.on_time / ts.completed) end,
    'avg_completion_minutes', ts.avg_completion_minutes,
    'workload_minutes', coalesce(ts.workload_minutes, 0),
    'revision_count', coalesce(rs.revisions, 0),
    'approval_rate', case when aps.approved_contents > 0 then round(100.0 * aps.approved_first_attempt / aps.approved_contents) end,
    'present_days', coalesce(ats.present_days, 0),
    'late_days', coalesce(ats.late_days, 0),
    'late_minutes', coalesce(ats.late_minutes, 0),
    'absent_days', coalesce(ats.absent_days, 0),
    'excused_days', coalesce(ats.excused_days, 0),
    'vacation_days', coalesce(ats.vacation_days, 0),
    'shootings_assigned', coalesce(ss.shootings_assigned, 0),
    'shootings_completed', coalesce(ss.shootings_completed, 0),
    'shootings_arrived', coalesce(ss.shootings_arrived, 0),
    'shootings_late', coalesce(ss.shootings_late, 0),
    'shootings_absent', coalesce(ss.shootings_absent, 0),
    'editor', case when 'editor' = any (s.role_keys) then jsonb_build_object(
      'videos_edited', coalesce(vs.videos_edited, 0),
      'contents_submitted', coalesce(vs.contents_submitted, 0),
      'revisions', coalesce(rs.revisions, 0),
      'on_time_rate', case when ts.editing_done > 0 then round(100.0 * ts.editing_on_time / ts.editing_done) end,
      'avg_editing_minutes', ts.avg_editing_minutes
    ) end,
    'smm', case when 'smm_manager' = any (s.role_keys) then jsonb_build_object(
      'published', coalesce(ps.published, 0),
      'delayed_publications', coalesce(ps.delayed, 0),
      'calendar_planned', coalesce(sc.planned, 0),
      'calendar_completed', coalesce(sc.completed, 0),
      'calendar_completion_rate', case when sc.planned > 0 then round(100.0 * sc.completed / sc.planned) end
    ) end
  ))
  from staff s
  left join task_stats ts on ts.user_id = s.user_id
  left join version_stats vs on vs.user_id = s.user_id
  left join revision_stats rs on rs.user_id = s.user_id
  left join approval_stats aps on aps.user_id = s.user_id
  left join shooting_stats ss on ss.user_id = s.user_id
  left join attendance_stats ats on ats.user_id = s.user_id
  left join publication_stats ps on ps.user_id = s.user_id
  left join smm_calendar sc on sc.user_id = s.user_id
  order by s.full_name;
$$;

create or replace function public.get_employee_scorecards(p_from date, p_to date, p_user_id uuid default null)
returns table (user_id uuid, full_name text, role_keys text[], metrics jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission('performance.read') or (p_user_id is not null and p_user_id = auth.uid())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Invalid period' using errcode = '22023';
  end if;
  return query select * from private.compute_employee_scorecards(p_from, p_to, p_user_id);
end;
$$;

grant execute on function public.get_employee_scorecards(date, date, uuid) to authenticated;

-- Monthly frozen snapshots for historical comparison.
create table public.employee_performance (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  metrics jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, period_month)
);

alter table public.employee_performance enable row level security;
create policy "read performance snapshots" on public.employee_performance
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.has_permission('performance.read'))
  );
revoke insert, update, delete on public.employee_performance from authenticated;

create or replace function private.snapshot_employee_performance(p_month date default null)
returns void
language sql
security definer
set search_path = ''
as $$
  with m as (
    select coalesce(p_month, (date_trunc('month', private.agency_today()) - interval '1 month')::date) as month
  )
  insert into public.employee_performance (user_id, period_month, metrics)
  select sc.user_id, m.month, sc.metrics
  from m, private.compute_employee_scorecards(m.month, (m.month + interval '1 month' - interval '1 day')::date) sc
  on conflict (user_id, period_month) do update set metrics = excluded.metrics, computed_at = now();
$$;

-- 20:30 UTC on the 1st = 01:30 Tashkent on the 2nd; snapshots the month that just ended.
select cron.schedule('sunmedia-performance-snapshot', '30 20 1 * *', $$select private.snapshot_employee_performance()$$);

-- ---------------------------------------------------------------------------
-- Owner: resources spent per client
-- ---------------------------------------------------------------------------
create or replace function public.get_client_resource_report(p_from date, p_to date)
returns table (client_id uuid, client_name text, metrics jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone private.agency_timezone();
  v_to timestamptz := (p_to + 1)::timestamp at time zone private.agency_timezone();
begin
  if not private.has_permission('finance.read') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Invalid period' using errcode = '22023';
  end if;

  return query
  select c.id, c.name, jsonb_strip_nulls(jsonb_build_object(
    'package_value', (
      select sum(s.price) from public.client_subscriptions s
      where s.client_id = c.id and s.status <> 'cancelled'
        and daterange(s.starts_on, s.ends_on, '[]') && daterange(p_from, p_to, '[]')
    ),
    'currency', (
      select s.currency from public.client_subscriptions s
      where s.client_id = c.id order by s.starts_on desc limit 1
    ),
    'plan_name', (
      select pl.name from public.client_subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.client_id = c.id and s.status <> 'cancelled'
        and daterange(s.starts_on, s.ends_on, '[]') && daterange(p_from, p_to, '[]')
      order by s.starts_on desc limit 1
    ),
    'team_size', (select count(distinct t.user_id) from public.client_team_members t where t.client_id = c.id),
    'shootings', (
      select count(*) from public.shootings s
      where s.client_id = c.id and s.status = 'completed' and s.deleted_at is null
        and s.starts_at >= v_from and s.starts_at < v_to
    ),
    'shooting_hours', (
      select round(coalesce(sum(extract(epoch from (
               coalesce(s.actual_ended_at, s.ends_at) - coalesce(s.actual_started_at, s.starts_at)))) / 3600, 0)::numeric, 1)
      from public.shootings s
      where s.client_id = c.id and s.status = 'completed' and s.deleted_at is null
        and s.starts_at >= v_from and s.starts_at < v_to
    ),
    'editing_tasks', (
      select count(*) from public.tasks t
      where t.client_id = c.id and t.task_type = 'editing' and t.status = 'done'
        and t.completed_at >= v_from and t.completed_at < v_to
    ),
    'editing_hours', (
      select round(coalesce(sum(extract(epoch from (t.completed_at - coalesce(t.started_at, t.created_at)))), 0)::numeric / 3600, 1)
      from public.tasks t
      where t.client_id = c.id and t.task_type = 'editing' and t.status = 'done'
        and t.completed_at >= v_from and t.completed_at < v_to
    ),
    'task_hours', (
      select round(coalesce(sum(extract(epoch from (t.completed_at - coalesce(t.started_at, t.created_at)))), 0)::numeric / 3600, 1)
      from public.tasks t
      where t.client_id = c.id and t.status = 'done' and t.completed_at >= v_from and t.completed_at < v_to
    ),
    'revisions', (
      select count(*) from public.revisions r
      where r.client_id = c.id and r.requested_at >= v_from and r.requested_at < v_to
    ),
    'client_revisions', (
      select count(*) from public.revisions r
      where r.client_id = c.id and r.stage = 'client' and r.requested_at >= v_from and r.requested_at < v_to
    ),
    'content_output', (
      select count(*) from public.content_items ci
      where ci.client_id = c.id and ci.deleted_at is null
        and ((ci.published_at >= v_from and ci.published_at < v_to)
          or (ci.content_type in ('design', 'ad_creative') and ci.approved_at >= v_from and ci.approved_at < v_to))
    ),
    'views', (
      select sum(m.views) from public.social_metrics m
      where m.client_id = c.id and m.period_start >= p_from and m.period_end <= p_to
    ),
    'reach', (
      select sum(m.reach) from public.social_metrics m
      where m.client_id = c.id and m.period_start >= p_from and m.period_end <= p_to
    ),
    'followers_growth', (
      select sum(m.followers_end) - sum(m.followers_start) from public.social_metrics m
      where m.client_id = c.id and m.period_start >= p_from and m.period_end <= p_to
    ),
    'quota_planned', (
      select sum(q.quantity) from public.subscription_quotas q
      join public.client_subscriptions s on s.id = q.subscription_id
      where s.client_id = c.id and s.status <> 'cancelled'
        and daterange(s.starts_on, s.ends_on, '[]') && daterange(p_from, p_to, '[]')
    ),
    'quota_used', (
      select sum(u.quantity) from public.client_plan_usage u
      where u.client_id = c.id and u.occurred_on between p_from and p_to
    )
  ))
  from public.clients c
  where c.deleted_at is null and c.status in ('active', 'paused')
  order by c.name;
end;
$$;

grant execute on function public.get_client_resource_report(date, date) to authenticated;
