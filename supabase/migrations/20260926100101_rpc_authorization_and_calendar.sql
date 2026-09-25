-- SUN MEDIA — close RPC authorization bypasses without changing authentication/session flows.
-- Schema-level default revokes cannot remove PostgreSQL's global PUBLIC function EXECUTE.
-- Preserve existing explicit authenticated/service-role grants, including service-only push RPCs.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

create or replace function public.set_content_status(
  p_content_id uuid,
  p_status public.content_status,
  p_note text default null
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'Status is required' using errcode = '22023';
  end if;

  select * into v_item from public.content_items where id = p_content_id and deleted_at is null for update;
  if not found then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_client(v_item.client_id, 'content.manage') then
    if not (p_content_id = any (private.assigned_content_ids())
            and (v_item.status = p_status or private.assignee_transition_allowed(v_item.status, p_status))) then
      raise exception 'Not allowed to move content from % to %', v_item.status, p_status using errcode = '42501';
    end if;
  end if;

  -- An idempotent write is still a read: authorize before returning the row.
  if v_item.status = p_status then
    return v_item;
  end if;

  perform set_config('sunmedia.status_note', coalesce(p_note, ''), true);

  update public.content_items
  set status = p_status,
      status_changed_at = now(),
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_content_id
  returning * into v_item;

  perform set_config('sunmedia.status_note', '', true);
  return v_item;
end;
$$;

create or replace function public.get_attendance_summary(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_work_days smallint[];
  v_until date;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_user_id is distinct from auth.uid() and not private.has_permission('attendance.read') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Invalid period' using errcode = '22023';
  end if;

  select work_days into v_work_days from public.employees where user_id = p_user_id;
  v_until := least(p_to, private.agency_today());

  select jsonb_build_object(
    'scheduled_days', (
      select count(*) from generate_series(p_from, v_until, interval '1 day') d
      where extract(isodow from d)::smallint = any (coalesce(v_work_days, '{}'))
    ),
    'present', count(*) filter (where a.status = 'present'),
    'late', count(*) filter (where a.status = 'late'),
    'late_minutes', coalesce(sum(a.late_minutes), 0),
    'absent', count(*) filter (where a.status = 'absent'),
    'excused', count(*) filter (where a.status = 'excused'),
    'vacation', count(*) filter (where a.status = 'vacation'),
    'remote', count(*) filter (where a.status = 'remote'),
    'marked_days', count(*)
  )
  into v_result
  from public.attendance a
  where a.user_id = p_user_id and a.work_date between p_from and p_to;

  return v_result || (
    select jsonb_build_object(
      'shootings_assigned', count(*),
      'shootings_arrived', count(*) filter (where sa.status = 'arrived'),
      'shootings_late', count(*) filter (where sa.status = 'late'),
      'shootings_absent', count(*) filter (where sa.status = 'absent')
    )
    from public.shooting_attendance sa
    join public.shootings s on s.id = sa.shooting_id
    where sa.user_id = p_user_id
      and s.deleted_at is null
      and s.status <> 'cancelled'
      and (s.starts_at at time zone private.agency_timezone())::date between p_from and p_to
  );
end;
$$;

create or replace function public.get_employee_scorecards(p_from date, p_to date, p_user_id uuid default null)
returns table (user_id uuid, full_name text, role_keys text[], metrics jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (private.has_permission('performance.read') or (p_user_id is not null and p_user_id = auth.uid())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Invalid period' using errcode = '22023';
  end if;
  return query select * from private.compute_employee_scorecards(p_from, p_to, p_user_id);
end;
$$;

create or replace function public.complete_file_upload(
  p_file_id uuid,
  p_duration_ms integer default null,
  p_width integer default null,
  p_height integer default null
)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_object storage.objects;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_file from public.files where id = p_file_id and deleted_at is null for update;
  if not found or v_file.uploaded_by is distinct from auth.uid() then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if v_file.status = 'uploaded' then
    return v_file;
  end if;
  select * into v_object from storage.objects where bucket_id = v_file.bucket and name = v_file.storage_path;
  if not found then
    raise exception 'Upload has not reached storage yet' using errcode = 'P0002';
  end if;

  update public.files
  set status = 'uploaded',
      uploaded_at = now(),
      size_bytes = coalesce((v_object.metadata ->> 'size')::bigint, size_bytes),
      mime_type = coalesce(v_object.metadata ->> 'mimetype', mime_type),
      duration_ms = coalesce(p_duration_ms, duration_ms),
      width = coalesce(p_width, width),
      height = coalesce(p_height, height)
  where id = p_file_id
  returning * into v_file;
  return v_file;
end;
$$;

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
  where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at < p_to and s.ends_at >= p_from
    and (p_client_id is null or s.client_id = p_client_id)

  union all
  select 'publication', p.id, p.scheduled_at, p.scheduled_at, ci.title, p.client_id, c.name,
         ci.id, ci.content_type, p.platform, p.status::text, null
  from public.content_publications p
  join public.content_items ci on ci.id = p.content_id
  join public.clients c on c.id = p.client_id
  where ci.deleted_at is null and ci.status <> 'cancelled'
    and p.scheduled_at >= p_from and p.scheduled_at < p_to and p.status <> 'cancelled'
    and (p_client_id is null or p.client_id = p_client_id)

  union all
  select 'approval_deadline', ci.id, ci.client_approval_due_at, ci.client_approval_due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.deleted_at is null and ci.client_approval_due_at >= p_from and ci.client_approval_due_at < p_to
    and ci.status not in ('approved', 'scheduled', 'published', 'cancelled')
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select 'content_due', ci.id, ci.due_at, ci.due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.deleted_at is null and ci.due_at >= p_from and ci.due_at < p_to
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

-- Public contains the application RPCs; extensions live in the extensions schema.
-- Revoke after replacements too, covering both existing and newly created application functions.
revoke execute on all functions in schema public from public, anon;
