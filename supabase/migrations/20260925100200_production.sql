-- SUN MEDIA — production: shootings, content pipeline, publications, comments, tasks.

-- ---------------------------------------------------------------------------
-- Shootings
-- ---------------------------------------------------------------------------
create table public.shootings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text check (char_length(location_name) <= 200),
  location_address text,
  location_lat double precision check (location_lat between -90 and 90),
  location_lng double precision check (location_lng between -180 and 180),
  location_url text,
  -- [{ "title": "...", "description": "...", "done": false }]
  shot_list jsonb not null default '[]' check (jsonb_typeof(shot_list) = 'array'),
  -- [{ "url": "...", "note": "..." }]
  reference_links jsonb not null default '[]' check (jsonb_typeof(reference_links) = 'array'),
  responsible_manager_id uuid references public.profiles (id) on delete set null,
  status public.shooting_status not null default 'planned',
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, client_id),
  foreign key (project_id, client_id) references public.projects (id, client_id),
  check (ends_at > starts_at),
  check (actual_ended_at is null or actual_started_at is null or actual_ended_at >= actual_started_at)
);

create index shootings_client_starts_idx on public.shootings (client_id, starts_at) where deleted_at is null;
create index shootings_starts_idx on public.shootings (starts_at) where deleted_at is null;

create trigger shootings_updated_at
  before update on public.shootings
  for each row execute function private.set_updated_at();

create table public.shooting_members (
  shooting_id uuid not null references public.shootings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'operator',
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (shooting_id, user_id)
);

create index shooting_members_user_idx on public.shooting_members (user_id);

create trigger shooting_members_staff_only
  before insert or update on public.shooting_members
  for each row execute function private.guard_staff_assignment();

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.content_counters (
  client_id uuid not null references public.clients (id) on delete cascade,
  content_type public.content_type not null,
  last_number integer not null default 0,
  primary key (client_id, content_type)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid,
  shooting_id uuid,
  number integer not null default 0,
  title text not null check (char_length(title) between 1 and 200),
  content_type public.content_type not null,
  description text,
  script text,
  caption text,
  hashtags text[] not null default '{}',
  reference_links jsonb not null default '[]' check (jsonb_typeof(reference_links) = 'array'),
  music_reference text,
  thumbnail_file_id uuid,
  status public.content_status not null default 'idea',
  priority public.priority_level not null default 'normal',
  -- Month of the content plan this item belongs to (always the 1st day).
  plan_month date not null default date_trunc('month', private.agency_today())::date
    check (extract(day from plan_month) = 1),
  due_at timestamptz,
  client_approval_due_at timestamptz,
  is_client_visible boolean not null default true,
  counts_toward_plan boolean not null default true,
  revision_count integer not null default 0 check (revision_count >= 0),
  status_changed_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, client_id),
  unique (client_id, content_type, number),
  foreign key (project_id, client_id) references public.projects (id, client_id),
  foreign key (shooting_id, client_id) references public.shootings (id, client_id)
);

create index content_items_client_month_idx on public.content_items (client_id, plan_month) where deleted_at is null;
create index content_items_status_idx on public.content_items (status) where deleted_at is null;
create index content_items_shooting_idx on public.content_items (shooting_id) where shooting_id is not null;
create index content_items_due_idx on public.content_items (due_at) where deleted_at is null;
create index content_items_title_trgm on public.content_items using gin (title extensions.gin_trgm_ops);

create trigger content_items_updated_at
  before update on public.content_items
  for each row execute function private.set_updated_at();

create table public.content_assignments (
  content_id uuid not null references public.content_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (content_id, user_id, role)
);

create index content_assignments_user_idx on public.content_assignments (user_id);

create trigger content_assignments_staff_only
  before insert or update on public.content_assignments
  for each row execute function private.guard_staff_assignment();

create table public.content_publications (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null,
  platform public.social_platform not null,
  social_account_id uuid,
  scheduled_at timestamptz,
  published_at timestamptz,
  status public.publication_status not null default 'planned',
  post_url text,
  external_post_id text,
  published_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade,
  check (status <> 'published' or published_at is not null)
);

create index content_publications_scheduled_idx on public.content_publications (scheduled_at);
create index content_publications_client_idx on public.content_publications (client_id, scheduled_at);

create trigger content_publications_updated_at
  before update on public.content_publications
  for each row execute function private.set_updated_at();

create table public.content_status_history (
  id bigint generated always as identity primary key,
  content_id uuid not null references public.content_items (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  from_status public.content_status,
  to_status public.content_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create index content_status_history_content_idx on public.content_status_history (content_id, changed_at);
create index content_status_history_client_idx on public.content_status_history (client_id, changed_at);

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.content_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  visibility public.visibility_level not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade
);

create index content_comments_content_idx on public.content_comments (content_id, created_at);

create trigger content_comments_updated_at
  before update on public.content_comments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete restrict,
  project_id uuid,
  content_id uuid,
  shooting_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  task_type public.task_type not null default 'other',
  status public.task_status not null default 'todo',
  priority public.priority_level not null default 'normal',
  starts_at timestamptz,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  overdue_at timestamptz,
  estimated_minutes integer check (estimated_minutes > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (project_id, client_id) references public.projects (id, client_id),
  foreign key (content_id, client_id) references public.content_items (id, client_id),
  foreign key (shooting_id, client_id) references public.shootings (id, client_id),
  check ((project_id is null and content_id is null and shooting_id is null) or client_id is not null),
  check (due_at is null or starts_at is null or due_at >= starts_at)
);

create index tasks_due_idx on public.tasks (due_at) where deleted_at is null and status not in ('done', 'cancelled');
create index tasks_client_idx on public.tasks (client_id) where deleted_at is null;
create index tasks_content_idx on public.tasks (content_id) where content_id is not null;
create index tasks_shooting_idx on public.tasks (shooting_id) where shooting_id is not null;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

create table public.task_assignments (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignments_user_idx on public.task_assignments (user_id);

create trigger task_assignments_staff_only
  before insert or update on public.task_assignments
  for each row execute function private.guard_staff_assignment();

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  is_done boolean not null default false,
  position integer not null default 0,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_checklist_items_task_idx on public.task_checklist_items (task_id, position);

create trigger task_checklist_items_updated_at
  before update on public.task_checklist_items
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers for assignment-based visibility
-- ---------------------------------------------------------------------------
create or replace function private.my_shooting_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_staff() then '{}'::uuid[] else
    (select coalesce(array_agg(distinct s.id), '{}')
     from (
       select sm.shooting_id as id from public.shooting_members sm where sm.user_id = (select auth.uid())
       union all
       select sh.id from public.shootings sh where sh.responsible_manager_id = (select auth.uid())
     ) s)
  end;
$$;

create or replace function private.my_task_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_staff() then '{}'::uuid[] else
    (select coalesce(array_agg(ta.task_id), '{}') from public.task_assignments ta where ta.user_id = (select auth.uid()))
  end;
$$;

-- Content a staff member works on: direct assignment, an assigned task, or a shooting they attend.
create or replace function private.assigned_content_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_staff() then '{}'::uuid[] else
    (select coalesce(array_agg(distinct s.id), '{}')
     from (
       select ca.content_id as id from public.content_assignments ca where ca.user_id = (select auth.uid())
       union all
       select t.content_id from public.tasks t
       join public.task_assignments ta on ta.task_id = t.id
       where ta.user_id = (select auth.uid()) and t.content_id is not null
       union all
       select ci.id from public.content_items ci
       where ci.shooting_id = any (private.my_shooting_ids())
     ) s)
  end;
$$;

-- Clients a staff member currently works for through assignments (content, tasks, shootings).
create or replace function private.work_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_staff() then '{}'::uuid[] else
    (select coalesce(array_agg(distinct s.client_id), '{}')
     from (
       select ci.client_id from public.content_items ci where ci.id = any (private.assigned_content_ids())
       union all
       select sh.client_id from public.shootings sh where sh.id = any (private.my_shooting_ids())
       union all
       select t.client_id from public.tasks t where t.id = any (private.my_task_ids()) and t.client_id is not null
     ) s)
  end;
$$;

create or replace function private.can_manage_content(p_content uuid, p_permission text default 'content.manage')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.content_items c
    where c.id = p_content and private.can_manage_client(c.client_id, p_permission)
  );
$$;

create or replace function private.can_manage_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and private.has_permission('tasks.manage')
      and (
        private.sees_all_clients()
        or (t.client_id is null and t.created_by = (select auth.uid()))
        or t.client_id = any (private.staff_client_ids())
      )
  );
$$;

-- Clients also see the SUN MEDIA people working on their content and shootings.
create or replace function private.client_visible_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with my_clients as (select unnest(private.member_client_ids()) as client_id)
  select coalesce(array_agg(distinct s.user_id), '{}')
  from (
    select cm.user_id from public.client_members cm join my_clients m using (client_id)
    union all
    select ctm.user_id from public.client_team_members ctm join my_clients m using (client_id)
    union all
    select ca.user_id
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_id
    join my_clients m on m.client_id = ci.client_id
    union all
    select sm.user_id
    from public.shooting_members sm
    join public.shootings sh on sh.id = sm.shooting_id
    join my_clients m on m.client_id = sh.client_id
    union all
    select sh.responsible_manager_id
    from public.shootings sh
    join my_clients m on m.client_id = sh.client_id
    where sh.responsible_manager_id is not null
  ) s;
$$;

grant execute on function
  private.my_shooting_ids(),
  private.my_task_ids(),
  private.assigned_content_ids(),
  private.work_client_ids(),
  private.can_manage_content(uuid, text),
  private.can_manage_task(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Content integrity: numbering, column guards, status history
-- ---------------------------------------------------------------------------
create or replace function private.resolve_client_for(p_content uuid, p_shooting uuid, p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select client_id from public.content_items where id = p_content),
    (select client_id from public.shootings where id = p_shooting),
    (select client_id from public.projects where id = p_project)
  );
$$;

create or replace function private.next_content_number(p_client uuid, p_type public.content_type)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.content_counters as cc (client_id, content_type, last_number)
  values (p_client, p_type, 1)
  on conflict (client_id, content_type) do update set last_number = cc.last_number + 1
  returning last_number;
$$;

grant execute on function
  private.resolve_client_for(uuid, uuid, uuid),
  private.next_content_number(uuid, public.content_type)
to authenticated;

create or replace function private.content_items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.number := private.next_content_number(new.client_id, new.content_type);
  if not private.is_privileged_context() then
    new.created_by := auth.uid();
  end if;
  new.revision_count := 0;
  new.status_changed_at := now();
  if not private.is_privileged_context() then
    new.approved_at := null;
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger content_items_10_before_insert
  before insert on public.content_items
  for each row execute function private.content_items_before_insert();

-- Non-managers (copywriters, SMM on assigned content) may only edit copy fields.
-- Status and system counters change exclusively through RPCs.
create or replace function private.content_items_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_copy_fields text[] := array['script', 'caption', 'hashtags', 'reference_links', 'music_reference', 'updated_at'];
begin
  if private.is_privileged_context() then
    if new.content_type is distinct from old.content_type then
      new.number := private.next_content_number(new.client_id, new.content_type);
    end if;
    return new;
  end if;

  if new.client_id is distinct from old.client_id or new.number is distinct from old.number then
    raise exception 'client_id and number are immutable' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     or new.revision_count is distinct from old.revision_count
     or new.status_changed_at is distinct from old.status_changed_at
     or new.approved_at is distinct from old.approved_at
     or new.published_at is distinct from old.published_at then
    raise exception 'Use set_content_status / review RPCs to change workflow fields' using errcode = '42501';
  end if;

  if not private.can_manage_client(old.client_id, 'content.manage') then
    if (to_jsonb(new) - v_copy_fields) is distinct from (to_jsonb(old) - v_copy_fields) then
      raise exception 'You can only edit script, caption, hashtags and references' using errcode = '42501';
    end if;
  end if;

  if new.content_type is distinct from old.content_type then
    new.number := private.next_content_number(new.client_id, new.content_type);
  end if;
  return new;
end;
$$;

create trigger content_items_10_guard_update
  before update on public.content_items
  for each row execute function private.content_items_guard_update();

create or replace function private.content_items_track_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.content_status_history (content_id, client_id, from_status, to_status, changed_by, note)
    values (
      new.id, new.client_id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status, auth.uid(),
      nullif(current_setting('sunmedia.status_note', true), '')
    );
  end if;
  return null;
end;
$$;

create trigger content_items_track_status
  after insert or update of status on public.content_items
  for each row execute function private.content_items_track_status();

-- Allowed transitions for assignees who are not content managers.
create or replace function private.assignee_transition_allowed(p_from public.content_status, p_to public.content_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('idea'::public.content_status, 'script'::public.content_status),
    ('script', 'shooting'),
    ('script', 'editing'),
    ('shooting', 'editing'),
    ('revision', 'editing'),
    ('approved', 'scheduled'),
    ('scheduled', 'published')
  );
$$;

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
  select * into v_item from public.content_items where id = p_content_id and deleted_at is null for update;
  if not found then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;
  if v_item.status = p_status then
    return v_item;
  end if;

  if not private.can_manage_client(v_item.client_id, 'content.manage') then
    if not (p_content_id = any (private.assigned_content_ids())
            and private.assignee_transition_allowed(v_item.status, p_status)) then
      raise exception 'Not allowed to move content from % to %', v_item.status, p_status using errcode = '42501';
    end if;
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

grant execute on function public.set_content_status(uuid, public.content_status, text) to authenticated;

-- When every publication of a content item is published, the item itself becomes published.
create or replace function private.sync_content_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published'
     and not exists (
       select 1 from public.content_publications p
       where p.content_id = new.content_id and p.status not in ('published', 'cancelled')
     ) then
    update public.content_items
    set status = 'published',
        status_changed_at = now(),
        published_at = coalesce(published_at, new.published_at)
    where id = new.content_id and status <> 'published';
  end if;
  return null;
end;
$$;

create trigger content_publications_sync_published
  after update of status on public.content_publications
  for each row execute function private.sync_content_published();

-- ---------------------------------------------------------------------------
-- Task integrity
-- ---------------------------------------------------------------------------
create or replace function private.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed text[] := array['status', 'started_at', 'completed_at', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if not private.is_privileged_context() then
      new.created_by := auth.uid();
    end if;
    if new.client_id is null then
      new.client_id := private.resolve_client_for(new.content_id, new.shooting_id, new.project_id);
    end if;
  elsif not private.is_privileged_context() and not private.can_manage_task(old.id) then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'Assignees can only change task status' using errcode = '42501';
    end if;
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' and new.due_at is distinct from old.due_at then
    new.overdue_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_10_before_write
  before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

create or replace function private.checklist_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_done and (tg_op = 'INSERT' or not old.is_done) then
    new.done_by := auth.uid();
    new.done_at := now();
  elsif not new.is_done then
    new.done_by := null;
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger task_checklist_items_10_before_write
  before insert or update on public.task_checklist_items
  for each row execute function private.checklist_before_write();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_shootings after insert or update or delete on public.shootings
  for each row execute function private.audit_row();
create trigger audit_shooting_members after insert or delete on public.shooting_members
  for each row execute function private.audit_row('shooting_id', 'user_id');
create trigger audit_content_items after insert or update or delete on public.content_items
  for each row execute function private.audit_row();
create trigger audit_content_assignments after insert or delete on public.content_assignments
  for each row execute function private.audit_row('content_id', 'user_id', 'role');
create trigger audit_content_publications after insert or update or delete on public.content_publications
  for each row execute function private.audit_row();
create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function private.audit_row();
create trigger audit_task_assignments after insert or delete on public.task_assignments
  for each row execute function private.audit_row('task_id', 'user_id');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.shootings enable row level security;
alter table public.shooting_members enable row level security;
alter table public.content_counters enable row level security;
alter table public.content_items enable row level security;
alter table public.content_assignments enable row level security;
alter table public.content_publications enable row level security;
alter table public.content_status_history enable row level security;
alter table public.content_comments enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_checklist_items enable row level security;

revoke all on public.content_counters from authenticated;

-- shootings
create policy "read shootings" on public.shootings
  for select to authenticated using (
    (
      (select private.is_staff())
      and (
        (select private.sees_all_clients())
        or client_id = any ((select private.staff_client_ids())::uuid[])
        or id = any ((select private.my_shooting_ids())::uuid[])
      )
      and (deleted_at is null or (select private.has_permission('shootings.manage')))
    )
    or (client_id = any ((select private.member_client_ids())::uuid[]) and deleted_at is null)
  );
create policy "create shootings" on public.shootings
  for insert to authenticated with check (private.can_manage_client(client_id, 'shootings.manage'));
create policy "update shootings" on public.shootings
  for update to authenticated
  using (private.can_manage_client(client_id, 'shootings.manage'))
  with check (private.can_manage_client(client_id, 'shootings.manage'));

-- shooting_members: visible with the shooting (clients see who is coming)
create policy "read shooting members" on public.shooting_members
  for select to authenticated using (
    exists (select 1 from public.shootings s where s.id = shooting_id)
  );
create policy "add shooting members" on public.shooting_members
  for insert to authenticated with check (exists (
    select 1 from public.shootings s
    where s.id = shooting_id and private.can_manage_client(s.client_id, 'shootings.manage')
  ));
create policy "remove shooting members" on public.shooting_members
  for delete to authenticated using (exists (
    select 1 from public.shootings s
    where s.id = shooting_id and private.can_manage_client(s.client_id, 'shootings.manage')
  ));

-- content_items
create policy "read content" on public.content_items
  for select to authenticated using (
    (
      (select private.is_staff())
      and (
        (select private.sees_all_clients())
        or client_id = any ((select private.staff_client_ids())::uuid[])
        or id = any ((select private.assigned_content_ids())::uuid[])
      )
      and (deleted_at is null or (select private.has_permission('content.manage')))
    )
    or (
      client_id = any ((select private.member_client_ids())::uuid[])
      and is_client_visible
      and deleted_at is null
      and status <> 'cancelled'
    )
  );
create policy "create content" on public.content_items
  for insert to authenticated with check (private.can_manage_client(client_id, 'content.manage'));
create policy "update content" on public.content_items
  for update to authenticated
  using (
    private.can_manage_client(client_id, 'content.manage')
    or (
      (select private.has_permission('content.edit_copy'))
      and id = any ((select private.assigned_content_ids())::uuid[])
    )
  )
  with check (
    private.can_manage_client(client_id, 'content.manage')
    or (
      (select private.has_permission('content.edit_copy'))
      and id = any ((select private.assigned_content_ids())::uuid[])
    )
  );

-- content_assignments: visible with the content
create policy "read content assignments" on public.content_assignments
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
  );
create policy "assign content" on public.content_assignments
  for insert to authenticated with check (private.can_manage_content(content_id));
create policy "unassign content" on public.content_assignments
  for delete to authenticated using (private.can_manage_content(content_id));

-- content_publications
create policy "read publications" on public.content_publications
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
  );
create policy "create publications" on public.content_publications
  for insert to authenticated with check (
    private.can_manage_client(client_id, 'publications.manage')
    or private.can_manage_client(client_id, 'content.manage')
  );
create policy "update publications" on public.content_publications
  for update to authenticated
  using (
    private.can_manage_client(client_id, 'publications.manage')
    or private.can_manage_client(client_id, 'content.manage')
  )
  with check (
    private.can_manage_client(client_id, 'publications.manage')
    or private.can_manage_client(client_id, 'content.manage')
  );
create policy "delete publications" on public.content_publications
  for delete to authenticated using (
    private.can_manage_client(client_id, 'publications.manage')
    or private.can_manage_client(client_id, 'content.manage')
  );

-- content_status_history: staff only, written by trigger
create policy "staff read status history" on public.content_status_history
  for select to authenticated using (
    (select private.is_staff())
    and exists (select 1 from public.content_items c where c.id = content_id)
  );
revoke insert, update, delete on public.content_status_history from authenticated;

-- content_comments: clients see and write only client-visible comments
create policy "read comments" on public.content_comments
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
    and (
      (select private.is_staff())
      or (visibility = 'client' and deleted_at is null)
    )
  );
create policy "write comments" on public.content_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.content_items c where c.id = content_id)
    and ((select private.is_staff()) or visibility = 'client')
  );
create policy "edit own comments" on public.content_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
revoke update on public.content_comments from authenticated;
grant update (body, deleted_at) on public.content_comments to authenticated;

-- tasks: internal only
create policy "read tasks" on public.tasks
  for select to authenticated using (
    (select private.is_staff())
    and (deleted_at is null or (select private.has_permission('tasks.manage')))
    and (
      (select private.has_permission('tasks.read_all'))
      or id = any ((select private.my_task_ids())::uuid[])
      or created_by = (select auth.uid())
      or (
        (select private.has_permission('tasks.manage'))
        and client_id = any ((select private.staff_client_ids())::uuid[])
      )
    )
  );
create policy "create tasks" on public.tasks
  for insert to authenticated with check (
    (select private.has_permission('tasks.manage'))
    and (client_id is null or private.can_manage_client(client_id, 'tasks.manage'))
  );
create policy "update tasks" on public.tasks
  for update to authenticated
  using (private.can_manage_task(id) or id = any ((select private.my_task_ids())::uuid[]))
  with check (private.can_manage_task(id) or id = any ((select private.my_task_ids())::uuid[]));

create policy "read task assignments" on public.task_assignments
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id)
  );
create policy "assign tasks" on public.task_assignments
  for insert to authenticated with check (private.can_manage_task(task_id));
create policy "unassign tasks" on public.task_assignments
  for delete to authenticated using (private.can_manage_task(task_id));

create policy "read checklist" on public.task_checklist_items
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id)
  );
create policy "add checklist items" on public.task_checklist_items
  for insert to authenticated with check (
    private.can_manage_task(task_id) or task_id = any ((select private.my_task_ids())::uuid[])
  );
create policy "update checklist items" on public.task_checklist_items
  for update to authenticated
  using (private.can_manage_task(task_id) or task_id = any ((select private.my_task_ids())::uuid[]))
  with check (private.can_manage_task(task_id) or task_id = any ((select private.my_task_ids())::uuid[]));
create policy "delete checklist items" on public.task_checklist_items
  for delete to authenticated using (private.can_manage_task(task_id));
