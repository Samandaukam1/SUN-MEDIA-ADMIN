-- One content, one workflow. "+ Vazifa yaratish" creates the content with its stages as linked tasks:
-- ssenariy → jihozlar → syomka → montaj → post. The scriptwriter gets the brief automatically, admins prepare and
-- confirm the equipment, an admin picks the montajyor, and every finished stage moves the content forward and tells
-- the right people once. People are picked by skill. Additive: existing content, shootings and tasks are untouched.

-- ---------------------------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------------------------
alter table public.content_items
  add column topic text check (char_length(topic) <= 300),
  add column manager_note text check (char_length(manager_note) <= 4000),
  add column post_at timestamptz,
  add column equipment_ready_at timestamptz,
  add column equipment_ready_by uuid references public.profiles (id) on delete set null;

alter table public.tasks add column stage text check (stage in ('script', 'equipment', 'shooting', 'editing', 'publishing'));
create unique index tasks_content_stage_key on public.tasks (content_id, stage) where stage is not null and deleted_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Equipment catalogue and what each content needs
-- ---------------------------------------------------------------------------------------------------------------
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index equipment_name_key on public.equipment (lower(btrim(name)));
create trigger equipment_updated_at before update on public.equipment for each row execute function private.set_updated_at();
create trigger audit_equipment after insert or update or delete on public.equipment for each row execute function private.audit_row();

create table public.content_equipment (
  content_id uuid not null references public.content_items (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  prepared_at timestamptz,
  prepared_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (content_id, equipment_id)
);
create index content_equipment_equipment_idx on public.content_equipment (equipment_id);
create trigger audit_content_equipment after insert or update or delete on public.content_equipment
  for each row execute function private.audit_row('content_id', 'equipment_id');

alter table public.equipment enable row level security;
alter table public.content_equipment enable row level security;
revoke all on public.equipment, public.content_equipment from anon, authenticated;
grant select, insert, update on public.equipment to authenticated;
grant select on public.content_equipment to authenticated;
create policy "staff read equipment" on public.equipment for select to authenticated using ((select private.is_staff()));
create policy "managers add equipment" on public.equipment for insert to authenticated
  with check ((select private.has_permission('tasks.manage')) or (select private.has_role('admin')));
create policy "managers edit equipment" on public.equipment for update to authenticated
  using ((select private.has_permission('tasks.manage')) or (select private.has_role('admin')))
  with check ((select private.has_permission('tasks.manage')) or (select private.has_role('admin')));
create policy "staff read content equipment" on public.content_equipment for select to authenticated using ((select private.is_staff()));

insert into public.equipment (name, position) values
  ('Kamera', 1), ('Shtativ', 2), ('Softbox', 3), ('Mikrofon', 4), ('Gimbal', 5), ('Akkumulyator', 6), ('Xotira kartasi', 7), ('LED chiroq', 8)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------
create function private.has_skill(p_user uuid, p_workflow_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employee_skills es join public.skills s on s.id = es.skill_id
    where es.user_id = p_user and s.workflow_role = p_workflow_role
  );
$$;
revoke all on function private.has_skill(uuid, text) from public;

create function private.role_member_ids(p_role text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id and r.key = p_role
  where p.status = 'active' and p.deleted_at is null;
$$;
revoke all on function private.role_member_ids(text) from public;

create function private.content_type_label(p_type public.content_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'reel' then 'Reels' when 'video' then 'Video' when 'post' then 'Post' when 'carousel' then 'Karusel'
    when 'story' then 'Story' when 'design' then 'Dizayn' when 'ad_creative' then 'Reklama kreativi' else 'Boshqa'
  end;
$$;

-- Moves the content forward along the workflow (never backwards, except into and out of "revision").
create function private.workflow_advance(p_content uuid, p_status public.content_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text[] := array['idea', 'script', 'ready_for_shoot', 'shooting', 'shot', 'editing', 'internal_review', 'client_review', 'revision', 'approved', 'scheduled', 'published'];
  v_current public.content_status;
begin
  select status into v_current from public.content_items where id = p_content;
  if v_current is null or v_current = 'cancelled' or v_current = p_status then
    return;
  end if;
  if p_status = 'revision' or v_current = 'revision'
     or array_position(v_order, p_status::text) > array_position(v_order, v_current::text) then
    update public.content_items
    set status = p_status,
        status_changed_at = now(),
        approved_at = case when p_status = 'approved' then now() else approved_at end,
        published_at = case when p_status = 'published' then now() else published_at end,
        revision_count = revision_count + case when p_status = 'revision' then 1 else 0 end
    where id = p_content;
  end if;
end;
$$;
revoke all on function private.workflow_advance(uuid, public.content_status) from public;

create function private.workflow_task(p_content uuid, p_stage text)
returns public.tasks
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.tasks where content_id = p_content and stage = p_stage and deleted_at is null limit 1;
$$;
revoke all on function private.workflow_task(uuid, text) from public;

-- ---------------------------------------------------------------------------------------------------------------
-- Assignment notifications stay quiet while a whole workflow is created at once (one combined message instead).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  if current_setting('sunmedia.quiet_assign', true) = 'on' then
    return null;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  perform private.notify(
    array[new.user_id],
    'task.assigned',
    case v_task.task_type when 'editing' then 'Yangi montaj vazifasi biriktirildi' else 'Yangi vazifa biriktirildi' end,
    v_task.title || coalesce('. Deadline: ' || private.format_local(v_task.due_at), ''),
    jsonb_build_object('route', '/tasks/' || new.task_id),
    'tasks', new.task_id, v_task.client_id,
    case when v_task.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority
  );
  return null;
end;
$$;

create or replace function private.notify_content_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  if current_setting('sunmedia.quiet_assign', true) = 'on' then
    return null;
  end if;
  select * into v_item from public.content_items where id = new.content_id;
  perform private.notify(
    array[new.user_id],
    'content.assigned',
    case new.role
      when 'editor' then 'Yangi montaj vazifasi biriktirildi'
      when 'operator' then 'Yangi syomka kontenti biriktirildi'
      when 'designer' then 'Yangi dizayn vazifasi biriktirildi'
      when 'copywriter' then 'Yangi ssenariy/caption vazifasi'
      else 'Sizga yangi kontent biriktirildi'
    end,
    private.content_label(new.content_id),
    jsonb_build_object('route', '/content/' || new.content_id),
    'content_items', new.content_id, v_item.client_id
  );
  return null;
end;
$$;

create or replace function private.notify_shooting_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shooting public.shootings;
  v_client text;
begin
  if current_setting('sunmedia.quiet_assign', true) = 'on' then
    return null;
  end if;
  select * into v_shooting from public.shootings where id = new.shooting_id;
  select name into v_client from public.clients where id = v_shooting.client_id;
  perform private.notify(
    array[new.user_id],
    'shooting.assigned',
    'Syomka: ' || v_client || ', ' || private.format_local(v_shooting.starts_at),
    v_shooting.title || coalesce('. Lokatsiya: ' || v_shooting.location_name, ''),
    jsonb_build_object('route', '/shootings/' || new.shooting_id),
    'shootings', new.shooting_id, v_shooting.client_id
  );
  return null;
end;
$$;

create or replace function private.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  if current_setting('sunmedia.quiet_assign', true) = 'on' then
    return null;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  perform private.notify(
    (
      select coalesce(array_agg(distinct u), '{}') from (
        select ta.user_id as u from public.task_assignments ta where ta.task_id = new.task_id
        union select v_task.created_by
      ) x where u is not null and u <> new.author_id
    ),
    'task.comment',
    'Yangi izoh: ' || v_task.title,
    left(new.body, 180),
    jsonb_build_object('route', '/task/' || new.task_id),
    'tasks', new.task_id, v_task.client_id, 'normal', true
  );
  return null;
end;
$$;

-- Workflow stages send their own, more specific messages.
create or replace function private.notify_task_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage is null and new.status = 'done' and old.status <> 'done' and new.created_by is not null then
    perform private.notify(
      array[new.created_by], 'task.completed', 'Vazifa bajarildi', new.title,
      jsonb_build_object('route', '/tasks/' || new.id), 'tasks', new.id, new.client_id, 'low'
    );
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- "+ Vazifa yaratish"
-- ---------------------------------------------------------------------------------------------------------------
create function public.create_content_task(p jsonb)
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
  values (v_client.id, v_content, v_client.name || ' — post: ' || v_title, v_when, 'publishing', 'publishing', 'todo', 'normal', v_post_at, v_uid)
  returning id into v_post_task;
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
        || coalesce(' · Post: ' || private.format_local(v_post_at, 'DD.MM HH24:MI'), '')
        || ' · Rolingiz: ' || v_roles,
      jsonb_build_object('href', '/work/content/' || v_content, 'staff_href', '/xodim/vazifa/' || v_my_task, 'route', '/tasks/' || v_my_task),
      'content_items', v_content, v_client.id
    );
  end loop;

  return v_content;
end;
$$;
revoke all on function public.create_content_task(jsonb) from public, anon;
grant execute on function public.create_content_task(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Stage changes: approvals belong to managers; each change moves the content and tells the right people.
-- ---------------------------------------------------------------------------------------------------------------
-- Runs with the caller's rights, so is_privileged_context() tells API calls from the RPCs above.
create function private.workflow_task_guard()
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
  return new;
end;
$$;
create trigger tasks_20_workflow_guard before update of status on public.tasks
  for each row when (new.stage is not null) execute function private.workflow_task_guard();

create function private.workflow_task_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.content_items;
  v_label text;
  v_assignees uuid[];
  v_managers uuid[];
  v_key text := 'task:' || new.id || ':' || new.status || ':' || floor(extract(epoch from clock_timestamp()))::bigint;
  v_note text := nullif(current_setting('sunmedia.review_note', true), '');
  v_href jsonb;
begin
  if new.content_id is null or new.status = old.status then
    return null;
  end if;
  select * into v_content from public.content_items where id = new.content_id;
  if v_content.id is null then
    return null;
  end if;
  v_label := coalesce((select name from public.clients where id = v_content.client_id), '') || ' — ' || v_content.title;
  select coalesce(array_agg(user_id), '{}') into v_assignees from public.task_assignments where task_id = new.id;
  v_managers := private.leadership_ids() || coalesce(array[v_content.created_by], '{}');
  v_href := jsonb_build_object('href', '/work/content/' || v_content.id, 'staff_href', '/xodim/vazifa/' || new.id, 'route', '/tasks/' || new.id);

  if new.stage = 'script' then
    if new.status = 'in_progress' then
      perform private.workflow_advance(v_content.id, 'script');
    elsif new.status = 'in_review' then
      perform private.notify_event(v_managers, v_key, 'script.submitted', 'Ssenariy tasdiqqa yuborildi', v_label, v_href, 'tasks', new.id, v_content.client_id);
    elsif new.status = 'done' then
      perform private.workflow_advance(v_content.id, 'ready_for_shoot');
      perform private.notify_event(v_assignees, v_key, 'script.approved', 'Ssenariy tasdiqlandi', v_label, v_href, 'tasks', new.id, v_content.client_id);
    elsif new.status = 'revision' then
      perform private.notify_event(v_assignees, v_key, 'script.revision', 'Ssenariy tuzatishga qaytarildi', v_label || coalesce('. ' || v_note, ''), v_href, 'tasks', new.id, v_content.client_id, 'high');
    end if;
  elsif new.stage = 'shooting' then
    if new.status = 'in_progress' then
      perform private.workflow_advance(v_content.id, 'shooting');
    elsif new.status = 'done' then
      perform private.workflow_advance(v_content.id, 'shot');
      perform private.notify_event(private.role_member_ids('admin'), v_key, 'shooting.done', 'Syomka tugadi — montajyorni belgilang', v_label, v_href, 'tasks', new.id, v_content.client_id);
    end if;
  elsif new.stage = 'editing' then
    if new.status = 'in_progress' then
      perform private.workflow_advance(v_content.id, 'editing');
    elsif new.status = 'in_review' then
      perform private.workflow_advance(v_content.id, 'internal_review');
      perform private.notify_event(private.role_member_ids('admin') || v_managers, v_key, 'editing.submitted', 'Montaj tugatildi — tekshiring', v_label, v_href, 'tasks', new.id, v_content.client_id);
    elsif new.status = 'done' then
      perform private.workflow_advance(v_content.id, 'approved');
      perform private.notify_event(
        v_assignees || v_managers || coalesce((select array_agg(user_id) from public.content_assignments where content_id = v_content.id and role = 'project_manager'), '{}'),
        v_key, 'content.approved', 'Kontent tasdiqlandi', v_label, v_href, 'content_items', v_content.id, v_content.client_id);
    elsif new.status = 'revision' then
      perform private.workflow_advance(v_content.id, 'revision');
      perform private.notify_event(v_assignees, v_key, 'editing.revision', 'Montaj tuzatishga qaytarildi', v_label || coalesce('. ' || v_note, ''), v_href, 'tasks', new.id, v_content.client_id, 'high');
    end if;
  elsif new.stage = 'publishing' and new.status = 'done' then
    perform private.workflow_advance(v_content.id, 'published');
    perform private.notify_event(v_managers, v_key, 'content.published', 'Post joylandi', v_label, v_href, 'content_items', v_content.id, v_content.client_id, 'low');
  end if;
  return null;
end;
$$;
revoke all on function private.workflow_task_changed() from public;
create trigger tasks_workflow_changed after update of status on public.tasks
  for each row when (new.stage is not null) execute function private.workflow_task_changed();

-- ---------------------------------------------------------------------------------------------------------------
-- Script: the scriptwriter writes and sends it; the Rahbar approves or returns it.
-- ---------------------------------------------------------------------------------------------------------------
create function public.save_script(p_content_id uuid, p_script text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks := private.workflow_task(p_content_id, 'script');
  v_client uuid := (select client_id from public.content_items where id = p_content_id);
  v_mine boolean;
  v_manager boolean;
begin
  if auth.uid() is null or v_client is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_mine := v_task.id is not null and exists (select 1 from public.task_assignments where task_id = v_task.id and user_id = auth.uid());
  v_manager := private.can_manage_client(v_client, 'content.manage');
  if not (v_mine or v_manager) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not v_manager and v_task.status in ('in_review', 'done') then
    raise exception 'SCRIPT_LOCKED' using errcode = '22023';
  end if;
  update public.content_items set script = left(coalesce(p_script, ''), 20000) where id = p_content_id;
  if v_mine and v_task.status in ('todo', 'revision') then
    update public.tasks set status = 'in_progress' where id = v_task.id;
  end if;
end;
$$;
revoke all on function public.save_script(uuid, text) from public, anon;
grant execute on function public.save_script(uuid, text) to authenticated;

create function public.submit_script(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks := private.workflow_task(p_content_id, 'script');
begin
  if v_task.id is null or not exists (select 1 from public.task_assignments where task_id = v_task.id and user_id = auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim((select script from public.content_items where id = p_content_id)), '') = '' then
    raise exception 'SCRIPT_EMPTY' using errcode = '22023';
  end if;
  if v_task.status not in ('todo', 'in_progress', 'revision') then
    raise exception 'SCRIPT_NOT_EDITABLE' using errcode = '22023';
  end if;
  update public.tasks set status = 'in_review' where id = v_task.id;
end;
$$;
revoke all on function public.submit_script(uuid) from public, anon;
grant execute on function public.submit_script(uuid) to authenticated;

create function public.review_script(p_content_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks := private.workflow_task(p_content_id, 'script');
  v_client uuid := (select client_id from public.content_items where id = p_content_id);
begin
  if v_client is null or not private.can_manage_client(v_client, 'content.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_task.id is null or v_task.status <> 'in_review' then
    raise exception 'SCRIPT_NOT_IN_REVIEW' using errcode = '22023';
  end if;
  if not p_approve and nullif(btrim(p_note), '') is null then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;
  perform set_config('sunmedia.review_note', coalesce(btrim(p_note), ''), true);
  if nullif(btrim(p_note), '') is not null then
    perform set_config('sunmedia.quiet_assign', 'on', true);
    insert into public.task_comments (task_id, author_id, body) values (v_task.id, auth.uid(), left(btrim(p_note), 4000));
    perform set_config('sunmedia.quiet_assign', 'off', true);
  end if;
  update public.tasks set status = case when p_approve then 'done' else 'revision' end::public.task_status where id = v_task.id;
  perform set_config('sunmedia.review_note', '', true);
end;
$$;
revoke all on function public.review_script(uuid, boolean, text) from public, anon;
grant execute on function public.review_script(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Equipment: admins tick items as they pack them, then confirm; the Rahbar is told.
-- ---------------------------------------------------------------------------------------------------------------
create function private.can_prepare_equipment(p_content uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin') or private.has_role('system_owner') or exists (
    select 1 from public.tasks t join public.task_assignments ta on ta.task_id = t.id
    where t.content_id = p_content and t.stage = 'equipment' and t.deleted_at is null and ta.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_prepare_equipment(uuid) from public;

create function public.set_equipment_prepared(p_content_id uuid, p_equipment_id uuid, p_prepared boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_prepare_equipment(p_content_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if (select equipment_ready_at from public.content_items where id = p_content_id) is not null then
    raise exception 'EQUIPMENT_CONFIRMED' using errcode = '22023';
  end if;
  update public.content_equipment
  set prepared_at = case when p_prepared then now() end,
      prepared_by = case when p_prepared then auth.uid() end
  where content_id = p_content_id and equipment_id = p_equipment_id;
  if not found then
    raise exception 'Equipment item not found' using errcode = 'P0002';
  end if;
  update public.tasks set status = 'in_progress'
  where content_id = p_content_id and stage = 'equipment' and status = 'todo' and deleted_at is null;
end;
$$;
revoke all on function public.set_equipment_prepared(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_equipment_prepared(uuid, uuid, boolean) to authenticated;

create function public.add_content_equipment(p_content_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_content public.content_items;
  v_task uuid;
begin
  select * into v_content from public.content_items where id = p_content_id;
  if auth.uid() is null or v_content.id is null
     or not (private.can_prepare_equipment(p_content_id) or private.can_manage_client(v_content.client_id, 'content.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;
  if v_content.equipment_ready_at is not null then
    raise exception 'EQUIPMENT_CONFIRMED' using errcode = '22023';
  end if;
  insert into public.equipment (name, created_by) values (v_name, auth.uid())
  on conflict ((lower(btrim(name)))) do update set is_active = true
  returning id into v_id;
  insert into public.content_equipment (content_id, equipment_id) values (p_content_id, v_id) on conflict do nothing;
  -- A content that had no equipment yet gets its equipment stage now.
  if private.workflow_task(p_content_id, 'equipment') is null then
    perform set_config('sunmedia.quiet_assign', 'on', true);
    insert into public.tasks (client_id, content_id, shooting_id, title, task_type, stage, status, priority, due_at, created_by)
    select v_content.client_id, v_content.id, v_content.shooting_id,
           coalesce((select name from public.clients where id = v_content.client_id), '') || ' syomkasi uchun jihozlar — ' || v_content.title,
           'other', 'equipment', 'todo', 'normal', (select starts_at - interval '1 hour' from public.shootings where id = v_content.shooting_id), auth.uid()
    returning id into v_task;
    insert into public.task_assignments (task_id, user_id, assigned_by) select v_task, a, auth.uid() from unnest(private.role_member_ids('admin')) a;
    perform set_config('sunmedia.quiet_assign', 'off', true);
  end if;
  return v_id;
end;
$$;
revoke all on function public.add_content_equipment(uuid, text) from public, anon;
grant execute on function public.add_content_equipment(uuid, text) to authenticated;

create function public.confirm_equipment(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.content_items;
  v_label text;
  v_name text;
  v_task public.tasks := private.workflow_task(p_content_id, 'equipment');
begin
  if auth.uid() is null or not private.can_prepare_equipment(p_content_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_content from public.content_items where id = p_content_id;
  if v_content.equipment_ready_at is not null then
    raise exception 'EQUIPMENT_CONFIRMED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.content_equipment where content_id = p_content_id) then
    raise exception 'EQUIPMENT_EMPTY' using errcode = '22023';
  end if;
  if exists (select 1 from public.content_equipment where content_id = p_content_id and prepared_at is null) then
    raise exception 'EQUIPMENT_NOT_READY' using errcode = '22023';
  end if;
  update public.content_items set equipment_ready_at = now(), equipment_ready_by = auth.uid() where id = p_content_id;
  if v_task.id is not null then
    update public.tasks set status = 'done' where id = v_task.id;
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  v_label := coalesce((select name from public.clients where id = v_content.client_id), '');
  perform private.notify_event(
    private.leadership_ids() || coalesce(array[v_content.created_by], '{}'),
    'content:' || p_content_id || ':equipment_ready',
    'equipment.ready',
    'Jihozlar tayyor: ' || v_label,
    v_label || ' syomkasi uchun barcha jihozlar tayyorlandi. Tasdiqladi: ' || coalesce(v_name, 'Admin') || '. Holat: Tayyor',
    jsonb_build_object('href', '/work/content/' || p_content_id, 'staff_href', '/xodim'),
    'content_items', p_content_id, v_content.client_id
  );
end;
$$;
revoke all on function public.confirm_equipment(uuid) from public, anon;
grant execute on function public.confirm_equipment(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Montaj: an admin (or the leadership) picks a montajyor with the skill and a deadline, then accepts the work.
-- ---------------------------------------------------------------------------------------------------------------
create function public.assign_editing(p_content_id uuid, p_editor_id uuid, p_due_at timestamptz, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.content_items;
  v_task public.tasks := private.workflow_task(p_content_id, 'editing');
  v_task_id uuid;
  v_label text;
begin
  if auth.uid() is null or not (private.has_role('admin') or private.is_leadership()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_content from public.content_items where id = p_content_id and deleted_at is null;
  if v_content.id is null then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;
  if not (p_editor_id = any (private.active_staff_ids())) or not private.has_skill(p_editor_id, 'editor') then
    raise exception 'EDITOR_SKILL' using errcode = '22023';
  end if;
  if p_due_at is null then
    raise exception 'DUE_REQUIRED' using errcode = '22023';
  end if;
  if v_task.status = 'done' then
    raise exception 'EDITING_DONE' using errcode = '22023';
  end if;
  v_label := coalesce((select name from public.clients where id = v_content.client_id), '') || ' — ' || v_content.title;

  perform set_config('sunmedia.quiet_assign', 'on', true);
  if v_task.id is null then
    insert into public.tasks (client_id, content_id, shooting_id, title, task_type, stage, status, priority, due_at, description, created_by)
    values (v_content.client_id, v_content.id, v_content.shooting_id,
            coalesce((select name from public.clients where id = v_content.client_id), '') || ' — montaj: ' || v_content.title,
            'editing', 'editing', 'todo', 'normal', p_due_at, nullif(btrim(p_note), ''), auth.uid())
    returning id into v_task_id;
  else
    v_task_id := v_task.id;
    update public.tasks set due_at = p_due_at, description = coalesce(nullif(btrim(p_note), ''), description) where id = v_task_id;
    delete from public.task_assignments where task_id = v_task_id and user_id <> p_editor_id;
  end if;
  insert into public.task_assignments (task_id, user_id, assigned_by) values (v_task_id, p_editor_id, auth.uid()) on conflict do nothing;
  delete from public.content_assignments where content_id = v_content.id and role = 'editor' and user_id <> p_editor_id;
  insert into public.content_assignments (content_id, user_id, role, assigned_by) values (v_content.id, p_editor_id, 'editor', auth.uid()) on conflict do nothing;
  perform set_config('sunmedia.quiet_assign', 'off', true);

  perform private.notify_event(
    array[p_editor_id],
    'task:' || v_task_id || ':editor:' || p_editor_id || ':' || floor(extract(epoch from clock_timestamp()))::bigint,
    'editing.assigned',
    'Montaj vazifasi berildi',
    v_label || '. Topshirish: ' || private.format_local(p_due_at, 'DD.MM HH24:MI'),
    jsonb_build_object('href', '/work/content/' || v_content.id, 'staff_href', '/xodim/vazifa/' || v_task_id, 'route', '/tasks/' || v_task_id),
    'tasks', v_task_id, v_content.client_id, 'high'
  );
  return v_task_id;
end;
$$;
revoke all on function public.assign_editing(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.assign_editing(uuid, uuid, timestamptz, text) to authenticated;

create function public.review_editing(p_content_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks := private.workflow_task(p_content_id, 'editing');
begin
  if auth.uid() is null or not (private.has_role('admin') or private.is_leadership()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_task.id is null or v_task.status <> 'in_review' then
    raise exception 'EDITING_NOT_IN_REVIEW' using errcode = '22023';
  end if;
  if not p_approve and nullif(btrim(p_note), '') is null then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;
  perform set_config('sunmedia.review_note', coalesce(btrim(p_note), ''), true);
  if nullif(btrim(p_note), '') is not null then
    perform set_config('sunmedia.quiet_assign', 'on', true);
    insert into public.task_comments (task_id, author_id, body) values (v_task.id, auth.uid(), left(btrim(p_note), 4000));
    perform set_config('sunmedia.quiet_assign', 'off', true);
  end if;
  update public.tasks set status = case when p_approve then 'done' else 'revision' end::public.task_status where id = v_task.id;
  perform set_config('sunmedia.review_note', '', true);
end;
$$;
revoke all on function public.review_editing(uuid, boolean, text) from public, anon;
grant execute on function public.review_editing(uuid, boolean, text) to authenticated;
