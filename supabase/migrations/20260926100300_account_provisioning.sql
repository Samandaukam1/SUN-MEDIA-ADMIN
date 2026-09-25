-- SUN MEDIA — account provisioning from the Admin Panel.
--
-- Flow (apps/admin server action, never the browser):
--   1. The Next.js server verifies the caller's session.
--   2. auth.admin.createUser() with the service role creates the login (the only service-role step).
--   3. provision_staff_member / provision_client_user run with the CALLER's session: every permission,
--      rank and client-scope rule is enforced here in the database, and the whole setup is atomic.
--      If it fails, the server deletes the just-created auth user (compensation).
-- Temporary passwords are generated server-side, shown once and never stored in public tables.

-- ---------------------------------------------------------------------------
-- Profile fields used by account management
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists first_name text check (first_name is null or char_length(first_name) between 1 and 60),
  add column if not exists last_name text check (last_name is null or char_length(last_name) between 1 and 60),
  add column if not exists status_reason text check (status_reason is null or char_length(status_reason) <= 300),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles (id) on delete set null,
  add column if not exists provisioned_by uuid references public.profiles (id) on delete set null,
  add column if not exists password_reset_at timestamptz;

-- ---------------------------------------------------------------------------
-- Per-member client permissions (e.g. a client employee allowed to approve)
-- ---------------------------------------------------------------------------
create table if not exists public.client_member_permissions (
  client_id uuid not null,
  user_id uuid not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id, permission_key),
  foreign key (client_id, user_id) references public.client_members (client_id, user_id) on delete cascade
);

create index if not exists client_member_permissions_user_idx on public.client_member_permissions (user_id);

alter table public.client_member_permissions enable row level security;

create policy "read client member permissions" on public.client_member_permissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_manage_client(client_id, 'clients.manage'))
  );

-- Writes go through provision_client_user / set_client_member_permissions only.
revoke insert, update, delete on public.client_member_permissions from authenticated;

create or replace function private.guard_client_member_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select scope from public.permissions where key = new.permission_key) <> 'client' then
    raise exception 'Only client permissions can be granted to client users' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger client_member_permissions_guard
  before insert or update on public.client_member_permissions
  for each row execute function private.guard_client_member_permission();

create trigger audit_client_member_permissions after insert or delete on public.client_member_permissions
  for each row execute function private.audit_row('client_id', 'user_id', 'permission_key');

-- Client permission = role permission OR an explicit grant for this member.
create or replace function private.has_client_permission(p_client uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_client = any (private.member_client_ids()) and (
    exists (
      select 1
      from public.client_members cm
      join public.role_permissions rp on rp.role_id = cm.role_id
      where cm.client_id = p_client and cm.user_id = (select auth.uid()) and rp.permission_key = p_permission
    )
    or exists (
      select 1 from public.client_member_permissions cmp
      where cmp.client_id = p_client and cmp.user_id = (select auth.uid()) and cmp.permission_key = p_permission
    )
  );
$$;

create or replace function private.client_users_with_permission(p_client uuid, p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct cm.user_id), '{}')
  from public.client_members cm
  join public.clients c on c.id = cm.client_id and c.status in ('active', 'paused') and c.deleted_at is null
  join public.profiles p on p.id = cm.user_id and p.status = 'active' and p.deleted_at is null
  where cm.client_id = p_client
    and (
      exists (select 1 from public.role_permissions rp where rp.role_id = cm.role_id and rp.permission_key = p_permission)
      or exists (select 1 from public.client_member_permissions x
                 where x.client_id = cm.client_id and x.user_id = cm.user_id and x.permission_key = p_permission)
    );
$$;

-- Session context: client permissions include member-level grants.
create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_staff boolean;
  v_clients jsonb;
  v_permissions text[];
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  -- Disabled and suspended accounts get the same closed door (the app shows the blocked screen).
  if not found or v_profile.status <> 'active' or v_profile.deleted_at is not null then
    return jsonb_build_object('status', 'disabled');
  end if;

  v_staff := private.is_staff();

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'code', c.code, 'logo_url', c.logo_url,
           'role', r.key, 'role_name', r.name,
           'permissions', (
             select coalesce(jsonb_agg(k order by k), '[]')
             from (
               select rp.permission_key as k from public.role_permissions rp where rp.role_id = cm.role_id
               union
               select cmp.permission_key from public.client_member_permissions cmp
               where cmp.client_id = cm.client_id and cmp.user_id = cm.user_id
             ) perms
           )
         ) order by c.name), '[]')
  into v_clients
  from public.client_members cm
  join public.clients c on c.id = cm.client_id and c.status in ('active', 'paused') and c.deleted_at is null
  join public.roles r on r.id = cm.role_id
  where cm.user_id = v_uid;

  if v_staff then
    select coalesce(array_agg(p.key order by p.key), '{}') into v_permissions
    from public.permissions p
    where p.scope = 'staff' and private.has_permission(p.key);
  else
    v_permissions := '{}';
  end if;

  return jsonb_build_object(
    'status', case
      when v_staff then 'active'
      when jsonb_array_length(v_clients) > 0 then 'active'
      else 'pending'
    end,
    'kind', case when v_staff then 'staff' when jsonb_array_length(v_clients) > 0 then 'client' end,
    'interface', case
      when v_staff and private.has_permission('dashboard.view') then 'management'
      when v_staff then 'employee'
      when jsonb_array_length(v_clients) > 0 then 'client'
    end,
    'profile', jsonb_build_object(
      'id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_profile.email,
      'phone', v_profile.phone, 'avatar_url', v_profile.avatar_url, 'locale', v_profile.locale
    ),
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name) order by r.rank), '[]')
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = v_uid
    ),
    'employee', (
      select jsonb_build_object('job_title', e.job_title, 'department', e.department, 'status', e.status)
      from public.employees e where e.user_id = v_uid
    ),
    'permissions', to_jsonb(v_permissions),
    'clients', v_clients
  );
end;
$$;

grant execute on function public.get_my_context() to authenticated;

-- ---------------------------------------------------------------------------
-- Authorization helpers for account management
-- ---------------------------------------------------------------------------
-- Best (lowest) staff rank of any user; 1000 when the user holds no staff role.
create or replace function private.user_best_rank(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(min(r.rank), 1000)
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user and r.scope = 'staff';
$$;

-- May the caller manage this account (status, password reset, profile)?
--   staff targets: employees.manage and the target is not above the caller;
--   client users: clients.manage on at least one of the target's clients.
create or replace function private.can_manage_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and p_user is distinct from (select auth.uid()) and (
    case
      when private.user_is_staff(p_user) or exists (select 1 from public.employees e where e.user_id = p_user) then
        private.has_permission('employees.manage')
        and private.user_best_rank(p_user) >= private.current_best_rank()
      when private.user_is_client_user(p_user) then
        exists (
          select 1 from public.client_members cm
          where cm.user_id = p_user and private.can_manage_client(cm.client_id, 'clients.manage')
        )
      else false
    end
  );
$$;

grant execute on function private.user_best_rank(uuid), private.can_manage_account(uuid) to authenticated;

-- A just-created login with no role, employee record or client membership.
create or replace function private.assert_fresh_account(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user and u.created_at > now() - interval '15 minutes') then
    raise exception 'Account is not a freshly created login' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user)
     or exists (select 1 from public.employees where user_id = p_user)
     or exists (select 1 from public.client_members where user_id = p_user) then
    raise exception 'Account is already provisioned' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.clean_name(p_value text, p_label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
begin
  if v is null or char_length(v) > 60 then
    raise exception '% is required (1–60 characters)', p_label using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function private.clean_phone(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(regexp_replace(coalesce(p_value, ''), '[^0-9+]', '', 'g'), '');
begin
  if v is not null and v !~ '^\+?[0-9]{7,15}$' then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provision a SUN MEDIA employee (called with the admin's own session)
-- ---------------------------------------------------------------------------
create or replace function public.provision_staff_member(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_role_key text,
  p_job_title text default null,
  p_phone text default null,
  p_department text default null,
  p_employment_type public.employment_type default 'full_time',
  p_permissions text[] default '{}',
  p_client_ids uuid[] default '{}',
  p_team_role public.team_role default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.roles;
  v_first text := private.clean_name(p_first_name, 'First name');
  v_last text := private.clean_name(p_last_name, 'Last name');
  v_team_role public.team_role;
  v_client uuid;
  v_perm text;
begin
  if not (private.is_staff() and private.has_permission('employees.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_role from public.roles where key = p_role_key;
  if not found or v_role.scope <> 'staff' then
    raise exception 'Choose a SUN MEDIA staff role' using errcode = '22023';
  end if;
  if v_role.rank < private.current_best_rank() then
    raise exception 'Cannot assign a role above your own' using errcode = '42501';
  end if;

  perform private.assert_fresh_account(p_user_id);

  foreach v_perm in array coalesce(p_permissions, '{}') loop
    if not exists (select 1 from public.permissions where key = v_perm and scope = 'staff') then
      raise exception 'Unknown staff permission' using errcode = '22023';
    end if;
    -- Nobody hands out a permission they do not hold themselves.
    if not private.has_permission(v_perm) then
      raise exception 'Cannot grant a permission you do not have' using errcode = '42501';
    end if;
  end loop;

  foreach v_client in array coalesce(p_client_ids, '{}') loop
    if not private.can_manage_client(v_client, 'clients.manage') then
      raise exception 'Not allowed to assign this client' using errcode = '42501';
    end if;
  end loop;

  update public.profiles
  set first_name = v_first,
      last_name = v_last,
      full_name = v_first || ' ' || v_last,
      phone = private.clean_phone(p_phone),
      status = 'active',
      provisioned_by = v_caller
  where id = p_user_id;

  -- The role comes first: employee records and client teams accept staff only.
  insert into public.user_roles (user_id, role_id) values (p_user_id, v_role.id);

  insert into public.employees (user_id, job_title, department, employment_type)
  values (p_user_id, nullif(btrim(coalesce(p_job_title, '')), ''), nullif(btrim(coalesce(p_department, '')), ''), p_employment_type);

  insert into public.user_permissions (user_id, permission_key, granted_by)
  select p_user_id, x, v_caller from unnest(coalesce(p_permissions, '{}')) x
  on conflict do nothing;

  v_team_role := coalesce(p_team_role, case v_role.key
    when 'project_manager' then 'project_manager'
    when 'smm_manager' then 'smm_manager'
    when 'operator' then 'operator'
    when 'editor' then 'editor'
    when 'designer' then 'designer'
    when 'copywriter' then 'copywriter'
    else 'account_manager'
  end::public.team_role);

  insert into public.client_team_members (client_id, user_id, team_role)
  select c, p_user_id, v_team_role from unnest(coalesce(p_client_ids, '{}')) c
  on conflict do nothing;

  perform private.audit_event(
    'account.created', 'profiles', p_user_id::text, null, null,
    jsonb_build_object('kind', 'staff', 'role', v_role.key, 'full_name', v_first || ' ' || v_last,
                       'email', (select email from public.profiles where id = p_user_id),
                       'permissions', coalesce(p_permissions, '{}'), 'clients', coalesce(p_client_ids, '{}'))
  );

  return jsonb_build_object('user_id', p_user_id, 'role', v_role.key, 'full_name', v_first || ' ' || v_last);
end;
$$;

grant execute on function public.provision_staff_member(uuid, text, text, text, text, text, text, public.employment_type, text[], uuid[], public.team_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Provision a client login (client owner or client employee)
-- ---------------------------------------------------------------------------
create or replace function public.provision_client_user(
  p_user_id uuid,
  p_client_id uuid,
  p_role_key text,
  p_first_name text,
  p_last_name text,
  p_phone text default null,
  p_title text default null,
  p_permissions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.roles;
  v_first text := private.clean_name(p_first_name, 'First name');
  v_last text := private.clean_name(p_last_name, 'Last name');
  v_perm text;
begin
  if not (private.is_staff() and private.can_manage_client(p_client_id, 'clients.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and deleted_at is null) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  select * into v_role from public.roles where key = p_role_key;
  if not found or v_role.scope <> 'client' then
    raise exception 'Choose a client role' using errcode = '22023';
  end if;

  perform private.assert_fresh_account(p_user_id);

  foreach v_perm in array coalesce(p_permissions, '{}') loop
    if not exists (select 1 from public.permissions where key = v_perm and scope = 'client') then
      raise exception 'Unknown client permission' using errcode = '22023';
    end if;
  end loop;

  update public.profiles
  set first_name = v_first,
      last_name = v_last,
      full_name = v_first || ' ' || v_last,
      phone = private.clean_phone(p_phone),
      status = 'active',
      provisioned_by = v_caller
  where id = p_user_id;

  insert into public.client_members (client_id, user_id, role_id, title, created_by)
  values (p_client_id, p_user_id, v_role.id, nullif(btrim(coalesce(p_title, '')), ''), v_caller);

  insert into public.client_member_permissions (client_id, user_id, permission_key, granted_by)
  select p_client_id, p_user_id, x, v_caller
  from unnest(coalesce(p_permissions, '{}')) x
  -- Grants that the role already carries are not duplicated.
  where not exists (select 1 from public.role_permissions rp where rp.role_id = v_role.id and rp.permission_key = x)
  on conflict do nothing;

  perform private.audit_event(
    'account.created', 'profiles', p_user_id::text, p_client_id, null,
    jsonb_build_object('kind', 'client', 'role', v_role.key, 'full_name', v_first || ' ' || v_last,
                       'email', (select email from public.profiles where id = p_user_id),
                       'permissions', coalesce(p_permissions, '{}'))
  );

  return jsonb_build_object('user_id', p_user_id, 'role', v_role.key, 'client_id', p_client_id);
end;
$$;

grant execute on function public.provision_client_user(uuid, uuid, text, text, text, text, text, text[]) to authenticated;

-- Change which extra client permissions a member has (e.g. allow a client employee to approve).
create or replace function public.set_client_member_permissions(p_client_id uuid, p_user_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if not (private.is_staff() and private.can_manage_client(p_client_id, 'clients.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select role_id into v_role_id from public.client_members where client_id = p_client_id and user_id = p_user_id;
  if not found then
    raise exception 'Client user not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissions, '{}')) x
             where not exists (select 1 from public.permissions p where p.key = x and p.scope = 'client')) then
    raise exception 'Unknown client permission' using errcode = '22023';
  end if;

  delete from public.client_member_permissions
  where client_id = p_client_id and user_id = p_user_id and not (permission_key = any (coalesce(p_permissions, '{}')));

  insert into public.client_member_permissions (client_id, user_id, permission_key, granted_by)
  select p_client_id, p_user_id, x, auth.uid()
  from unnest(coalesce(p_permissions, '{}')) x
  where not exists (select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.permission_key = x)
  on conflict do nothing;
end;
$$;

grant execute on function public.set_client_member_permissions(uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Account status (Active / Disabled / Suspended)
-- ---------------------------------------------------------------------------
create or replace function public.set_account_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns public.account_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.account_status;
begin
  if not private.can_manage_account(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select status into v_old from public.profiles where id = p_user_id and deleted_at is null for update;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if p_status <> 'active'
     and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = p_user_id and r.key = 'owner')
     and not exists (select 1 from public.user_roles ur
                     join public.roles r on r.id = ur.role_id and r.key = 'owner'
                     join public.profiles p on p.id = ur.user_id and p.status = 'active' and p.deleted_at is null
                     where ur.user_id <> p_user_id) then
    raise exception 'The last active owner cannot be blocked' using errcode = '42501';
  end if;
  if p_status <> 'active' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for blocking the account' using errcode = '22023';
  end if;

  update public.profiles
  set status = p_status,
      status_reason = case when p_status = 'active' then null else btrim(p_reason) end,
      status_changed_at = now(),
      status_changed_by = auth.uid()
  where id = p_user_id;

  perform private.audit_event(
    'account.status_changed', 'profiles', p_user_id::text, null,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status, 'reason', p_reason)
  );
  return v_old;
end;
$$;

grant execute on function public.set_account_status(uuid, public.account_status, text) to authenticated;

-- Authorizes a password reset for the caller and records it; the server then sets the new password.
create or replace function public.authorize_password_reset(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not private.can_manage_account(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = p_user_id and deleted_at is null;
  if v_email is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  update public.profiles set password_reset_at = now() where id = p_user_id;
  perform private.audit_event('account.password_reset', 'profiles', p_user_id::text);
  return v_email;
end;
$$;

grant execute on function public.authorize_password_reset(uuid) to authenticated;

-- Edit an account's personal details (names, phone) — profiles are not writable by others directly.
create or replace function public.update_account_profile(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := private.clean_name(p_first_name, 'First name');
  v_last text := private.clean_name(p_last_name, 'Last name');
begin
  if not (p_user_id = auth.uid() or private.can_manage_account(p_user_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.profiles
  set first_name = v_first, last_name = v_last, full_name = v_first || ' ' || v_last, phone = private.clean_phone(p_phone)
  where id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.update_account_profile(uuid, text, text, text) to authenticated;

-- Backfill split names for existing accounts (best effort; display name stays unchanged).
update public.profiles
set first_name = split_part(full_name, ' ', 1),
    last_name = nullif(btrim(substr(full_name, char_length(split_part(full_name, ' ', 1)) + 1)), '')
where first_name is null and full_name is not null and btrim(full_name) <> '';

-- Suggested login domain for new staff accounts (Admin → Team → Add employee).
insert into public.app_settings (key, value, description)
values ('accounts.login_domain', '"sunmedia.uz"', 'Yangi xodim loginlari uchun email domeni')
on conflict (key) do nothing;
