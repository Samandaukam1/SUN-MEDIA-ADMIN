-- The system owner names roles in their own words: renames any role (the internal key stays, so everything wired
-- to "editor", "operator"… keeps working) and creates new roles that start with the permissions of a base role.
-- Additive.

create or replace function public.rename_role(p_role_id uuid, p_name text, p_description text default null)
returns public.roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not (private.has_role('system_owner') and private.has_permission('roles.manage')) then
    raise exception 'Only the system owner renames roles' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Role name must be 1–80 characters' using errcode = '22023';
  end if;
  select * into v_role from public.roles where id = p_role_id for update;
  if not found then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.roles r where r.id <> p_role_id and r.scope = v_role.scope and lower(r.name) = lower(v_name)) then
    raise exception 'A role with this name already exists' using errcode = '23505';
  end if;
  update public.roles
  set name = v_name, description = coalesce(nullif(btrim(p_description), ''), description)
  where id = p_role_id
  returning * into v_role;
  perform private.audit_event('role.renamed', 'roles', p_role_id::text, null, null, jsonb_build_object('name', v_name));
  return v_role;
end;
$$;

create or replace function public.create_custom_role(p_name text, p_base_key text)
returns public.roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base public.roles;
  v_role public.roles;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not (private.has_role('system_owner') and private.has_permission('roles.manage')) then
    raise exception 'Only the system owner creates roles' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Role name must be 1–80 characters' using errcode = '22023';
  end if;
  select * into v_base from public.roles where key = p_base_key and scope = 'staff' and key <> 'system_owner';
  if not found then
    raise exception 'Choose a SUN MEDIA staff role to start from' using errcode = '22023';
  end if;
  if exists (select 1 from public.roles r where r.scope = 'staff' and lower(r.name) = lower(v_name)) then
    raise exception 'A role with this name already exists' using errcode = '23505';
  end if;

  insert into public.roles (key, name, description, scope, rank, is_system)
  values ('custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), v_name, 'Asos: ' || v_base.name, 'staff', v_base.rank, false)
  returning * into v_role;
  insert into public.role_permissions (role_id, permission_key)
  select v_role.id, rp.permission_key from public.role_permissions rp where rp.role_id = v_base.id;
  perform private.audit_event('role.created', 'roles', v_role.id::text, null, null, jsonb_build_object('name', v_name, 'base', v_base.key));
  return v_role;
end;
$$;

create or replace function public.delete_custom_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not (private.has_role('system_owner') and private.has_permission('roles.manage')) then
    raise exception 'Only the system owner deletes roles' using errcode = '42501';
  end if;
  select * into v_role from public.roles where id = p_role_id for update;
  if not found then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;
  if v_role.is_system then
    raise exception 'Built-in roles cannot be deleted' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_roles ur where ur.role_id = p_role_id)
     or exists (select 1 from public.client_members cm where cm.role_id = p_role_id) then
    raise exception 'Role is in use' using errcode = '22023';
  end if;
  delete from public.roles where id = p_role_id;
  perform private.audit_event('role.deleted', 'roles', p_role_id::text, null, null, jsonb_build_object('name', v_role.name));
end;
$$;

revoke all on function public.rename_role(uuid, text, text), public.create_custom_role(text, text), public.delete_custom_role(uuid) from public, anon;
grant execute on function public.rename_role(uuid, text, text), public.create_custom_role(text, text), public.delete_custom_role(uuid) to authenticated;
