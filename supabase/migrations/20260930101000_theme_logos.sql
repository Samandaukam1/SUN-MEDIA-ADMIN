-- Theme-aware brand logos: a light-mode and a dark-mode centre Home logo per client and for the agency (additive).
-- The app picks by the active theme and falls back light ↔ dark, then to the built-in SUN MEDIA artwork.

alter table public.clients add column if not exists home_logo_dark_url text check (home_logo_dark_url is null or home_logo_dark_url ~ '^https?://');
alter table public.workspaces add column if not exists home_logo_dark_url text check (home_logo_dark_url is null or home_logo_dark_url ~ '^https?://');

drop function if exists public.set_home_logo(uuid, text);

-- "Bosh sahifa logosi" (light / dark): set or clear, for a client or the agency (p_client NULL).
create function public.set_home_logo(p_client uuid, p_url text, p_variant text default 'light')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_variant not in ('light', 'dark') then
    raise exception 'Variant is light or dark' using errcode = '22023';
  end if;
  -- Only files in our own branding bucket, under the matching client / agency folder.
  if p_url is not null and p_url !~ ('^https?://[^/]+/storage/v1/object/public/branding/'
       || case when p_client is null then 'agency' else 'clients/' || p_client::text end || '/[A-Za-z0-9._-]+$') then
    raise exception 'Logo must be uploaded to the branding storage' using errcode = '22023';
  end if;
  perform private.require_agency_feature('branding.custom');
  if p_client is null then
    if not (private.has_role('system_owner') or private.has_permission('settings.manage')) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if p_variant = 'dark' then
      update public.workspaces set home_logo_dark_url = p_url where kind = 'agency';
    else
      update public.workspaces set home_logo_url = p_url where kind = 'agency';
    end if;
  else
    if not private.can_manage_client(p_client, 'clients.manage') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if p_variant = 'dark' then
      update public.clients set home_logo_dark_url = p_url where id = p_client;
    else
      update public.clients set home_logo_url = p_url where id = p_client;
    end if;
  end if;
  perform private.audit_event('branding.home_logo', 'clients', coalesce(p_client::text, 'agency'), p_client, null,
    jsonb_build_object('url', p_url, 'variant', p_variant));
end;
$$;

grant execute on function public.set_home_logo(uuid, text, text) to authenticated;
revoke all on function public.set_home_logo(uuid, text, text) from anon;

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
           'home_logo_url', coalesce(c.home_logo_url, c.logo_url),
           'home_logo_dark_url', c.home_logo_dark_url,
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
    'temporary_password', v_temporary,
    -- The centre Home logo: the agency's own (NULL = built-in SUN MEDIA logo) for staff, the company's for clients.
    'branding', jsonb_build_object(
      'home_logo_url', case
        when v_staff then (select w.home_logo_url from public.workspaces w where w.kind = 'agency')
        else v_clients -> 0 ->> 'home_logo_url'
      end,
      'home_logo_dark_url', case
        when v_staff then (select w.home_logo_dark_url from public.workspaces w where w.kind = 'agency')
        else v_clients -> 0 ->> 'home_logo_dark_url'
      end
    )
  );
end;
$$;
