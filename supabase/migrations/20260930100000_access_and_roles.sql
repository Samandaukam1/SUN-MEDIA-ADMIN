-- SUN MEDIA final access model (additive):
--  * two more production roles (Mobilograf, Motion dizayner);
--  * CRM / integrations / results permissions for staff and clients;
--  * access requests: a Google (or any self-created) login waits in "pending" until an admin grants a role;
--  * temporary passwords: the app nudges people to replace the password an admin handed over.

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, description, scope, rank, is_system) values
  ('mobilographer', 'Mobilograf', 'Telefon bilan syomka va tezkor montaj', 'staff', 60, true),
  ('motion_designer', 'Motion dizayner', 'Animatsiya va motion grafika', 'staff', 60, true)
on conflict (key) do nothing;

insert into public.permissions (key, module, name, scope) values
  ('crm.read', 'crm', 'Lidlar va CRM hisobotlarini ko''rish', 'staff'),
  ('crm.manage', 'crm', 'Lidlarni mijozga yuborish va CRM hisobot yuborish', 'staff'),
  ('integrations.manage', 'crm', 'Meta / Instagram ulanishlarini boshqarish', 'staff'),
  ('client.crm.view', 'client', 'SUN MEDIA yuborgan lidlarni ko''rish', 'client'),
  ('client.results.view', 'client', 'Natijalar va Instagram statistikasi', 'client')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('mobilographer', 'files.upload'),
  ('motion_designer', 'files.upload'),
  ('admin', 'crm.read'),
  ('admin', 'crm.manage'),
  ('admin', 'integrations.manage'),
  -- Rahbar oversight: sees leads and CRM reports, changes nothing.
  ('owner', 'crm.read'),
  ('director', 'crm.read'),
  ('project_manager', 'crm.read'),
  ('smm_manager', 'crm.read'),
  ('client_owner', 'client.crm.view'),
  ('client_owner', 'client.results.view'),
  ('client_employee', 'client.crm.view'),
  ('client_employee', 'client.results.view')
) as x (role_key, permission_key)
join public.roles r on r.key = x.role_key
on conflict do nothing;

-- Tariffs can include running the client's ads.
insert into public.service_types (key, name, unit, content_types, counts_on, is_quantitative, position)
values ('ad_management', 'Reklama boshqaruvi', 'oy', '{}', 'manual', false, 115)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Access requests (first sign-in with Google, or any login nobody provisioned)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists access_requested_at timestamptz,
  add column if not exists password_changed_at timestamptz;

create or replace function private.is_unprovisioned(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.user_roles where user_id = p_user)
     and not exists (select 1 from public.employees where user_id = p_user)
     and not exists (select 1 from public.client_members where user_id = p_user);
$$;

-- Provisioning accepts a login the admin just created, or a confirmed login that is waiting for access
-- (e.g. someone who signed in with Google). Accounts that already have a role are never taken over.
create or replace function private.assert_fresh_account(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_user and (u.created_at > now() - interval '15 minutes' or u.email_confirmed_at is not null)
  ) then
    raise exception 'Account is not a freshly created login' using errcode = '22023';
  end if;
  if not private.is_unprovisioned(p_user) then
    raise exception 'Account is already provisioned' using errcode = '22023';
  end if;
end;
$$;

-- Called by the app on the "pending" screen: records the request once and tells the people who can grant it.
create or replace function public.request_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not private.is_unprovisioned(v_uid) then
    return jsonb_build_object('status', 'provisioned');
  end if;

  update public.profiles
  set access_requested_at = now()
  where id = v_uid and access_requested_at is null and deleted_at is null
  returning * into v_profile;

  if found then
    perform private.notify(
      private.users_with_permission('employees.manage'),
      'account.access_request',
      'Yangi kirish so‘rovi',
      coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'Yangi foydalanuvchi') || ' tizimga kirishni so‘ramoqda. Rol bering yoki rad eting.',
      jsonb_build_object('route', '/team/accounts'),
      'profiles', v_uid, null, 'normal'
    );
    perform private.audit_event('account.access_requested', 'profiles', v_uid::text);
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  return jsonb_build_object('status', 'pending', 'requested_at', v_profile.access_requested_at);
end;
$$;

-- Jamoa → Akkauntlar → Kirish so‘rovlari: logins without any role or client (never someone else's account).
create or replace function public.get_access_requests()
returns table (
  user_id uuid, full_name text, email text, avatar_url text, providers text[], status public.account_status,
  requested_at timestamptz, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and (private.has_permission('employees.manage') or private.has_permission('clients.manage'))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.email, p.avatar_url,
         coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = p.id), '{}'),
         p.status, p.access_requested_at, p.created_at, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.deleted_at is null
    and private.is_unprovisioned(p.id)
    -- A login an admin is creating right now is provisioned within the same request.
    and (p.access_requested_at is not null or p.created_at < now() - interval '2 minutes')
  order by coalesce(p.access_requested_at, p.created_at) desc;
end;
$$;

-- Rad etish: the login stays but can open nothing (the admin panel also bans it in Auth).
create or replace function public.decline_access_request(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.has_permission('employees.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() or not private.is_unprovisioned(p_user_id) then
    raise exception 'Only a pending access request can be declined' using errcode = '22023';
  end if;
  update public.profiles
  set status = 'disabled',
      status_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Kirish so‘rovi rad etildi'), 300),
      status_changed_at = now(),
      status_changed_by = auth.uid()
  where id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  perform private.audit_event('account.access_declined', 'profiles', p_user_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Temporary passwords: admins hand over a one-time password; the person replaces it.
-- ---------------------------------------------------------------------------
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set password_changed_at = now() where id = (select auth.uid());
$$;

-- get_my_context: unchanged except for the temporary-password flag.
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
  v_system_owner boolean;
  v_clients jsonb;
  v_permissions text[];
  v_temporary boolean;
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
  v_system_owner := private.has_role('system_owner');

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
             ) perms where k <> 'client.approve'
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

  -- An admin-issued password (new login or reset) that the person has not replaced yet.
  v_temporary := v_profile.provisioned_by is not null
    and exists (select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'email')
    and coalesce(v_profile.password_changed_at, '-infinity'::timestamptz)
        < greatest(coalesce(v_profile.password_reset_at, '-infinity'::timestamptz), v_profile.created_at);

  return jsonb_build_object(
    'status', case
      when v_staff then 'active'
      when jsonb_array_length(v_clients) > 0 then 'active'
      else 'pending'
    end,
    'kind', case when v_staff then 'staff' when jsonb_array_length(v_clients) > 0 then 'client' end,
    'interface', case
      when v_system_owner then null
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
    'clients', v_clients,
    'temporary_password', v_temporary
  );
end;
$$;

revoke all on function public.request_access() from public, anon;
revoke all on function public.get_access_requests() from public, anon;
revoke all on function public.decline_access_request(uuid, text) from public, anon;
revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.request_access() to authenticated;
grant execute on function public.get_access_requests() to authenticated;
grant execute on function public.decline_access_request(uuid, text) to authenticated;
grant execute on function public.mark_password_changed() to authenticated;
