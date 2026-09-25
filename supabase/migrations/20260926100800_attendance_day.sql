-- SUN MEDIA — daily attendance for the office.
--   * attendance_before_write: an arrival after start + grace is recorded as LATE with minutes,
--     whether the admin tapped "Keldi" or "Kechikdi"; within grace it is PRESENT.
--   * get_attendance_day: roster for any date (who is scheduled + what was marked, by whom).
-- Employees never mark themselves: writes stay behind attendance.manage (RLS unchanged).

create or replace function private.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start time;
  v_grace integer;
begin
  new.marked_by := auth.uid();
  new.marked_at := now();
  if new.status in ('present', 'late') and new.arrived_at is not null then
    select work_start_time into v_start from public.employees where user_id = new.user_id;
    v_grace := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'attendance.late_grace_minutes'), 0);
    new.late_minutes := greatest(0, (extract(epoch from (new.arrived_at - coalesce(v_start, '09:00'::time))) / 60)::integer);
    if new.late_minutes <= v_grace then
      new.status := 'present';
      new.late_minutes := 0;
    else
      new.status := 'late';
    end if;
  elsif new.status <> 'late' then
    new.late_minutes := 0;
  end if;
  if new.status in ('absent', 'vacation', 'excused') then
    new.arrived_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.get_attendance_day(p_date date)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  job_title text,
  roles jsonb,
  work_start_time time,
  scheduled boolean,
  attendance_id uuid,
  status public.attendance_status,
  arrived_at time,
  late_minutes integer,
  note text,
  marked_by_name text,
  marked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('attendance.read') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Invalid period' using errcode = '22023';
  end if;

  return query
  select
    e.user_id,
    p.full_name,
    p.avatar_url,
    e.job_title,
    (select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name) order by r.rank), '[]')
     from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = e.user_id),
    e.work_start_time,
    extract(isodow from p_date)::smallint = any (e.work_days),
    a.id,
    a.status,
    a.arrived_at,
    a.late_minutes,
    a.note,
    m.full_name,
    a.marked_at
  from public.employees e
  join public.profiles p on p.id = e.user_id and p.deleted_at is null and p.status = 'active'
  left join public.attendance a on a.user_id = e.user_id and a.work_date = p_date
  left join public.profiles m on m.id = a.marked_by
  where e.status <> 'terminated'
    and (e.hired_on is null or e.hired_on <= p_date)
    and (extract(isodow from p_date)::smallint = any (e.work_days) or a.id is not null)
  order by p.full_name;
end;
$$;

revoke execute on function public.get_attendance_day(date) from public, anon;
grant execute on function public.get_attendance_day(date) to authenticated;
