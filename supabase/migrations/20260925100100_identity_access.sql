-- SUN MEDIA — identity & access: profiles, RBAC, employees, clients, teams, projects, audit log.

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text,
  phone text check (phone is null or char_length(phone) <= 32),
  avatar_url text,
  locale text not null default 'uz' check (locale in ('uz', 'ru', 'en')),
  status public.account_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index profiles_full_name_trgm on public.profiles using gin (full_name extensions.gin_trgm_ops);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 120),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_auth_user_email();

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  scope public.user_kind not null,
  -- Lower rank = more authority. Nobody can grant a role ranked above their own best role.
  rank integer not null default 100 check (rank >= 0),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger roles_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

create table public.permissions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  module text not null,
  name text not null,
  description text,
  scope public.user_kind not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create index role_permissions_permission_idx on public.role_permissions (permission_key);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_role_idx on public.user_roles (role_id);

-- Extra permissions granted to a single staff member on top of their roles.
create table public.user_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table public.employees (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  employee_code text unique,
  job_title text check (char_length(job_title) <= 120),
  department text check (char_length(department) <= 80),
  employment_type public.employment_type not null default 'full_time',
  status public.employee_status not null default 'active',
  hired_on date,
  terminated_on date,
  work_start_time time not null default '09:00',
  work_end_time time not null default '18:00',
  -- ISO weekday numbers (1 = Monday … 7 = Sunday)
  work_days smallint[] not null default '{1,2,3,4,5,6}'
    check (work_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (terminated_on is null or hired_on is null or terminated_on >= hired_on),
  check (work_end_time > work_start_time)
);

create trigger employees_updated_at
  before update on public.employees
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Clients (companies SUN MEDIA works for)
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  legal_name text check (char_length(legal_name) <= 200),
  -- Short code used in content numbering, e.g. "SAFI" → "SAFI Reel #41"
  code text not null unique check (code ~ '^[A-Z0-9]{2,12}$'),
  industry text,
  description text,
  logo_url text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  website text,
  address text,
  timezone text not null default 'Asia/Tashkent',
  status public.client_status not null default 'active',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clients_status_idx on public.clients (status) where deleted_at is null;

create trigger clients_updated_at
  before update on public.clients
  for each row execute function private.set_updated_at();

create table public.client_members (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  title text check (char_length(title) <= 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create index client_members_user_idx on public.client_members (user_id);

create trigger client_members_updated_at
  before update on public.client_members
  for each row execute function private.set_updated_at();

-- Contact persons at the client company (not necessarily app users).
create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  position text,
  phone text,
  email text,
  telegram text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index client_contacts_client_idx on public.client_contacts (client_id) where deleted_at is null;

create trigger client_contacts_updated_at
  before update on public.client_contacts
  for each row execute function private.set_updated_at();

-- The SUN MEDIA team assigned to a client (Account Manager, Operator, Editor, …).
create table public.client_team_members (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role public.team_role not null,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id, team_role)
);

create index client_team_members_user_idx on public.client_team_members (user_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  kind public.project_kind not null default 'retainer',
  status public.project_status not null default 'active',
  starts_on date,
  ends_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, client_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index projects_client_idx on public.projects (client_id) where deleted_at is null;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function private.set_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role public.team_role not null,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id, team_role)
);

create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer, used by RLS policies)
-- Policies wrap them as `(select private.fn())` so Postgres evaluates them once per statement.
-- ---------------------------------------------------------------------------
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active' and deleted_at is null
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid()) and r.scope = 'staff'
  );
$$;

create or replace function private.user_is_staff(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user and r.scope = 'staff'
  );
$$;

create or replace function private.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid()) and r.key = p_role
  );
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.scope = 'staff'
        and (
          r.key = 'owner'
          or exists (
            select 1 from public.role_permissions rp
            where rp.role_id = ur.role_id and rp.permission_key = p_permission
          )
        )
    )
    or exists (
      select 1 from public.user_permissions up
      where up.user_id = (select auth.uid()) and up.permission_key = p_permission
    )
  );
$$;

-- Clients the current user belongs to as a client user (disabled/archived clients excluded).
create or replace function private.member_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cm.client_id), '{}')
  from public.client_members cm
  join public.clients c on c.id = cm.client_id
  where cm.user_id = (select auth.uid())
    and c.status in ('active', 'paused')
    and c.deleted_at is null
    and private.is_active_user();
$$;

-- Staff with clients.read_all see every client; policies test that flag separately
-- (see private.sees_all_clients) so freshly inserted rows are never hidden from them.
create or replace function private.sees_all_clients()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and private.has_permission('clients.read_all');
$$;

-- Clients a staff member is explicitly assigned to (client team or project member).
create or replace function private.staff_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_staff() then '{}'::uuid[]
    else
      (select coalesce(array_agg(distinct s.client_id), '{}')
       from (
         select ctm.client_id from public.client_team_members ctm where ctm.user_id = (select auth.uid())
         union all
         select p.client_id
         from public.project_members pm
         join public.projects p on p.id = pm.project_id
         where pm.user_id = (select auth.uid()) and p.deleted_at is null
       ) s)
  end;
$$;

create or replace function private.accessible_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_client_ids() || private.member_client_ids();
$$;

create or replace function private.has_client_permission(p_client uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_client = any (private.member_client_ids()) and exists (
    select 1
    from public.client_members cm
    join public.role_permissions rp on rp.role_id = cm.role_id
    where cm.client_id = p_client
      and cm.user_id = (select auth.uid())
      and rp.permission_key = p_permission
  );
$$;

-- Staff permission that is scoped to clients: managers act only on clients they are assigned to,
-- unless they also hold clients.read_all.
create or replace function private.can_manage_client(p_client uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_permission)
    and (private.sees_all_clients() or p_client = any (private.staff_client_ids()));
$$;

-- Profiles a client user may see: people in their company and the SUN MEDIA team assigned to it.
-- Extended in later migrations with content and shooting assignees.
create or replace function private.client_visible_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct s.user_id), '{}')
  from (
    select cm.user_id from public.client_members cm
    where cm.client_id = any (private.member_client_ids())
    union all
    select ctm.user_id from public.client_team_members ctm
    where ctm.client_id = any (private.member_client_ids())
  ) s;
$$;

create or replace function private.current_role_keys()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.key), '{}')
  from (
    select role_id from public.user_roles where user_id = (select auth.uid())
    union all
    select role_id from public.client_members where user_id = (select auth.uid())
  ) x
  join public.roles r on r.id = x.role_id;
$$;

-- Best (lowest) staff role rank held by the current user; 1000 when none.
create or replace function private.current_best_rank()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(min(r.rank), 1000)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid()) and r.scope = 'staff';
$$;

grant execute on function
  private.is_active_user(),
  private.is_staff(),
  private.user_is_staff(uuid),
  private.has_role(text),
  private.has_permission(text),
  private.member_client_ids(),
  private.sees_all_clients(),
  private.staff_client_ids(),
  private.accessible_client_ids(),
  private.has_client_permission(uuid, text),
  private.can_manage_client(uuid, text),
  private.client_visible_profile_ids(),
  private.current_role_keys(),
  private.current_best_rank()
to authenticated;

-- Lookups used by invoker guard triggers (they must not depend on the caller's RLS).
create or replace function private.role_meta(p_role uuid)
returns table (key text, scope public.user_kind, rank integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.key, r.scope, r.rank from public.roles r where r.id = p_role;
$$;

create or replace function private.user_is_client_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_members where user_id = p_user);
$$;

create or replace function private.other_role_holders_exist(p_role uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles where role_id = p_role and user_id <> p_user);
$$;

grant execute on function
  private.role_meta(uuid),
  private.user_is_client_user(uuid),
  private.other_role_holders_exist(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity guards
-- Guards that distinguish direct user writes from RPC/service writes are SECURITY INVOKER:
-- inside a security-definer RPC current_user is the owner, so private.is_privileged_context() is true.
-- ---------------------------------------------------------------------------

-- A person is either SUN MEDIA staff or a client user, never both.
create or replace function private.guard_user_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role record;
begin
  select * into v_role from private.role_meta(new.role_id);
  if v_role.scope <> 'staff' then
    raise exception 'Client roles are assigned through client_members' using errcode = '22023';
  end if;
  if private.user_is_client_user(new.user_id) then
    raise exception 'User already belongs to a client and cannot hold a staff role' using errcode = '22023';
  end if;
  if not private.is_privileged_context() and v_role.rank < private.current_best_rank() then
    raise exception 'Cannot assign a role above your own' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger user_roles_guard
  before insert or update on public.user_roles
  for each row execute function private.guard_user_roles();

create or replace function private.guard_user_roles_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role record;
begin
  select * into v_role from private.role_meta(old.role_id);
  if v_role.key = 'owner' and not private.other_role_holders_exist(old.role_id, old.user_id) then
    raise exception 'The last owner cannot be removed' using errcode = '42501';
  end if;
  if not private.is_privileged_context() and v_role.rank < private.current_best_rank() then
    raise exception 'Cannot remove a role above your own' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger user_roles_guard_delete
  before delete on public.user_roles
  for each row execute function private.guard_user_roles_delete();

create or replace function private.guard_client_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select scope from public.roles where id = new.role_id) <> 'client' then
    raise exception 'client_members accepts client roles only' using errcode = '22023';
  end if;
  if private.user_is_staff(new.user_id) then
    raise exception 'Staff members cannot be client users' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger client_members_guard
  before insert or update on public.client_members
  for each row execute function private.guard_client_members();

create or replace function private.guard_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.user_is_staff(new.user_id) then
    raise exception 'Only SUN MEDIA staff can be assigned here' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger client_team_members_staff_only
  before insert or update on public.client_team_members
  for each row execute function private.guard_staff_assignment();

create trigger project_members_staff_only
  before insert or update on public.project_members
  for each row execute function private.guard_staff_assignment();

create trigger employees_staff_only
  before insert or update on public.employees
  for each row execute function private.guard_staff_assignment();

-- Permission edits cannot escalate: you can only grant what you hold, and system owner role is fixed.
create or replace function private.guard_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role record;
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  select * into v_role from private.role_meta(coalesce(new.role_id, old.role_id));
  if private.is_privileged_context() then
    return coalesce(new, old);
  end if;
  if v_role.key = 'owner' then
    raise exception 'Owner permissions are fixed' using errcode = '42501';
  end if;
  if v_role.rank < private.current_best_rank() then
    raise exception 'Cannot edit a role above your own' using errcode = '42501';
  end if;
  if v_role.scope = 'staff' and not private.has_permission(v_key) then
    raise exception 'Cannot grant a permission you do not hold' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger role_permissions_guard
  before insert or delete on public.role_permissions
  for each row execute function private.guard_role_permissions();

create or replace function private.guard_user_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_context() then
    return coalesce(new, old);
  end if;
  if not private.has_permission(coalesce(new.permission_key, old.permission_key)) then
    raise exception 'Cannot grant a permission you do not hold' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not private.user_is_staff(new.user_id) then
    raise exception 'Extra permissions are for staff only' using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger user_permissions_guard
  before insert or delete on public.user_permissions
  for each row execute function private.guard_user_permissions();

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_roles text[] not null default '{}',
  action text not null,
  entity_type text not null,
  entity_id text,
  client_id uuid references public.clients (id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'
);

create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_client_idx on public.audit_logs (client_id, occurred_at desc);

-- Generic row audit. Trigger args: primary-key column names (default "id").
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_old_diff jsonb := '{}';
  v_new_diff jsonb := '{}';
  v_key text;
  v_entity_id text;
  v_client uuid;
  v_pk text[] := case when tg_nargs > 0 then tg_argv::text[] else array['id'] end;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_new_diff = '{}'::jsonb then
      return null;
    end if;
    v_old := v_old_diff;
    v_new := v_new_diff;
  end if;

  select string_agg(v_row ->> c, ':') into v_entity_id from unnest(v_pk) c;
  v_client := case
    when tg_table_name = 'clients' then (v_row ->> 'id')::uuid
    else (v_row ->> 'client_id')::uuid
  end;

  insert into public.audit_logs (actor_id, actor_roles, action, entity_type, entity_id, client_id, old_values, new_values)
  values (
    auth.uid(),
    private.current_role_keys(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when exists (select 1 from public.clients where id = v_client) then v_client end,
    v_old,
    v_new
  );
  return null;
end;
$$;

-- Explicit, semantic audit entries written by RPCs (e.g. "content.approved").
create or replace function private.audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_client uuid default null,
  p_old jsonb default null,
  p_new jsonb default null,
  p_metadata jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, actor_roles, action, entity_type, entity_id, client_id, old_values, new_values, metadata)
  values (auth.uid(), private.current_role_keys(), p_action, p_entity_type, p_entity_id, p_client, p_old, p_new, coalesce(p_metadata, '{}'));
$$;

create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function private.audit_row();
create trigger audit_client_members after insert or update or delete on public.client_members
  for each row execute function private.audit_row('client_id', 'user_id');
create trigger audit_client_team_members after insert or update or delete on public.client_team_members
  for each row execute function private.audit_row('client_id', 'user_id', 'team_role');
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function private.audit_row('user_id');
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function private.audit_row('user_id', 'role_id');
create trigger audit_user_permissions after insert or delete on public.user_permissions
  for each row execute function private.audit_row('user_id', 'permission_key');
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function private.audit_row();
create trigger audit_role_permissions after insert or delete on public.role_permissions
  for each row execute function private.audit_row('role_id', 'permission_key');
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function private.audit_row();
create trigger audit_project_members after insert or delete on public.project_members
  for each row execute function private.audit_row('project_id', 'user_id', 'team_role');
create trigger audit_profiles_status after update of status on public.profiles
  for each row execute function private.audit_row();
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function private.audit_row('key');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.client_contacts enable row level security;
alter table public.client_team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.audit_logs enable row level security;

-- app_settings
create policy "staff read settings" on public.app_settings
  for select to authenticated using ((select private.is_staff()));
create policy "settings managers insert" on public.app_settings
  for insert to authenticated with check ((select private.has_permission('settings.manage')));
create policy "settings managers update" on public.app_settings
  for update to authenticated
  using ((select private.has_permission('settings.manage')))
  with check ((select private.has_permission('settings.manage')));

-- profiles
create policy "read own, staff read all, clients read their circle" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or (select private.is_staff())
    or id = any ((select private.client_visible_profile_ids())::uuid[])
  );
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, locale, last_seen_at) on public.profiles to authenticated;

-- roles / permissions: readable by any signed-in user (needed to render role-based UI)
create policy "read roles" on public.roles
  for select to authenticated using ((select private.is_active_user()));
create policy "manage roles" on public.roles
  for insert to authenticated
  with check ((select private.has_permission('roles.manage')) and not is_system and rank >= (select private.current_best_rank()));
create policy "update roles" on public.roles
  for update to authenticated
  using ((select private.has_permission('roles.manage')) and not is_system and rank >= (select private.current_best_rank()))
  with check (not is_system and rank >= (select private.current_best_rank()));
create policy "delete roles" on public.roles
  for delete to authenticated
  using ((select private.has_permission('roles.manage')) and not is_system);

create policy "read permissions" on public.permissions
  for select to authenticated using ((select private.is_active_user()));
revoke insert, update, delete on public.permissions from authenticated;

create policy "read role permissions" on public.role_permissions
  for select to authenticated using ((select private.is_active_user()));
create policy "manage role permissions" on public.role_permissions
  for insert to authenticated with check ((select private.has_permission('roles.manage')));
create policy "remove role permissions" on public.role_permissions
  for delete to authenticated using ((select private.has_permission('roles.manage')));

-- user_roles
create policy "read own roles or manage" on public.user_roles
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.is_staff())
  );
create policy "assign roles" on public.user_roles
  for insert to authenticated with check ((select private.has_permission('roles.manage')));
create policy "remove roles" on public.user_roles
  for delete to authenticated using ((select private.has_permission('roles.manage')));

-- user_permissions
create policy "read own extra permissions or manage" on public.user_permissions
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.has_permission('roles.manage'))
  );
create policy "grant extra permissions" on public.user_permissions
  for insert to authenticated with check ((select private.has_permission('roles.manage')));
create policy "revoke extra permissions" on public.user_permissions
  for delete to authenticated using ((select private.has_permission('roles.manage')));

-- employees
create policy "staff read employees" on public.employees
  for select to authenticated using ((select private.is_staff()));
create policy "hr adds employees" on public.employees
  for insert to authenticated with check ((select private.has_permission('employees.manage')));
create policy "hr updates employees" on public.employees
  for update to authenticated
  using ((select private.has_permission('employees.manage')))
  with check ((select private.has_permission('employees.manage')));

-- clients
create policy "read accessible clients" on public.clients
  for select to authenticated using (
    (select private.sees_all_clients())
    or (id = any ((select private.accessible_client_ids())::uuid[]) and deleted_at is null)
  );
create policy "create clients" on public.clients
  for insert to authenticated
  with check ((select private.has_permission('clients.manage')) and (select private.sees_all_clients()));
create policy "update clients" on public.clients
  for update to authenticated
  using (private.can_manage_client(id, 'clients.manage'))
  with check (private.can_manage_client(id, 'clients.manage'));

-- client_members
create policy "read client members" on public.client_members
  for select to authenticated using (
    (select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[])
  );
create policy "add client members" on public.client_members
  for insert to authenticated with check (private.can_manage_client(client_id, 'clients.manage'));
create policy "update client members" on public.client_members
  for update to authenticated
  using (private.can_manage_client(client_id, 'clients.manage'))
  with check (private.can_manage_client(client_id, 'clients.manage'));
create policy "remove client members" on public.client_members
  for delete to authenticated using (private.can_manage_client(client_id, 'clients.manage'));

-- client_contacts
create policy "read client contacts" on public.client_contacts
  for select to authenticated using (
    ((select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[]))
    and deleted_at is null
  );
create policy "add client contacts" on public.client_contacts
  for insert to authenticated with check (private.can_manage_client(client_id, 'clients.manage'));
create policy "update client contacts" on public.client_contacts
  for update to authenticated
  using (private.can_manage_client(client_id, 'clients.manage'))
  with check (private.can_manage_client(client_id, 'clients.manage'));

-- client_team_members
create policy "read client team" on public.client_team_members
  for select to authenticated using (
    (select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[])
  );
create policy "assign client team" on public.client_team_members
  for insert to authenticated with check (private.can_manage_client(client_id, 'clients.manage'));
create policy "unassign client team" on public.client_team_members
  for delete to authenticated using (private.can_manage_client(client_id, 'clients.manage'));

-- projects
create policy "read projects" on public.projects
  for select to authenticated using (
    ((select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[]))
    and (deleted_at is null or (select private.has_permission('projects.manage')))
  );
create policy "create projects" on public.projects
  for insert to authenticated
  with check (private.can_manage_client(client_id, 'projects.manage'));
create policy "update projects" on public.projects
  for update to authenticated
  using (private.can_manage_client(client_id, 'projects.manage'))
  with check (private.can_manage_client(client_id, 'projects.manage'));

-- project_members
create policy "staff read project members" on public.project_members
  for select to authenticated using (
    (select private.sees_all_clients())
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.client_id = any ((select private.staff_client_ids())::uuid[])
    )
  );
create policy "add project members" on public.project_members
  for insert to authenticated with check (exists (
    select 1 from public.projects p
    where p.id = project_id and private.can_manage_client(p.client_id, 'projects.manage')
  ));
create policy "remove project members" on public.project_members
  for delete to authenticated using (exists (
    select 1 from public.projects p
    where p.id = project_id and private.can_manage_client(p.client_id, 'projects.manage')
  ));

-- audit_logs: read-only, written by triggers and RPCs
create policy "read audit log" on public.audit_logs
  for select to authenticated using ((select private.has_permission('audit.read')));
revoke insert, update, delete on public.audit_logs from authenticated;
