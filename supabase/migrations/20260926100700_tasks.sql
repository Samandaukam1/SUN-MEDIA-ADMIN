-- SUN MEDIA — task management: dependencies, comments, attachments and an atomic save.
--   * task_dependencies: "B cannot start before A is done" (no self or two-way links).
--   * task_comments: staff discussion on a task (assignees, managers).
--   * files.task_id: attachments uploaded against a task (upload flow in the Files module).
--   * save_task (SECURITY INVOKER): task + assignees + checklist + dependencies in one
--     transaction; every write passes the caller's RLS (tasks.manage, client scope).

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on uuid not null references public.tasks (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);

create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on);

alter table public.task_dependencies enable row level security;

create policy "read task dependencies" on public.task_dependencies
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create policy "managers link task dependencies" on public.task_dependencies
  for insert to authenticated
  with check (private.can_manage_task(task_id) and exists (select 1 from public.tasks t where t.id = depends_on));

create policy "managers unlink task dependencies" on public.task_dependencies
  for delete to authenticated
  using (private.can_manage_task(task_id));

create or replace function private.task_dependencies_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Direct cycle (A→B and B→A) or a chain back to the task itself.
  if exists (
    with recursive chain(id) as (
      select new.depends_on
      union
      select d.depends_on from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'Tasks cannot depend on each other in a loop' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_guard
  before insert on public.task_dependencies
  for each row execute function private.task_dependencies_guard();

create trigger audit_task_dependencies after insert or delete on public.task_dependencies
  for each row execute function private.audit_row('task_id', 'depends_on');

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy "read task comments" on public.task_comments
  for select to authenticated
  using (deleted_at is null and exists (select 1 from public.tasks t where t.id = task_id));

create policy "task people comment" on public.task_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (private.can_manage_task(task_id) or task_id = any ((select private.my_task_ids())::uuid[]))
  );

create policy "authors edit own task comments" on public.task_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create trigger task_comments_updated_at
  before update on public.task_comments
  for each row execute function private.set_updated_at();

-- Notify the other people on the task when someone comments.
create or replace function private.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
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

create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function private.notify_task_comment();

-- Attachments uploaded against a task.
alter table public.files add column if not exists task_id uuid references public.tasks (id) on delete set null;
create index if not exists files_task_idx on public.files (task_id) where task_id is not null;

-- Realtime: tasks' side tables reach staff sessions.
create trigger rt_task_dependencies after insert or delete on public.task_dependencies
  for each row execute function private.broadcast_change('staff');
create trigger rt_task_comments after insert or update on public.task_comments
  for each row execute function private.broadcast_change('staff');

-- ---------------------------------------------------------------------------
-- Atomic save
-- ---------------------------------------------------------------------------
create or replace function public.save_task(p_task_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_task_id;
  v_title text := nullif(btrim(coalesce(p_payload ->> 'title', '')), '');
  v_due timestamptz := nullif(p_payload ->> 'due_at', '')::timestamptz;
  v_starts timestamptz := nullif(p_payload ->> 'starts_at', '')::timestamptz;
  v_item jsonb;
  v_position integer := 0;
begin
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Title is required (1–200 characters)' using errcode = '22023';
  end if;
  if v_starts is not null and v_due is not null and v_due < v_starts then
    raise exception 'Deadline must be after the start' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.tasks (client_id, project_id, content_id, shooting_id, title, description, task_type, status, priority,
                              starts_at, due_at, estimated_minutes)
    values (
      nullif(p_payload ->> 'client_id', '')::uuid,
      nullif(p_payload ->> 'project_id', '')::uuid,
      nullif(p_payload ->> 'content_id', '')::uuid,
      nullif(p_payload ->> 'shooting_id', '')::uuid,
      v_title,
      nullif(p_payload ->> 'description', ''),
      coalesce((p_payload ->> 'task_type')::public.task_type, 'other'),
      coalesce((p_payload ->> 'status')::public.task_status, 'todo'),
      coalesce((p_payload ->> 'priority')::public.priority_level, 'normal'),
      v_starts,
      v_due,
      nullif(p_payload ->> 'estimated_minutes', '')::integer
    )
    returning id into v_id;
  else
    update public.tasks set
      title = v_title,
      description = case when p_payload ? 'description' then nullif(p_payload ->> 'description', '') else description end,
      task_type = coalesce((p_payload ->> 'task_type')::public.task_type, task_type),
      priority = coalesce((p_payload ->> 'priority')::public.priority_level, priority),
      status = coalesce((p_payload ->> 'status')::public.task_status, status),
      project_id = case when p_payload ? 'project_id' then nullif(p_payload ->> 'project_id', '')::uuid else project_id end,
      content_id = case when p_payload ? 'content_id' then nullif(p_payload ->> 'content_id', '')::uuid else content_id end,
      starts_at = case when p_payload ? 'starts_at' then v_starts else starts_at end,
      due_at = case when p_payload ? 'due_at' then v_due else due_at end,
      estimated_minutes = case when p_payload ? 'estimated_minutes' then nullif(p_payload ->> 'estimated_minutes', '')::integer else estimated_minutes end
    where id = v_id and deleted_at is null;
    if not found then
      raise exception 'Task not found' using errcode = 'P0002';
    end if;
  end if;

  if p_payload ? 'assignees' then
    delete from public.task_assignments ta
    where ta.task_id = v_id and not (ta.user_id::text in (select jsonb_array_elements_text(p_payload -> 'assignees')));
    insert into public.task_assignments (task_id, user_id)
    select v_id, x::uuid from jsonb_array_elements_text(p_payload -> 'assignees') x
    on conflict do nothing;
  end if;

  -- Checklist: the payload is the full list [{id?, title, is_done}] in display order.
  if p_payload ? 'checklist' then
    delete from public.task_checklist_items c
    where c.task_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_payload -> 'checklist') i where (i ->> 'id') = c.id::text);
    for v_item in select value from jsonb_array_elements(p_payload -> 'checklist') loop
      v_position := v_position + 1;
      continue when nullif(btrim(coalesce(v_item ->> 'title', '')), '') is null;
      if (v_item ->> 'id') is not null then
        update public.task_checklist_items
        set title = left(btrim(v_item ->> 'title'), 200), is_done = coalesce((v_item ->> 'is_done')::boolean, is_done), position = v_position
        where id = (v_item ->> 'id')::uuid and task_id = v_id;
      else
        insert into public.task_checklist_items (task_id, title, is_done, position)
        values (v_id, left(btrim(v_item ->> 'title'), 200), coalesce((v_item ->> 'is_done')::boolean, false), v_position);
      end if;
    end loop;
  end if;

  if p_payload ? 'depends_on' then
    delete from public.task_dependencies d
    where d.task_id = v_id and not (d.depends_on::text in (select jsonb_array_elements_text(p_payload -> 'depends_on')));
    insert into public.task_dependencies (task_id, depends_on)
    select v_id, x::uuid from jsonb_array_elements_text(p_payload -> 'depends_on') x
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_task(uuid, jsonb) from public, anon;
grant execute on function public.save_task(uuid, jsonb) to authenticated;
