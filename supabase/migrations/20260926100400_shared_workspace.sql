-- SUN MEDIA — shared internal workspace, team directory, role/permission management and
-- configurable work schedule.
--   * announcements (+ read receipts), company_events, shared_documents: every active staff
--     member reads them; clients never do (RLS: is_staff). workspace.manage writes.
--   * get_team_directory: shared directory for all staff; workload/attendance columns only for
--     those who may see them.
--   * change_staff_role / set_staff_permissions: atomic, rank-checked, delegation-checked.
--   * attendance.work_days / attendance.workday_start settings drive new employees' schedule.

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, name, description, scope)
values ('workspace.manage', 'workspace', 'Ish joyini boshqarish', 'E’lonlar, kompaniya tadbirlari va umumiy hujjatlarni boshqarish', 'staff')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'workspace.manage' from public.roles r where r.key in ('director', 'admin', 'project_manager')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  is_pinned boolean not null default false,
  -- null = all staff; otherwise only holders of these role keys (managers always see everything)
  audience_roles text[],
  author_id uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (expires_at is null or expires_at > published_at)
);

create index announcements_feed_idx on public.announcements (is_pinned desc, published_at desc) where deleted_at is null;

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index announcement_reads_user_idx on public.announcement_reads (user_id);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

create or replace function private.can_see_announcement(p_audience text[], p_published timestamptz, p_expires timestamptz, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and (
    private.has_permission('workspace.manage')
    or p_author = (select auth.uid())
    or (
      p_published <= now()
      and (p_expires is null or p_expires > now())
      and (p_audience is null or p_audience && private.current_role_keys())
    )
  );
$$;

grant execute on function private.can_see_announcement(text[], timestamptz, timestamptz, uuid) to authenticated;

create policy "staff read announcements" on public.announcements
  for select to authenticated
  using (deleted_at is null and (select private.can_see_announcement(audience_roles, published_at, expires_at, author_id)));

create policy "workspace managers post announcements" on public.announcements
  for insert to authenticated
  with check ((select private.has_permission('workspace.manage')));

create policy "workspace managers edit announcements" on public.announcements
  for update to authenticated
  using ((select private.has_permission('workspace.manage')))
  with check ((select private.has_permission('workspace.manage')));

create policy "read own announcement receipts" on public.announcement_reads
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('workspace.manage')));

create policy "mark announcements read" on public.announcement_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.announcements a where a.id = announcement_id)
  );

create or replace function private.announcements_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
  elsif not private.is_privileged_context() then
    new.author_id := old.author_id;
    new.created_at := old.created_at;
  end if;
  new.title := btrim(new.title);
  new.body := btrim(new.body);
  if new.audience_roles is not null and cardinality(new.audience_roles) = 0 then
    new.audience_roles := null;
  end if;
  return new;
end;
$$;

create trigger announcements_before_write
  before insert or update on public.announcements
  for each row execute function private.announcements_before_write();

create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function private.set_updated_at();

-- Every targeted staff member gets an in-app notification (and push through the existing queue).
create or replace function private.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null or new.published_at > now() then
    return null;
  end if;
  perform private.notify(
    (
      select coalesce(array_agg(distinct ur.user_id), '{}')
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.scope = 'staff'
      join public.profiles p on p.id = ur.user_id and p.status = 'active' and p.deleted_at is null
      where ur.user_id is distinct from new.author_id
        and (new.audience_roles is null or r.key = any (new.audience_roles))
    ),
    'announcement',
    case when new.is_pinned then '📌 ' else '' end || new.title,
    left(new.body, 180),
    jsonb_build_object('route', '/announcements/' || new.id),
    'announcements', new.id, null, case when new.is_pinned then 'high' else 'normal' end::public.notification_priority, true
  );
  return null;
end;
$$;

create trigger announcements_notify
  after insert on public.announcements
  for each row execute function private.notify_announcement();

create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Company events (meetings, holidays, days off, trainings, company-wide events)
-- ---------------------------------------------------------------------------
create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  kind text not null default 'company_event'
    check (kind in ('meeting', 'holiday', 'day_off', 'company_event', 'training', 'birthday')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (location is null or char_length(location) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at >= starts_at)
);

create index company_events_range_idx on public.company_events (starts_at, ends_at) where deleted_at is null;

alter table public.company_events enable row level security;

create policy "staff read company events" on public.company_events
  for select to authenticated
  using (deleted_at is null and (select private.is_staff()));

create policy "workspace managers add company events" on public.company_events
  for insert to authenticated
  with check ((select private.has_permission('workspace.manage')));

create policy "workspace managers edit company events" on public.company_events
  for update to authenticated
  using ((select private.has_permission('workspace.manage')))
  with check ((select private.has_permission('workspace.manage')));

create or replace function private.company_events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  elsif not private.is_privileged_context() then
    new.created_by := old.created_by;
  end if;
  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger company_events_before_write
  before insert or update on public.company_events
  for each row execute function private.company_events_before_write();

create trigger company_events_updated_at
  before update on public.company_events
  for each row execute function private.set_updated_at();

create trigger audit_company_events after insert or update or delete on public.company_events
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Shared documents (SOPs, guides, brand assets, policies, templates)
-- ---------------------------------------------------------------------------
create table public.shared_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null default 'other' check (category in ('sop', 'guide', 'brand', 'policy', 'template', 'other')),
  description text check (description is null or char_length(description) <= 1000),
  url text check (url is null or url ~* '^https://'),
  file_id uuid references public.files (id) on delete set null,
  is_pinned boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (url is not null or file_id is not null)
);

create index shared_documents_category_idx on public.shared_documents (category, title) where deleted_at is null;

alter table public.shared_documents enable row level security;

create policy "staff read shared documents" on public.shared_documents
  for select to authenticated
  using (deleted_at is null and (select private.is_staff()));

create policy "workspace managers add shared documents" on public.shared_documents
  for insert to authenticated
  with check ((select private.has_permission('workspace.manage')));

create policy "workspace managers edit shared documents" on public.shared_documents
  for update to authenticated
  using ((select private.has_permission('workspace.manage')))
  with check ((select private.has_permission('workspace.manage')));

create or replace function private.shared_documents_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  elsif not private.is_privileged_context() then
    new.created_by := old.created_by;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.title := btrim(new.title);
  -- Only internal (client-less) uploads can be shared company-wide.
  if new.file_id is not null and exists (select 1 from public.files f where f.id = new.file_id and f.client_id is not null) then
    raise exception 'Only internal files can be shared with the whole team' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger shared_documents_before_write
  before insert or update on public.shared_documents
  for each row execute function private.shared_documents_before_write();

create trigger shared_documents_updated_at
  before update on public.shared_documents
  for each row execute function private.set_updated_at();

create trigger audit_shared_documents after insert or update or delete on public.shared_documents
  for each row execute function private.audit_row();

-- Realtime: workspace changes reach every staff session.
create trigger rt_announcements after insert or update or delete on public.announcements
  for each row execute function private.broadcast_change('staff');
create trigger rt_company_events after insert or update or delete on public.company_events
  for each row execute function private.broadcast_change('staff');
create trigger rt_shared_documents after insert or update or delete on public.shared_documents
  for each row execute function private.broadcast_change('staff');

-- ---------------------------------------------------------------------------
-- Calendar: company events appear for staff (clients' RLS returns none)
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
  where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at < p_to and s.ends_at >= p_from
    and (p_client_id is null or s.client_id = p_client_id)

  union all
  select 'publication', p.id, p.scheduled_at, p.scheduled_at, ci.title, p.client_id, c.name,
         ci.id, ci.content_type, p.platform, p.status::text, null
  from public.content_publications p
  join public.content_items ci on ci.id = p.content_id and ci.deleted_at is null and ci.status <> 'cancelled'
  join public.clients c on c.id = p.client_id
  where p.scheduled_at >= p_from and p.scheduled_at < p_to and p.status <> 'cancelled'
    and (p_client_id is null or p.client_id = p_client_id)

  union all
  select 'approval_deadline', ci.id, ci.client_approval_due_at, ci.client_approval_due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.deleted_at is null
    and ci.client_approval_due_at >= p_from and ci.client_approval_due_at < p_to
    and ci.status not in ('approved', 'scheduled', 'published', 'cancelled')
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select 'content_due', ci.id, ci.due_at, ci.due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.deleted_at is null and ci.due_at >= p_from and ci.due_at < p_to
    and ci.status <> 'cancelled'
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select case t.task_type when 'editing' then 'editing_deadline' when 'meeting' then 'meeting' when 'design' then 'design_deadline' else 'task_deadline' end,
         t.id, coalesce(t.starts_at, t.due_at), t.due_at, t.title, t.client_id, c.name,
         t.content_id, null, null, t.status::text, null
  from public.tasks t
  left join public.clients c on c.id = t.client_id
  where t.deleted_at is null and t.due_at >= p_from and t.due_at < p_to and t.status <> 'cancelled'
    and (p_client_id is null or t.client_id = p_client_id)

  union all
  select 'company_' || e.kind, e.id, e.starts_at, e.ends_at, e.title, null::uuid, null::text,
         null::uuid, null::public.content_type, null::public.social_platform, null::text, e.location
  from public.company_events e
  where e.deleted_at is null and e.starts_at < p_to and e.ends_at >= p_from and p_client_id is null

  order by 3;
$$;

revoke execute on function public.get_calendar_events(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_calendar_events(timestamptz, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Team directory
-- ---------------------------------------------------------------------------
create or replace function public.get_team_directory()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  job_title text,
  department text,
  employee_status public.employee_status,
  account_status public.account_status,
  roles jsonb,
  attendance_status public.attendance_status,
  late_minutes integer,
  open_tasks integer,
  overdue_tasks integer,
  due_today integer,
  shootings_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_from timestamptz := v_today::timestamp at time zone private.agency_timezone();
  v_to timestamptz := (v_today + 1)::timestamp at time zone private.agency_timezone();
  v_attendance boolean := private.has_permission('attendance.read');
  v_workload boolean := private.has_permission('employees.read') or private.has_permission('tasks.read_all');
  v_accounts boolean := private.has_permission('employees.manage');
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.email,
    p.phone,
    e.job_title,
    e.department,
    e.status,
    case when v_accounts then p.status end,
    (select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name) order by r.rank), '[]')
     from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id),
    case when v_attendance then a.status end,
    case when v_attendance then a.late_minutes end,
    case when v_workload then (
      select count(*)::int from public.tasks t join public.task_assignments ta on ta.task_id = t.id and ta.user_id = p.id
      where t.deleted_at is null and t.status not in ('done', 'cancelled')) end,
    case when v_workload then (
      select count(*)::int from public.tasks t join public.task_assignments ta on ta.task_id = t.id and ta.user_id = p.id
      where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at < now()) end,
    case when v_workload then (
      select count(*)::int from public.tasks t join public.task_assignments ta on ta.task_id = t.id and ta.user_id = p.id
      where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_at >= v_from and t.due_at < v_to) end,
    (select count(*)::int from public.shootings s join public.shooting_members sm on sm.shooting_id = s.id and sm.user_id = p.id
     where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at >= v_from and s.starts_at < v_to)
  from public.employees e
  join public.profiles p on p.id = e.user_id and p.deleted_at is null
  left join public.attendance a on a.user_id = e.user_id and a.work_date = v_today
  where e.status <> 'terminated' and (p.status = 'active' or v_accounts)
  order by p.full_name;
end;
$$;

revoke execute on function public.get_team_directory() from public, anon;
grant execute on function public.get_team_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- Role and extra-permission management (atomic, audited)
-- ---------------------------------------------------------------------------
create or replace function public.change_staff_role(p_user_id uuid, p_role_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not (private.can_manage_account(p_user_id) and private.has_permission('roles.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_role from public.roles where key = p_role_key;
  if not found or v_role.scope <> 'staff' then
    raise exception 'Choose a SUN MEDIA staff role' using errcode = '22023';
  end if;
  if v_role.rank < private.current_best_rank() then
    raise exception 'Cannot assign a role above your own' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where user_id = p_user_id) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
             where ur.user_id = p_user_id and r.key = 'owner')
     and p_role_key <> 'owner'
     and not private.other_role_holders_exist((select id from public.roles where key = 'owner'), p_user_id) then
    raise exception 'The last owner cannot be removed' using errcode = '42501';
  end if;

  delete from public.user_roles ur using public.roles r
  where r.id = ur.role_id and ur.user_id = p_user_id and r.scope = 'staff' and r.key <> p_role_key;
  insert into public.user_roles (user_id, role_id) values (p_user_id, v_role.id) on conflict do nothing;

  perform private.audit_event('account.role_changed', 'profiles', p_user_id::text, null, null, jsonb_build_object('role', p_role_key));
end;
$$;

revoke execute on function public.change_staff_role(uuid, text) from public, anon;
grant execute on function public.change_staff_role(uuid, text) to authenticated;

create or replace function public.set_staff_permissions(p_user_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perm text;
begin
  if not (private.can_manage_account(p_user_id) and private.has_permission('employees.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  foreach v_perm in array coalesce(p_permissions, '{}') loop
    if not exists (select 1 from public.permissions where key = v_perm and scope = 'staff') then
      raise exception 'Unknown staff permission' using errcode = '22023';
    end if;
    if not private.has_permission(v_perm) then
      raise exception 'Cannot grant a permission you do not have' using errcode = '42501';
    end if;
  end loop;
  -- Removing a grant you do not hold yourself is also outside your authority.
  if exists (select 1 from public.user_permissions up
             where up.user_id = p_user_id and not (up.permission_key = any (coalesce(p_permissions, '{}')))
               and not private.has_permission(up.permission_key)) then
    raise exception 'Cannot grant a permission you do not have' using errcode = '42501';
  end if;

  delete from public.user_permissions where user_id = p_user_id and not (permission_key = any (coalesce(p_permissions, '{}')));
  insert into public.user_permissions (user_id, permission_key, granted_by)
  select p_user_id, x, auth.uid() from unnest(coalesce(p_permissions, '{}')) x
  on conflict do nothing;
end;
$$;

revoke execute on function public.set_staff_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_staff_permissions(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Configurable work schedule (default: Monday–Saturday from 09:00; Sunday off)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('attendance.work_days', '[1, 2, 3, 4, 5, 6]', 'Ish kunlari (1 = Dushanba … 7 = Yakshanba)'),
  ('attendance.workday_start', '"09:00"', 'Ish kuni boshlanish vaqti (HH:MM)')
on conflict (key) do nothing;

create or replace function private.default_work_days()
returns smallint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg(v::smallint order by v::smallint)
     from public.app_settings s, jsonb_array_elements_text(s.value) v
     where s.key = 'attendance.work_days' and jsonb_typeof(s.value) = 'array'),
    '{1,2,3,4,5,6}'::smallint[]
  );
$$;

create or replace function private.default_workday_start()
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::time from public.app_settings s
                   where s.key = 'attendance.workday_start' and jsonb_typeof(s.value) = 'string'), '09:00'::time);
$$;

grant execute on function private.default_work_days(), private.default_workday_start() to authenticated;

alter table public.employees alter column work_days set default private.default_work_days();
alter table public.employees alter column work_start_time set default private.default_workday_start();

-- The settings must stay valid: 1–7 day numbers, at least one working day, HH:MM start time.
create or replace function private.validate_schedule_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'attendance.work_days' and not (
       jsonb_typeof(new.value) = 'array' and jsonb_array_length(new.value) between 1 and 7
       and not exists (select 1 from jsonb_array_elements_text(new.value) v where v !~ '^[1-7]$')) then
    raise exception 'Work days must be a list of 1–7' using errcode = '22023';
  end if;
  if new.key = 'attendance.workday_start' and not (jsonb_typeof(new.value) = 'string' and (new.value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Start time must be HH:MM' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger app_settings_validate_schedule
  before insert or update on public.app_settings
  for each row execute function private.validate_schedule_setting();
