-- SUN MEDIA — attendance. Admin-controlled only: employees never mark themselves.

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees (user_id) on delete cascade,
  work_date date not null,
  status public.attendance_status not null,
  arrived_at time,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  note text check (char_length(note) <= 1000),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index attendance_date_idx on public.attendance (work_date);

create trigger attendance_updated_at
  before update on public.attendance
  for each row execute function private.set_updated_at();

create table public.shooting_attendance (
  shooting_id uuid not null,
  user_id uuid not null,
  status public.shooting_attendance_status not null default 'pending',
  arrived_at timestamptz,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  note text check (char_length(note) <= 1000),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shooting_id, user_id),
  foreign key (shooting_id, user_id) references public.shooting_members (shooting_id, user_id) on delete cascade
);

create index shooting_attendance_user_idx on public.shooting_attendance (user_id);

create trigger shooting_attendance_updated_at
  before update on public.shooting_attendance
  for each row execute function private.set_updated_at();

create table public.attendance_history (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('daily', 'shooting')),
  attendance_id uuid references public.attendance (id) on delete cascade,
  shooting_id uuid references public.shootings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  old_status text,
  new_status text not null,
  old_late_minutes integer,
  new_late_minutes integer,
  note text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  check ((kind = 'daily' and attendance_id is not null) or (kind = 'shooting' and shooting_id is not null))
);

create index attendance_history_user_idx on public.attendance_history (user_id, work_date desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
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
  if new.status = 'late' and new.arrived_at is not null then
    select work_start_time into v_start from public.employees where user_id = new.user_id;
    v_grace := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'attendance.late_grace_minutes'), 0);
    new.late_minutes := greatest(0, (extract(epoch from (new.arrived_at - v_start)) / 60)::integer);
    if new.late_minutes <= v_grace then
      new.status := 'present';
      new.late_minutes := 0;
    end if;
  elsif new.status <> 'late' then
    new.late_minutes := 0;
  end if;
  return new;
end;
$$;

create trigger attendance_10_before_write
  before insert or update on public.attendance
  for each row execute function private.attendance_before_write();

create or replace function private.attendance_log_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.late_minutes = old.late_minutes
     and new.note is not distinct from old.note then
    return null;
  end if;
  insert into public.attendance_history (
    kind, attendance_id, user_id, work_date, old_status, new_status, old_late_minutes, new_late_minutes, note, changed_by
  ) values (
    'daily', new.id, new.user_id, new.work_date,
    case when tg_op = 'UPDATE' then old.status::text end, new.status::text,
    case when tg_op = 'UPDATE' then old.late_minutes end, new.late_minutes,
    new.note, auth.uid()
  );
  return null;
end;
$$;

create trigger attendance_history_log
  after insert or update on public.attendance
  for each row execute function private.attendance_log_history();

create or replace function private.shooting_attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts timestamptz;
begin
  if tg_op = 'UPDATE' or new.status <> 'pending' then
    new.marked_by := auth.uid();
    new.marked_at := now();
  end if;
  if new.status = 'late' and new.arrived_at is not null then
    select starts_at into v_starts from public.shootings where id = new.shooting_id;
    new.late_minutes := greatest(0, (extract(epoch from (new.arrived_at - v_starts)) / 60)::integer);
  elsif new.status <> 'late' then
    new.late_minutes := 0;
  end if;
  return new;
end;
$$;

create trigger shooting_attendance_10_before_write
  before insert or update on public.shooting_attendance
  for each row execute function private.shooting_attendance_before_write();

create or replace function private.shooting_attendance_log_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and tg_op = 'INSERT' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status = old.status and new.late_minutes = old.late_minutes
     and new.note is not distinct from old.note then
    return null;
  end if;
  insert into public.attendance_history (
    kind, shooting_id, user_id, work_date, old_status, new_status, old_late_minutes, new_late_minutes, note, changed_by
  ) values (
    'shooting', new.shooting_id, new.user_id,
    (select (s.starts_at at time zone private.agency_timezone())::date from public.shootings s where s.id = new.shooting_id),
    case when tg_op = 'UPDATE' then old.status::text end, new.status::text,
    case when tg_op = 'UPDATE' then old.late_minutes end, new.late_minutes,
    new.note, auth.uid()
  );
  return null;
end;
$$;

create trigger shooting_attendance_history_log
  after insert or update on public.shooting_attendance
  for each row execute function private.shooting_attendance_log_history();

-- Every shooting member gets a pending attendance row the admin later resolves.
create or replace function private.shooting_members_create_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shooting_attendance (shooting_id, user_id)
  values (new.shooting_id, new.user_id)
  on conflict do nothing;
  return null;
end;
$$;

create trigger shooting_members_create_attendance
  after insert on public.shooting_members
  for each row execute function private.shooting_members_create_attendance();

create trigger audit_attendance after insert or update or delete on public.attendance
  for each row execute function private.audit_row();
create trigger audit_shooting_attendance after update or delete on public.shooting_attendance
  for each row execute function private.audit_row('shooting_id', 'user_id');

-- ---------------------------------------------------------------------------
-- Summary for employee profile / scorecards
-- ---------------------------------------------------------------------------
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
  if p_user_id <> auth.uid() and not private.has_permission('attendance.read') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
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

grant execute on function public.get_attendance_summary(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.attendance enable row level security;
alter table public.shooting_attendance enable row level security;
alter table public.attendance_history enable row level security;

create policy "read own or all attendance" on public.attendance
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.has_permission('attendance.read'))
  );
create policy "admins mark attendance" on public.attendance
  for insert to authenticated with check ((select private.has_permission('attendance.manage')));
create policy "admins change attendance" on public.attendance
  for update to authenticated
  using ((select private.has_permission('attendance.manage')))
  with check ((select private.has_permission('attendance.manage')));
create policy "admins delete attendance" on public.attendance
  for delete to authenticated using ((select private.has_permission('attendance.manage')));

create policy "read shooting attendance" on public.shooting_attendance
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.has_permission('attendance.read'))
    or exists (
      select 1 from public.shootings s
      where s.id = shooting_id and private.can_manage_client(s.client_id, 'shootings.manage')
    )
  );
create policy "admins mark shooting attendance" on public.shooting_attendance
  for update to authenticated
  using ((select private.has_permission('attendance.manage')))
  with check ((select private.has_permission('attendance.manage')));
revoke insert, delete on public.shooting_attendance from authenticated;

create policy "read attendance history" on public.attendance_history
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.has_permission('attendance.read'))
  );
revoke insert, update, delete on public.attendance_history from authenticated;
