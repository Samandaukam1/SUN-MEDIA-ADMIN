-- SUN MEDIA — every new task assignment is accepted by the person it is given to ("Vazifani qabul qildim").
--   * task_assignments.ack_required / acknowledged_at: per person, per assignment, server time. Assignments that exist
--     before this migration are not required (old work locks nobody out; no acknowledgement time is invented for
--     them); every assignment made from now on is — of any task type, ordinary tasks included. Assigning oneself
--     counts as accepted on the spot. Whoever assigns cannot pre-fill the acknowledgement.
--   * acknowledge_task(task): only the assignee, idempotent (a second press returns the first time). It changes nothing
--     else: the task's status, dates and workflow stay exactly as they were — accepting is not starting or finishing.
--   * get_my_pending_acks(): what this person still has to accept — live assignments only. An assignment removed, or a
--     task deleted, cancelled or finished, drops out by itself.
--   * Realtime: an acknowledgement signals the staff topic and the person's topic (ids only), like an assignment;
--     audited like an assignment.
--   * The assignment notification: "Sizga yangi vazifa biriktirildi!" — "<title> — vazifani ko‘rib chiqing va qabul
--     qiling." (one per assignee, not for assigning oneself). Content-workflow tasks keep their one combined message.

alter table public.task_assignments
  add column if not exists ack_required boolean not null default false,
  add column if not exists acknowledged_at timestamptz;
-- Existing rows got false above; rows from now on default to required.
alter table public.task_assignments alter column ack_required set default true;

create index if not exists task_assignments_pending_ack_idx
  on public.task_assignments (user_id) where ack_required and acknowledged_at is null;

create or replace function private.task_assignments_ack_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ack_required := true;
  new.acknowledged_at := case when new.user_id = coalesce(new.assigned_by, auth.uid()) then now() end;
  return new;
end;
$$;

create trigger task_assignments_ack_defaults
  before insert on public.task_assignments
  for each row execute function private.task_assignments_ack_defaults();

create or replace function public.acknowledge_task(p_task_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.task_assignments a
  set acknowledged_at = now()
  where a.task_id = p_task_id and a.user_id = auth.uid() and a.acknowledged_at is null
    and exists (select 1 from public.tasks t where t.id = a.task_id and t.deleted_at is null)
  returning a.acknowledged_at into v_at;
  if v_at is not null then
    return v_at;
  end if;
  -- Already accepted (a second press, another tab): the first time stands.
  select a.acknowledged_at into v_at
  from public.task_assignments a
  join public.tasks t on t.id = a.task_id and t.deleted_at is null
  where a.task_id = p_task_id and a.user_id = auth.uid();
  if v_at is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

revoke all on function public.acknowledge_task(uuid) from public, anon;
grant execute on function public.acknowledge_task(uuid) to authenticated;

create or replace function public.get_my_pending_acks()
returns table (
  task_id uuid,
  title text,
  description text,
  instructions text,
  task_type public.task_type,
  stage text,
  status public.task_status,
  priority public.priority_level,
  starts_at timestamptz,
  due_at timestamptz,
  client_name text,
  assigned_at timestamptz,
  assigned_by_name text,
  assignees jsonb,
  checklist jsonb,
  files_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.title, t.description, ci.manager_note, t.task_type, t.stage, t.status, t.priority, t.starts_at, t.due_at,
    c.name, a.created_at, coalesce(ab.full_name, cr.full_name),
    (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'accepted', o.acknowledged_at is not null) order by p.full_name), '[]')
     from public.task_assignments o join public.profiles p on p.id = o.user_id where o.task_id = t.id),
    (select coalesce(jsonb_agg(ch.title order by ch.position), '[]') from public.task_checklist_items ch where ch.task_id = t.id),
    (select count(*)::integer from public.files f where f.task_id = t.id and f.status = 'uploaded' and f.deleted_at is null)
  from public.task_assignments a
  join public.tasks t on t.id = a.task_id and t.deleted_at is null and t.status not in ('done', 'cancelled')
  left join public.content_items ci on ci.id = t.content_id
  left join public.clients c on c.id = t.client_id
  left join public.profiles ab on ab.id = a.assigned_by
  left join public.profiles cr on cr.id = t.created_by
  where a.user_id = (select auth.uid()) and a.ack_required and a.acknowledged_at is null
    and (select private.is_active_user())
  order by a.created_at, t.id;
$$;

revoke all on function public.get_my_pending_acks() from public, anon;
grant execute on function public.get_my_pending_acks() to authenticated;

create trigger rt_task_assignment_ack
  after update of acknowledged_at on public.task_assignments
  for each row execute function private.broadcast_change('staff', 'user:user_id');

create trigger audit_task_assignment_ack
  after update of acknowledged_at on public.task_assignments
  for each row execute function private.audit_row('task_id', 'user_id');

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
  -- Nobody is told about a task they gave themselves.
  if new.user_id = coalesce(new.assigned_by, auth.uid()) then
    return null;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  perform private.notify(
    array[new.user_id],
    'task.assigned',
    'Sizga yangi vazifa biriktirildi!',
    v_task.title || ' — vazifani ko‘rib chiqing va qabul qiling.',
    jsonb_build_object('route', '/tasks/' || new.task_id, 'staff_href', '/xodim/vazifa/' || new.task_id),
    'tasks', new.task_id, v_task.client_id,
    case when v_task.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority
  );
  return null;
end;
$$;
