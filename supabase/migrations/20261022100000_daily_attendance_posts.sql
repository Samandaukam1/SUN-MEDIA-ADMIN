-- Daily attendance, done properly: every employee confirms their own day with KELDIM; what they confirmed (and
-- when, by the server's clock) is kept apart from corrections by the Rahbar or an admin, nobody edits or deletes
-- their own record, and a self-confirmed record is never deleted. The day's roster gains the work end time, the
-- source and the correction. Posts: platforms and time are planned with the task, the post is confirmed by hand with
-- its link (no automatic publishing without a real integration). Chat observers see who read client chats. Additive.

-- ---------------------------------------------------------------------------------------------------------------
-- Attendance: self-confirmed vs corrected
-- ---------------------------------------------------------------------------------------------------------------
alter table public.attendance
  add column source text not null default 'manager' check (source in ('self', 'manager')),
  add column checked_in_at timestamptz,
  add column corrected_by uuid references public.profiles (id) on delete set null,
  add column corrected_at timestamptz,
  add column correction_note text check (char_length(correction_note) <= 500);

-- Records made with KELDIM so far (the employee marked themselves). Triggers off: nothing else changes.
alter table public.attendance disable trigger user;
update public.attendance set source = 'self', checked_in_at = marked_at where marked_by = user_id;
alter table public.attendance enable trigger user;

create or replace function private.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_start time;
  v_grace integer;
begin
  if tg_op = 'INSERT' then
    new.source := case when v_uid is not null and v_uid = new.user_id then 'self' else 'manager' end;
    new.checked_in_at := case when new.source = 'self' then now() end;
    new.corrected_by := null;
    new.corrected_at := null;
  else
    -- What the employee confirmed stays as it was; any change by someone else is a correction.
    new.source := old.source;
    new.checked_in_at := old.checked_in_at;
    if v_uid is not null and v_uid = old.user_id and not private.has_role('system_owner') then
      raise exception 'OWN_ATTENDANCE_LOCKED' using errcode = '42501';
    end if;
    new.corrected_by := v_uid;
    new.corrected_at := now();
  end if;
  new.marked_by := v_uid;
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

-- A confirmed day is history: only the system owner removes one; nobody removes their own.
create function private.attendance_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_context() or private.has_role('system_owner') then
    return old;
  end if;
  if old.source = 'self' or old.user_id = auth.uid() then
    raise exception 'SELF_ATTENDANCE_KEPT' using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger attendance_05_before_delete before delete on public.attendance
  for each row execute function private.attendance_before_delete();

-- The day's roster with schedule, source and correction.
drop function public.get_attendance_day(date);
create function public.get_attendance_day(p_date date)
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
  marked_at timestamptz,
  work_end_time time,
  source text,
  checked_in_at timestamptz,
  corrected_by_name text,
  corrected_at timestamptz,
  correction_note text
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
    a.marked_at,
    e.work_end_time,
    a.source,
    a.checked_in_at,
    c.full_name,
    a.corrected_at,
    a.correction_note
  from public.employees e
  join public.profiles p on p.id = e.user_id and p.deleted_at is null and p.status = 'active'
  left join public.attendance a on a.user_id = e.user_id and a.work_date = p_date
  left join public.profiles m on m.id = a.marked_by
  left join public.profiles c on c.id = a.corrected_by
  where e.status <> 'terminated'
    and (e.hired_on is null or e.hired_on <= p_date)
    and (extract(isodow from p_date)::smallint = any (e.work_days) or a.id is not null)
  order by p.full_name;
end;
$$;
revoke all on function public.get_attendance_day(date) from public, anon;
grant execute on function public.get_attendance_day(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Client billing: which of the published tariffs the client is on (its contents and list price are shown for
-- reference; the agreed price is entered separately and never copied from the list price).
-- ---------------------------------------------------------------------------------------------------------------
alter table public.client_billing add column site_plan_id uuid references public.site_plans (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------------
-- Chat: people who oversee client chats also see who read them.
-- ---------------------------------------------------------------------------------------------------------------
create policy "observers see receipts in client chats" on public.message_reads for select to authenticated using (
  (select private.has_permission('chat.observe'))
  and exists (select 1 from public.messages m join public.chat_rooms r on r.id = m.room_id where m.id = message_id and r.kind = 'project')
);

-- ---------------------------------------------------------------------------------------------------------------
-- Posts: platforms planned with the task; published by hand and confirmed with the link.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.create_content_task(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.clients;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_type public.content_type;
  v_topic text := nullif(btrim(coalesce(p ->> 'topic', '')), '');
  v_info text := nullif(btrim(coalesce(p ->> 'description', '')), '');
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_location text := nullif(btrim(coalesce(p ->> 'location', '')), '');
  v_shoot_at timestamptz := nullif(p ->> 'shoot_at', '')::timestamptz;
  v_post_at timestamptz := nullif(p ->> 'post_at', '')::timestamptz;
  v_writer uuid := nullif(p ->> 'scriptwriter_id', '')::uuid;
  v_responsible uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p -> 'responsible_ids', '[]')) x), '{}');
  v_operators uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p -> 'operator_ids', '[]')) x), '{}');
  v_goers uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p -> 'shoot_member_ids', '[]')) x), '{}');
  v_equipment uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p -> 'equipment_ids', '[]')) x), '{}');
  v_new_equipment text[] := coalesce((select array_agg(distinct btrim(x)) from jsonb_array_elements_text(coalesce(p -> 'new_equipment', '[]')) x where btrim(x) <> ''), '{}');
  v_platforms public.social_platform[];
  v_platform_names text;
  v_staff uuid[] := private.active_staff_ids();
  v_admins uuid[] := private.role_member_ids('admin');
  v_content uuid;
  v_shooting uuid;
  v_script_task uuid;
  v_equipment_task uuid;
  v_shoot_task uuid;
  v_post_task uuid;
  v_name text;
  v_eq uuid;
  v_person uuid;
  v_roles text;
  v_my_task uuid;
  v_when text;
begin
  if v_uid is null or not private.has_permission('tasks.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 200 then
    raise exception 'TITLE_REQUIRED' using errcode = '22023';
  end if;
  if v_topic is null then
    raise exception 'TOPIC_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_type := coalesce(nullif(p ->> 'content_type', ''), 'reel')::public.content_type;
  exception when invalid_text_representation then
    raise exception 'CONTENT_TYPE_INVALID' using errcode = '22023';
  end;
  select * into v_client from public.clients where id = nullif(p ->> 'client_id', '')::uuid and deleted_at is null;
  if v_client.id is null then
    raise exception 'CLIENT_REQUIRED' using errcode = '22023';
  end if;
  if not (private.sees_all_clients() or v_client.id = any (private.staff_client_ids())) then
    raise exception 'Not allowed for this client' using errcode = '42501';
  end if;
  begin
    v_platforms := coalesce(
      (select array_agg(distinct x::public.social_platform) from jsonb_array_elements_text(coalesce(p -> 'platforms', '[]')) x),
      array['instagram']::public.social_platform[]);
  exception when invalid_text_representation then
    raise exception 'PLATFORM_INVALID' using errcode = '22023';
  end;
  v_platform_names := (select string_agg(initcap(x::text), ', ') from unnest(v_platforms) x);
  if (cardinality(v_goers) > 0 or cardinality(v_operators) > 0) and v_shoot_at is null then
    raise exception 'SHOOT_TIME_REQUIRED' using errcode = '22023';
  end if;
  if v_shoot_at is not null and v_post_at is not null and v_post_at < v_shoot_at then
    raise exception 'POST_BEFORE_SHOOT' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_responsible || v_operators || v_goers || coalesce(array[v_writer], '{}')) u(id) where u.id is not null and not (u.id = any (v_staff))) then
    raise exception 'STAFF_REQUIRED' using errcode = '22023';
  end if;
  if v_writer is not null and not private.has_skill(v_writer, 'scriptwriter') then
    raise exception 'SCRIPTWRITER_SKILL' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_operators) o(id) where not private.has_skill(o.id, 'operator')) then
    raise exception 'OPERATOR_SKILL' using errcode = '22023';
  end if;

  perform set_config('sunmedia.quiet_assign', 'on', true);

  insert into public.content_items (client_id, title, content_type, topic, description, manager_note, status, post_at, due_at, created_by)
  values (v_client.id, v_title, v_type, v_topic, v_info, v_note, case when v_writer is not null then 'script' else 'idea' end::public.content_status,
          v_post_at, v_post_at, v_uid)
  returning id into v_content;

  if v_shoot_at is not null then
    insert into public.shootings (client_id, title, description, starts_at, ends_at, location_name, status, responsible_manager_id, created_by)
    values (v_client.id, v_client.name || ' — ' || v_title, v_topic, v_shoot_at, v_shoot_at + interval '2 hours', v_location, 'planned', v_uid, v_uid)
    returning id into v_shooting;
    update public.content_items set shooting_id = v_shooting where id = v_content;
    insert into public.shooting_members (shooting_id, user_id, role, assigned_by)
    select v_shooting, g, case when g = any (v_operators) then 'operator' else 'assistant' end::public.team_role, v_uid from unnest(v_goers) g;
  end if;

  insert into public.content_assignments (content_id, user_id, role, assigned_by)
  select v_content, r, 'project_manager'::public.team_role, v_uid from unnest(v_responsible) r
  union all select v_content, v_writer, 'copywriter'::public.team_role, v_uid where v_writer is not null
  union all select v_content, o, 'operator'::public.team_role, v_uid from unnest(v_operators) o
  on conflict do nothing;

  v_when := concat_ws(E'\n',
    'Mijoz: ' || v_client.name,
    'Kontent: ' || v_title,
    'Turi: ' || private.content_type_label(v_type),
    'Mavzu: ' || v_topic,
    case when v_info is not null then 'Ma’lumot: ' || v_info end,
    case when v_note is not null then 'Rahbar izohi: ' || v_note end,
    case when v_shoot_at is not null then 'Syomka: ' || private.format_local(v_shoot_at, 'DD.MM.YYYY HH24:MI') || coalesce(', ' || v_location, '') end,
    case when v_post_at is not null then 'Post: ' || private.format_local(v_post_at, 'DD.MM.YYYY HH24:MI') end
  );

  if v_writer is not null then
    insert into public.tasks (client_id, content_id, title, description, task_type, stage, status, priority, due_at, created_by)
    values (v_client.id, v_content, v_client.name || ' uchun ssenariy — ' || v_title, v_when, 'copywriting', 'script', 'todo', 'normal',
            coalesce(nullif(p ->> 'script_due_at', '')::timestamptz, v_shoot_at - interval '1 day', v_post_at - interval '2 days'), v_uid)
    returning id into v_script_task;
    insert into public.task_assignments (task_id, user_id, assigned_by) values (v_script_task, v_writer, v_uid);
  end if;

  -- Equipment: new names join the catalogue.
  foreach v_name in array v_new_equipment loop
    insert into public.equipment (name, created_by) values (left(v_name, 80), v_uid)
    on conflict ((lower(btrim(name)))) do update set is_active = true
    returning id into v_eq;
    v_equipment := array_append(v_equipment, v_eq);
  end loop;
  if cardinality(v_equipment) > 0 then
    insert into public.content_equipment (content_id, equipment_id)
    select v_content, e.id from public.equipment e where e.id = any (v_equipment)
    on conflict do nothing;
    insert into public.tasks (client_id, content_id, shooting_id, title, description, task_type, stage, status, priority, due_at, created_by)
    values (v_client.id, v_content, v_shooting, v_client.name || ' syomkasi uchun jihozlar — ' || v_title, v_when, 'other', 'equipment', 'todo', 'normal',
            v_shoot_at - interval '1 hour', v_uid)
    returning id into v_equipment_task;
    insert into public.task_assignments (task_id, user_id, assigned_by) select v_equipment_task, a, v_uid from unnest(v_admins) a;
  end if;

  if v_shooting is not null then
    insert into public.tasks (client_id, content_id, shooting_id, title, description, task_type, stage, status, priority, due_at, created_by)
    values (v_client.id, v_content, v_shooting, v_client.name || ' — syomka: ' || v_title, v_when, 'shooting', 'shooting', 'todo', 'normal', v_shoot_at, v_uid)
    returning id into v_shoot_task;
    insert into public.task_assignments (task_id, user_id, assigned_by)
    select distinct v_shoot_task, u, v_uid from unnest(v_goers || v_operators) u;
  end if;

  if v_type not in ('post', 'carousel', 'design') then
    insert into public.tasks (client_id, content_id, shooting_id, title, description, task_type, stage, status, priority, created_by)
    values (v_client.id, v_content, v_shooting, v_client.name || ' — montaj: ' || v_title, v_when, 'editing', 'editing', 'todo', 'normal', v_uid);
  end if;

  insert into public.tasks (client_id, content_id, title, description, task_type, stage, status, priority, due_at, created_by)
  values (v_client.id, v_content, v_client.name || ' — post: ' || v_title, concat_ws(E'\n', v_when, 'Platforma: ' || v_platform_names), 'publishing', 'publishing', 'todo', 'normal', v_post_at, v_uid)
  returning id into v_post_task;
  -- Where and when it goes out; the link is added when the post is published by hand.
  insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
  select v_content, v_client.id, pl, v_post_at, case when v_post_at is not null then 'scheduled' else 'planned' end::public.publication_status
  from unnest(v_platforms) pl;
  insert into public.task_assignments (task_id, user_id, assigned_by) select v_post_task, r, v_uid from unnest(v_responsible) r;

  perform set_config('sunmedia.quiet_assign', 'off', true);

  -- One message per person, with their part in it.
  for v_person in
    select distinct u from unnest(v_responsible || v_operators || v_goers || coalesce(array[v_writer], '{}')
      || case when v_equipment_task is not null then v_admins else '{}'::uuid[] end) u where u is not null
  loop
    v_roles := concat_ws(', ',
      case when v_person = v_writer then 'Ssenarist' end,
      case when v_person = any (v_operators) then 'Operator' end,
      case when v_person = any (v_goers) then 'Syomkaga borasiz' end,
      case when v_person = any (v_responsible) then 'Mas’ul' end,
      case when v_equipment_task is not null and v_person = any (v_admins) then 'Jihozlarni tayyorlash' end);
    v_my_task := case
      when v_person = v_writer then v_script_task
      when v_person = any (v_goers || v_operators) then v_shoot_task
      when v_equipment_task is not null and v_person = any (v_admins) then v_equipment_task
      else v_post_task
    end;
    perform private.notify_event(
      array[v_person],
      'content:' || v_content || ':created',
      'task.created',
      case when v_person = v_writer then 'Ssenariy vazifasi berildi' else 'Yangi vazifa yaratildi!' end,
      v_client.name || ' — ' || v_title
        || coalesce(' · Syomka: ' || private.format_local(v_shoot_at, 'DD.MM HH24:MI'), '')
        || coalesce(' · Post: ' || private.format_local(v_post_at, 'DD.MM HH24:MI') || ' (' || v_platform_names || ')', '')
        || ' · Rolingiz: ' || v_roles,
      jsonb_build_object('href', '/work/content/' || v_content, 'staff_href', '/xodim/vazifa/' || v_my_task, 'route', '/tasks/' || v_my_task),
      'content_items', v_content, v_client.id
    );
  end loop;

  return v_content;
end;
$$;

create or replace function private.workflow_task_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage in ('script', 'editing') and new.status = 'done' and old.status <> 'done'
     and not private.is_privileged_context() and not private.can_manage_task(old.id) then
    raise exception 'Approval belongs to the Rahbar or admin' using errcode = '42501';
  end if;
  if new.stage = 'equipment' and new.status = 'done' and old.status <> 'done' and not private.is_privileged_context() then
    raise exception 'Equipment is confirmed with confirm_equipment' using errcode = '42501';
  end if;
  if new.stage = 'publishing' and new.status = 'done' and old.status <> 'done' and not private.is_privileged_context() then
    raise exception 'A post is confirmed with its link (confirm_publication)' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The post's time (and platforms) set or moved by a manager; the person responsible is told.
create function public.schedule_post(p_content_id uuid, p_at timestamptz, p_platforms text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.content_items;
  v_task public.tasks := private.workflow_task(p_content_id, 'publishing');
  v_platforms public.social_platform[];
  v_label text;
begin
  select * into v_content from public.content_items where id = p_content_id and deleted_at is null;
  if auth.uid() is null or v_content.id is null
     or not (private.can_manage_client(v_content.client_id, 'content.manage') or private.can_manage_client(v_content.client_id, 'publications.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_at is null then
    raise exception 'POST_TIME_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_platforms := (select array_agg(distinct x::public.social_platform) from unnest(coalesce(p_platforms, '{}')) x);
  exception when invalid_text_representation then
    raise exception 'PLATFORM_INVALID' using errcode = '22023';
  end;
  if v_platforms is null then
    raise exception 'PLATFORM_REQUIRED' using errcode = '22023';
  end if;
  update public.content_items set post_at = p_at, due_at = coalesce(due_at, p_at) where id = p_content_id;
  -- Platforms no longer planned are cancelled (published ones stay as they are).
  update public.content_publications set status = 'cancelled'
  where content_id = p_content_id and status in ('planned', 'scheduled') and not (platform = any (v_platforms));
  insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
  select p_content_id, v_content.client_id, pl, p_at, 'scheduled' from unnest(v_platforms) pl
  on conflict (content_id, platform) do update
    set scheduled_at = excluded.scheduled_at,
        status = case when public.content_publications.status = 'published' then 'published' else 'scheduled' end::public.publication_status;
  if v_task.id is not null then
    update public.tasks set due_at = p_at where id = v_task.id;
    v_label := coalesce((select name from public.clients where id = v_content.client_id), '') || ' — ' || v_content.title;
    perform private.notify_event(
      coalesce((select array_agg(user_id) from public.task_assignments where task_id = v_task.id), '{}'),
      'task:' || v_task.id || ':post_time:' || floor(extract(epoch from clock_timestamp()))::bigint,
      'post.scheduled',
      'Post vaqti: ' || private.format_local(p_at, 'DD.MM HH24:MI'),
      v_label || ' — ' || (select string_agg(initcap(x::text), ', ') from unnest(v_platforms) x),
      jsonb_build_object('href', '/work/content/' || p_content_id, 'staff_href', '/xodim/vazifa/' || v_task.id, 'route', '/tasks/' || v_task.id),
      'tasks', v_task.id, v_content.client_id
    );
  end if;
end;
$$;
revoke all on function public.schedule_post(uuid, timestamptz, text[]) from public, anon;
grant execute on function public.schedule_post(uuid, timestamptz, text[]) to authenticated;

-- "Post joylandi": the person responsible (or a manager) gives the published link for each platform.
create function public.confirm_publication(p_content_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.content_items;
  v_task public.tasks := private.workflow_task(p_content_id, 'publishing');
  v_key text;
  v_url text;
  v_platform public.social_platform;
begin
  select * into v_content from public.content_items where id = p_content_id and deleted_at is null;
  if auth.uid() is null or v_content.id is null or not (
    (v_task.id is not null and exists (select 1 from public.task_assignments where task_id = v_task.id and user_id = auth.uid()))
    or private.can_manage_client(v_content.client_id, 'content.manage')
    or private.can_manage_client(v_content.client_id, 'publications.manage')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'object' or p_links = '{}'::jsonb then
    raise exception 'POST_LINK_REQUIRED' using errcode = '22023';
  end if;
  for v_key, v_url in select key, btrim(value #>> '{}') from jsonb_each(p_links) loop
    begin
      v_platform := v_key::public.social_platform;
    exception when invalid_text_representation then
      raise exception 'PLATFORM_INVALID' using errcode = '22023';
    end;
    if v_url is null or v_url !~* '^https?://[^ ]+\.[^ ]+$' or char_length(v_url) > 500 then
      raise exception 'POST_LINK_INVALID' using errcode = '22023';
    end if;
    insert into public.content_publications (content_id, client_id, platform, scheduled_at, status, post_url, published_at, published_by)
    values (p_content_id, v_content.client_id, v_platform, v_content.post_at, 'published', v_url, now(), auth.uid())
    on conflict (content_id, platform) do update
      set status = 'published', post_url = excluded.post_url, published_at = now(), published_by = auth.uid();
  end loop;
  -- The stage is done once every planned platform has its link.
  if v_task.id is not null then
    if not exists (select 1 from public.content_publications where content_id = p_content_id and status in ('planned', 'scheduled')) then
      update public.tasks set status = 'done' where id = v_task.id and status <> 'done';
    elsif v_task.status = 'todo' then
      update public.tasks set status = 'in_progress' where id = v_task.id;
    end if;
  end if;
end;
$$;
revoke all on function public.confirm_publication(uuid, jsonb) from public, anon;
grant execute on function public.confirm_publication(uuid, jsonb) to authenticated;
