-- Team: skills kept apart from roles, passport data only the system owner sees, employees mark their own arrival
-- ("Keldim", from 09:45 Tashkent time), attendance error alerts to the whole team, work hours set by the Rahbar,
-- and notifications that are never sent twice for the same event. Additive.

-- ---------------------------------------------------------------------------------------------------------------
-- Roles the agency named that did not exist yet. Built in, starting with the copywriter's light permissions.
-- ---------------------------------------------------------------------------------------------------------------
insert into public.roles (key, name, description, scope, rank, is_system) values
  ('scriptwriter', 'Ssenarist', 'Ssenariy muallifi', 'staff', 60, true),
  ('staff', 'Xodim', 'Boshqa turdagi xodim', 'staff', 60, true)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join (values ('scriptwriter', 'content.edit_copy'), ('scriptwriter', 'files.upload'), ('staff', 'files.upload')) v(role_key, perm) on v.role_key = r.key
join public.permissions p on p.key = v.perm
on conflict (role_id, permission_key) do nothing;

-- The Rahbar corrects attendance, sets work hours and raises attendance alerts.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'attendance.manage' from public.roles r where r.key = 'owner'
on conflict (role_id, permission_key) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Skills: what a person can do (operator, montaj, ssenariy…), independent of the role that sets permissions.
-- workflow_role marks the skill that fills a task field, so the owner may rename skills freely.
-- ---------------------------------------------------------------------------------------------------------------
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  workflow_role text check (workflow_role in ('scriptwriter', 'operator', 'editor')),
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index skills_name_key on public.skills (lower(btrim(name)));
create unique index skills_workflow_role_key on public.skills (workflow_role) where workflow_role is not null;

create table public.employee_skills (
  user_id uuid not null references public.employees (user_id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
create index employee_skills_skill_idx on public.employee_skills (skill_id);

create trigger skills_updated_at before update on public.skills for each row execute function private.set_updated_at();
create trigger audit_skills after insert or update or delete on public.skills for each row execute function private.audit_row();
create trigger audit_employee_skills after insert or delete on public.employee_skills
  for each row execute function private.audit_row('user_id', 'skill_id');

alter table public.skills enable row level security;
alter table public.employee_skills enable row level security;
revoke all on public.skills, public.employee_skills from anon, authenticated;
grant select, insert, update, delete on public.skills, public.employee_skills to authenticated;

create policy "staff read skills" on public.skills for select to authenticated using ((select private.is_staff()));
create policy "owner adds skills" on public.skills for insert to authenticated with check ((select private.has_role('system_owner')));
create policy "owner edits skills" on public.skills for update to authenticated
  using ((select private.has_role('system_owner'))) with check ((select private.has_role('system_owner')));
create policy "owner removes skills" on public.skills for delete to authenticated using ((select private.has_role('system_owner')));

create policy "staff read employee skills" on public.employee_skills for select to authenticated using ((select private.is_staff()));
create policy "hr assigns skills" on public.employee_skills for insert to authenticated
  with check ((select private.has_permission('employees.manage')));
create policy "hr removes skills" on public.employee_skills for delete to authenticated
  using ((select private.has_permission('employees.manage')));

insert into public.skills (name, workflow_role, position) values
  ('Ssenarist', 'scriptwriter', 1),
  ('Operator', 'operator', 2),
  ('Montajyor', 'editor', 3),
  ('Fotograf', null, 4),
  ('Dizayner', null, 5),
  ('Targetolog', null, 6),
  ('SMM mutaxassisi', null, 7),
  ('Kontent menejer', null, 8),
  ('Administrator', null, 9)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Private employee data: birth date and passport. Only the system owner reads or writes it; the audit log records
-- that it changed, never the values.
-- ---------------------------------------------------------------------------------------------------------------
create table public.employee_private (
  user_id uuid primary key references public.employees (user_id) on delete cascade,
  birth_date date check (birth_date between date '1940-01-01' and current_date),
  passport_series text check (passport_series ~ '^[A-Z]{2}$'),
  passport_number text check (passport_number ~ '^[0-9]{7}$'),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create function private.audit_private_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, actor_roles, action, entity_type, entity_id, metadata)
  values (auth.uid(), private.current_role_keys(), 'employee_private.' || lower(tg_op), 'employee_private',
          coalesce(new.user_id, old.user_id)::text, jsonb_build_object('note', 'Shaxsiy ma’lumot o‘zgardi (qiymatlar yozilmaydi)'));
  return null;
end;
$$;
revoke all on function private.audit_private_change() from public;

create trigger employee_private_updated_at before update on public.employee_private for each row execute function private.set_updated_at();
create trigger audit_employee_private after insert or update or delete on public.employee_private
  for each row execute function private.audit_private_change();

alter table public.employee_private enable row level security;
revoke all on public.employee_private from anon, authenticated;
grant select, insert, update, delete on public.employee_private to authenticated;
create policy "owner reads private data" on public.employee_private for select to authenticated using ((select private.has_role('system_owner')));
create policy "owner adds private data" on public.employee_private for insert to authenticated with check ((select private.has_role('system_owner')));
create policy "owner edits private data" on public.employee_private for update to authenticated
  using ((select private.has_role('system_owner'))) with check ((select private.has_role('system_owner')));
create policy "owner removes private data" on public.employee_private for delete to authenticated using ((select private.has_role('system_owner')));

-- ---------------------------------------------------------------------------------------------------------------
-- Notifications sent once per event: a key per event and person.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.notifications add column dedupe_key text check (char_length(dedupe_key) <= 200);
create unique index notifications_dedupe_key on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create function private.notify_event(
  p_user_ids uuid[],
  p_key text,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_client uuid default null,
  p_priority public.notification_priority default 'normal',
  p_include_actor boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_push integer;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;
  with recipients as (
    select distinct p.id
    from public.profiles p
    where p.id = any (p_user_ids)
      and p.status = 'active'
      and p.deleted_at is null
      and (p_include_actor or p.id is distinct from auth.uid())
      and not exists (
        select 1 from public.notification_preferences np
        where np.user_id = p.id and np.type = p_type and not np.in_app_enabled
      )
  ),
  inserted as (
    insert into public.notifications (user_id, type, title, body, data, entity_type, entity_id, client_id, priority, dedupe_key)
    select r.id, p_type, left(p_title, 200), left(p_body, 1000), coalesce(p_data, '{}'), p_entity_type, p_entity_id, p_client, p_priority, p_key
    from recipients r
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning id, user_id
  ),
  queued as (
    insert into public.notification_deliveries (notification_id, push_token_id)
    select i.id, t.id
    from inserted i
    join public.push_tokens t on t.user_id = i.user_id and t.revoked_at is null
    where not exists (
      select 1 from public.notification_preferences np
      where np.user_id = i.user_id and np.type = p_type and not np.push_enabled
    )
    returning 1
  )
  select (select count(*) from inserted), (select count(*) from queued) into v_count, v_push;
  if v_push > 0 then
    perform private.request_push_dispatch();
  end if;
  return v_count;
end;
$$;
revoke all on function private.notify_event(uuid[], text, text, text, text, jsonb, text, uuid, uuid, public.notification_priority, boolean) from public;

-- Everyone at SUN MEDIA who can sign in.
create function private.active_staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id and r.scope = 'staff'
  where p.status = 'active' and p.deleted_at is null;
$$;
revoke all on function private.active_staff_ids() from public;

-- The leadership (Tizim egasi, Rahbar, Direktor): who hears about finished stages.
create function private.leadership_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id and r.key in ('system_owner', 'owner', 'director')
  where p.status = 'active' and p.deleted_at is null;
$$;
revoke all on function private.leadership_ids() from public;

-- ---------------------------------------------------------------------------------------------------------------
-- "Keldim": an employee marks their own arrival once a day, from 09:45 Tashkent time. The server's clock is used;
-- lateness comes from the person's own start time (attendance_before_write).
-- ---------------------------------------------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('attendance.check_in_from', '"09:45"', 'Xodim “Keldim” tugmasini shu vaqtdan bosa oladi (Toshkent vaqti)')
on conflict (key) do nothing;

create function public.check_in()
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_local timestamp := now() at time zone private.agency_timezone();
  v_from time := coalesce((select (value #>> '{}')::time from public.app_settings where key = 'attendance.check_in_from'), '09:45');
  v_row public.attendance;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Only SUN MEDIA staff mark attendance' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees e where e.user_id = v_uid and e.status = 'active') then
    raise exception 'No active employee record' using errcode = '42501';
  end if;
  if v_local::time < v_from then
    raise exception 'CHECK_IN_TOO_EARLY' using errcode = '22023', detail = to_char(v_from, 'HH24:MI');
  end if;
  insert into public.attendance (user_id, work_date, status, arrived_at)
  values (v_uid, v_local::date, 'present', date_trunc('second', v_local)::time)
  on conflict (user_id, work_date) do nothing
  returning * into v_row;
  if v_row.id is null then
    raise exception 'ALREADY_CHECKED_IN' using errcode = '23505';
  end if;
  return v_row;
end;
$$;
revoke all on function public.check_in() from public, anon;
grant execute on function public.check_in() to authenticated;

-- The Rahbar or the system owner sets when a person is expected at work.
create function public.set_work_hours(p_user_id uuid, p_start time, p_end time)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission('attendance.manage') or private.has_permission('employees.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'WORK_HOURS_INVALID' using errcode = '22023';
  end if;
  update public.employees set work_start_time = p_start, work_end_time = p_end where user_id = p_user_id;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_work_hours(uuid, time, time) from public, anon;
grant execute on function public.set_work_hours(uuid, time, time) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- "Davomat xatomi?": the Rahbar flags one record; every employee is told which record to check. Nothing is deleted;
-- the alert is closed with a correction note or dismissed. Every step is in the audit log.
-- ---------------------------------------------------------------------------------------------------------------
create table public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text check (char_length(resolution) <= 500),
  reported_by uuid references public.profiles (id) on delete set null default auth.uid(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index attendance_alerts_one_open on public.attendance_alerts (attendance_id) where status = 'open';
create index attendance_alerts_date_idx on public.attendance_alerts (work_date desc);
create trigger audit_attendance_alerts after insert or update or delete on public.attendance_alerts
  for each row execute function private.audit_row();

alter table public.attendance_alerts enable row level security;
revoke all on public.attendance_alerts from anon, authenticated;
grant select on public.attendance_alerts to authenticated;
create policy "staff read attendance alerts" on public.attendance_alerts for select to authenticated using ((select private.is_staff()));

create function public.report_attendance_error(p_attendance_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attendance;
  v_name text;
  v_id uuid;
  v_when text;
begin
  if not private.has_permission('attendance.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_att from public.attendance where id = p_attendance_id;
  if v_att.id is null then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;
  select id into v_id from public.attendance_alerts where attendance_id = p_attendance_id and status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.attendance_alerts (attendance_id, user_id, work_date, note)
  values (v_att.id, v_att.user_id, v_att.work_date, nullif(btrim(p_note), ''))
  returning id into v_id;

  select full_name into v_name from public.profiles where id = v_att.user_id;
  v_when := to_char(v_att.work_date, 'DD.MM.YYYY') || coalesce(', ' || to_char(v_att.arrived_at, 'HH24:MI'), '');
  perform private.notify_event(
    private.active_staff_ids(),
    'attendance_alert:' || v_id,
    'attendance.error',
    'Diqqat! Davomat ma’lumotida xatolik aniqlandi',
    'Ma’lumotlarni tekshiring: ' || coalesce(v_name, 'xodim') || ' — ' || v_when || coalesce('. ' || nullif(btrim(p_note), ''), ''),
    jsonb_build_object('href', '/team/attendance?date=' || v_att.work_date, 'staff_href', '/xodim#davomat', 'alert_id', v_id),
    'attendance_alerts', v_id, null, 'high', true
  );
  return v_id;
end;
$$;
revoke all on function public.report_attendance_error(uuid, text) from public, anon;
grant execute on function public.report_attendance_error(uuid, text) to authenticated;

create function public.resolve_attendance_alert(p_alert_id uuid, p_resolution text default null, p_dismiss boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('attendance.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.attendance_alerts
  set status = case when p_dismiss then 'dismissed' else 'resolved' end,
      resolution = nullif(btrim(p_resolution), ''),
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_alert_id and status = 'open';
  if not found then
    raise exception 'Alert not found or already closed' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.resolve_attendance_alert(uuid, text, boolean) from public, anon;
grant execute on function public.resolve_attendance_alert(uuid, text, boolean) to authenticated;
