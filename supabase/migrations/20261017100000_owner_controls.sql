-- The system owner (Tizim egasi) alone adds new clients, client logins and employees. Two new permissions carry
-- that: no role has them, the system owner holds every permission implicitly, and can hand them to someone through
-- "Rol va ruxsatlar" if ever needed. Admins keep editing, blocking and resetting existing accounts. Additive.

insert into public.permissions (key, module, name, description, scope) values
  ('clients.create', 'clients', 'Yangi mijoz qo''shish', 'Yangi mijoz (kompaniya) va mijoz loginlarini yaratish', 'staff'),
  ('employees.create', 'team', 'Yangi xodim qo''shish', 'Yangi xodim akkauntini yaratish va kirish so''roviga xodim sifatida ruxsat berish', 'staff')
on conflict (key) do nothing;

drop policy "create clients" on public.clients;
create policy "create clients" on public.clients
  for insert to authenticated with check (
    (select private.has_permission('clients.create')) and (select private.sees_all_clients())
  );

CREATE OR REPLACE FUNCTION public.provision_staff_member(p_user_id uuid, p_first_name text, p_last_name text, p_role_key text, p_job_title text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_department text DEFAULT NULL::text, p_employment_type employment_type DEFAULT 'full_time'::employment_type, p_permissions text[] DEFAULT '{}'::text[], p_client_ids uuid[] DEFAULT '{}'::uuid[], p_team_role team_role DEFAULT NULL::team_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_role public.roles;
  v_first text := private.clean_name(p_first_name, 'First name');
  v_last text := private.clean_name(p_last_name, 'Last name');
  v_team_role public.team_role;
  v_client uuid;
  v_perm text;
begin
  -- Only whoever holds "Yangi xodim qo'shish" (the system owner, or someone they gave it to) adds people.
  if not (private.is_staff() and private.has_permission('employees.create')) then
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
$function$;

CREATE OR REPLACE FUNCTION public.provision_client_user(p_user_id uuid, p_client_id uuid, p_role_key text, p_first_name text, p_last_name text, p_phone text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_permissions text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_role public.roles;
  v_first text := private.clean_name(p_first_name, 'First name');
  v_last text := private.clean_name(p_last_name, 'Last name');
  v_perm text;
begin
  -- New client logins need "Yangi mijoz qo'shish" (the system owner, or someone they gave it to).
  if not (private.is_staff() and private.can_manage_client(p_client_id, 'clients.create')) then
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
$function$;
