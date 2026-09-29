-- SUN MEDIA — final operating model.
--   * Tizim egasi (system_owner): the one account above everyone. Web panel only, holds every permission,
--     and nobody below it can block, re-role, re-permission, reset or sign it out (rank 0 + guards below).
--   * Rahbar (owner): watches the agency — read permissions only, no longer "everything".
--   * Admin: runs the day (mobile) and the large management jobs (web); answers client chats.
--   * Mijoz: only follows the work and writes to SUN MEDIA. The client approval step is switched off
--     (setting approvals.client_stage = false); historical approval data is kept as it is.
-- Nothing is deleted: old statuses, versions, decisions and revisions stay readable.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
update public.roles
set rank = 5, name = 'Rahbar', description = 'Agentlik rahbari — kuzatish va nazorat'
where key = 'owner';

insert into public.roles (key, name, description, scope, rank, is_system)
values ('system_owner', 'Tizim egasi', 'Tizim egasi — faqat web panel, butun tizim ustidan nazorat', 'staff', 0, true)
on conflict (key) do update set rank = 0, name = excluded.name, description = excluded.description, is_system = true;

update public.roles set name = 'Admin', description = 'Kundalik boshqaruv: davomat, syomka, vazifa, mijoz bilan chat' where key = 'admin';
update public.roles set name = 'Mijoz', description = 'Mijoz kompaniyasi — faqat kuzatadi va SUN MEDIA bilan yozishadi' where key = 'client_owner';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, name, description, scope)
values ('chat.observe', 'system', 'Mijoz chatlarini kuzatish', 'Mijoz ↔ Admin yozishmalarini faqat o‘qish', 'staff')
on conflict (key) do nothing;

-- Rahbar: observation and statistics only.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view', 'clients.read_all', 'employees.read', 'attendance.read', 'performance.read',
  'reports.read', 'tasks.read_all', 'subscriptions.read', 'chat.observe'
)
where r.key = 'owner'
on conflict do nothing;

-- Audit logs belong to the Tizim egasi (Tizim boshqaruvi); admins keep everything else they had.
delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id and r.key in ('admin', 'director') and rp.permission_key = 'audit.read';

insert into public.app_settings (key, value, description)
values ('approvals.client_stage', 'false', 'Mijoz tasdiqlash bosqichi (o‘chirilgan: mijoz faqat kuzatadi)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The Tizim egasi holds every permission implicitly (was: owner)
-- ---------------------------------------------------------------------------
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
          r.key = 'system_owner'
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

create or replace function private.users_with_permission(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.user_id), '{}')
  from (
    select ur.user_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.scope = 'staff'
      and (r.key = 'system_owner' or exists (
        select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_permission
      ))
    union all
    select up.user_id from public.user_permissions up where up.permission_key = p_permission
  ) x
  join public.profiles p on p.id = x.user_id and p.status = 'active' and p.deleted_at is null;
$$;

-- The last Tizim egasi can never lose the role.
create or replace function private.guard_user_roles_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role record;
begin
  select * into v_role from private.role_meta(old.role_id);
  if v_role.key = 'system_owner' and not private.other_role_holders_exist(old.role_id, old.user_id) then
    raise exception 'The last owner cannot be removed' using errcode = '42501';
  end if;
  if not private.is_privileged_context() and v_role.rank < private.current_best_rank() then
    raise exception 'Cannot remove a role above your own' using errcode = '42501';
  end if;
  return old;
end;
$$;

-- What a whole role may do is changed only by the Tizim egasi; its own permissions are fixed.
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
  if v_role.key = 'system_owner' then
    raise exception 'Owner permissions are fixed' using errcode = '42501';
  end if;
  if not private.has_role('system_owner') then
    raise exception 'Only the system owner changes role permissions' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- Account management: the rank rule already keeps admins away from higher accounts
-- (can_manage_account); the last-active guard now protects the Tizim egasi.
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
                 where ur.user_id = p_user_id and r.key = 'system_owner')
     and not exists (select 1 from public.user_roles ur
                     join public.roles r on r.id = ur.role_id and r.key = 'system_owner'
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

create or replace function public.change_staff_role(p_user_id uuid, p_role_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not (private.can_manage_account(p_user_id) and private.has_permission('roles.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_role from public.roles where key = p_role_key;
  if not found or v_role.scope <> 'staff' then
    raise exception 'Choose a SUN MEDIA staff role' using errcode = '22023';
  end if;
  if v_role.rank < private.current_best_rank() then
    raise exception 'Cannot assign a role above your own' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where user_id = p_user_id) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
             where ur.user_id = p_user_id and r.key = 'system_owner')
     and p_role_key <> 'system_owner'
     and not private.other_role_holders_exist((select id from public.roles where key = 'system_owner'), p_user_id) then
    raise exception 'The last owner cannot be removed' using errcode = '42501';
  end if;

  delete from public.user_roles ur using public.roles r
  where r.id = ur.role_id and ur.user_id = p_user_id and r.scope = 'staff' and r.key <> p_role_key;
  insert into public.user_roles (user_id, role_id) values (p_user_id, v_role.id) on conflict do nothing;

  perform private.audit_event('account.role_changed', 'profiles', p_user_id::text, null, null, jsonb_build_object('role', p_role_key));
end;
$$;

-- ---------------------------------------------------------------------------
-- Session context: the Tizim egasi has no mobile interface (web panel only).
-- ---------------------------------------------------------------------------
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
    'clients', v_clients
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Review: the internal check finishes the work. Clients no longer approve; a version still waiting
-- for a client from before this change can be finished by a manager.
-- ---------------------------------------------------------------------------
create or replace function private.client_stage_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'approvals.client_stage'), false);
$$;

grant execute on function private.client_stage_enabled() to authenticated;

create or replace function public.review_content_version(
  p_version_id uuid,
  p_decision public.approval_decision,
  p_summary text default null,
  p_comments jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.content_versions;
  v_item public.content_items;
  v_stage public.approval_stage;
  v_revision public.revisions;
  v_comment jsonb;
  v_approved_folder uuid;
  v_client_stage boolean := private.client_stage_enabled();
begin
  select * into v_version from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  select * into v_item from public.content_items where id = v_version.content_id for update;

  if v_version.status = 'internal_review' then
    v_stage := 'internal';
    if not private.can_manage_client(v_item.client_id, 'approvals.manage') then
      raise exception 'Not allowed to review internally' using errcode = '42501';
    end if;
  elsif v_version.status = 'client_review' then
    v_stage := 'client';
    if not (
      (v_client_stage and private.has_client_permission(v_item.client_id, 'client.approve'))
      or private.can_manage_client(v_item.client_id, 'approvals.manage')
    ) then
      raise exception 'Not allowed to approve for this client' using errcode = '42501';
    end if;
  else
    raise exception 'Version is not awaiting review (status: %)', v_version.status using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_comments, '[]')) <> 'array' then
    raise exception 'p_comments must be an array' using errcode = '22023';
  end if;
  if p_decision = 'changes_requested' and coalesce(nullif(trim(p_summary), ''), '') = '' and jsonb_array_length(p_comments) = 0 then
    raise exception 'Describe the requested changes' using errcode = '22023';
  end if;

  insert into public.client_approvals (content_id, client_id, version_id, stage, decision, comment, decided_by)
  values (v_item.id, v_item.client_id, v_version.id, v_stage, p_decision, nullif(trim(p_summary), ''), auth.uid());

  if p_decision = 'approved' then
    if v_stage = 'internal' and v_client_stage then
      update public.content_versions set status = 'client_review', sent_to_client_at = now() where id = v_version.id;
      update public.files set visibility = 'client' where id = v_version.file_id;
      update public.content_items set status = 'client_review', status_changed_at = now() where id = v_item.id;
    else
      -- Ready: the final file goes to the client's "Tasdiqlangan" folder.
      update public.content_versions set status = 'approved', decided_at = now() where id = v_version.id;
      select id into v_approved_folder from public.folders where client_id = v_item.client_id and kind = 'approved' and is_system;
      update public.files set folder_id = coalesce(v_approved_folder, folder_id), visibility = 'client' where id = v_version.file_id;
      update public.content_items
      set status = 'approved', status_changed_at = now(), approved_at = now()
      where id = v_item.id;
    end if;
  else
    update public.content_versions set status = 'changes_requested', decided_at = now() where id = v_version.id;

    insert into public.revisions (content_id, client_id, version_id, revision_number, stage, summary, requested_by)
    values (v_item.id, v_item.client_id, v_version.id, v_item.revision_count + 1, v_stage, nullif(trim(p_summary), ''), auth.uid())
    returning * into v_revision;

    for v_comment in select * from jsonb_array_elements(p_comments) loop
      insert into public.revision_comments (revision_id, author_id, timecode_ms, body)
      values (
        v_revision.id, auth.uid(),
        nullif(v_comment ->> 'timecode_ms', '')::integer,
        v_comment ->> 'body'
      );
    end loop;

    update public.content_items
    set status = 'revision', status_changed_at = now(), revision_count = revision_count + 1
    where id = v_item.id;
  end if;

  perform private.audit_event(
    case when p_decision = 'approved' then 'content.approved' else 'content.changes_requested' end,
    'content_items', v_item.id::text, v_item.client_id,
    null, jsonb_build_object('stage', v_stage, 'version', v_version.version_number, 'revision_id', v_revision.id)
  );

  return jsonb_build_object('stage', v_stage, 'decision', p_decision, 'revision_id', v_revision.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Client chat: "SUN MEDIA bilan chat" reaches the admins; the Rahbar reads it.
-- ---------------------------------------------------------------------------
-- Every admin sits in every client's default chat room (the room already holds the client users).
create or replace function private.admin_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ur.user_id), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key = 'admin'
  join public.profiles p on p.id = ur.user_id and p.deleted_at is null;
$$;

insert into public.chat_members (room_id, user_id)
select r.id, a
from public.chat_rooms r
cross join unnest(private.admin_user_ids()) a
where r.kind = 'project' and r.is_default
on conflict do nothing;

create or replace function private.sync_admin_client_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'user_roles' then
    if (select key from public.roles where id = new.role_id) = 'admin' then
      insert into public.chat_members (room_id, user_id)
      select r.id, new.user_id from public.chat_rooms r where r.kind = 'project' and r.is_default
      on conflict do nothing;
    end if;
  elsif new.kind = 'project' and new.is_default then
    insert into public.chat_members (room_id, user_id)
    select new.id, a from unnest(private.admin_user_ids()) a
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger user_roles_sync_admin_client_rooms
  after insert on public.user_roles
  for each row execute function private.sync_admin_client_rooms();
create trigger chat_rooms_sync_admin_client_rooms
  after insert on public.chat_rooms
  for each row execute function private.sync_admin_client_rooms();

-- Observers (chat.observe) read client rooms but are not members, so they can never send.
create policy "observers read client chat messages" on public.messages
  for select to authenticated using (
    (select private.has_permission('chat.observe'))
    and exists (select 1 from public.chat_rooms r where r.id = room_id and r.kind = 'project')
  );
create policy "observers read client chat members" on public.chat_members
  for select to authenticated using (
    (select private.has_permission('chat.observe'))
    and exists (select 1 from public.chat_rooms r where r.id = room_id and r.kind = 'project')
  );

-- One list of client conversations for the admin inbox and the Rahbar's read-only view.
create or replace function public.get_client_conversations()
returns table (
  room_id uuid,
  client_id uuid,
  client_name text,
  client_code text,
  client_logo text,
  last_message_body text,
  last_message_at timestamptz,
  last_sender_name text,
  awaiting_reply boolean,
  is_member boolean,
  unread_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and (private.has_permission('chat.manage') or private.has_permission('chat.observe'))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select
    r.id, c.id, c.name, c.code, c.logo_url,
    case when lm.deleted_at is not null then '' else lm.body end,
    lm.created_at, sp.full_name,
    -- The last word is the client's: SUN MEDIA has not answered yet.
    coalesce(lm.sender_id is not null and exists (select 1 from public.client_members cm where cm.client_id = c.id and cm.user_id = lm.sender_id), false),
    me.user_id is not null,
    case when me.user_id is null then 0 else (
      select count(*)::integer from public.messages x
      where x.room_id = r.id and x.created_at > me.last_read_at and x.sender_id is distinct from me.user_id and x.deleted_at is null
    ) end
  from public.chat_rooms r
  join public.clients c on c.id = r.client_id and c.deleted_at is null
  left join public.chat_members me on me.room_id = r.id and me.user_id = auth.uid()
  left join lateral (
    select m.id, m.body, m.created_at, m.sender_id, m.deleted_at
    from public.messages m
    where m.room_id = r.id and not m.is_system
    order by m.created_at desc
    limit 1
  ) lm on true
  left join public.profiles sp on sp.id = lm.sender_id
  where r.kind = 'project' and r.is_default
    and (private.sees_all_clients() or c.id = any (private.staff_client_ids()))
  order by coalesce(lm.created_at, r.created_at) desc;
end;
$$;

revoke execute on function public.get_client_conversations() from public, anon;
grant execute on function public.get_client_conversations() to authenticated;

-- ---------------------------------------------------------------------------
-- Tizim boshqaruvi: sessions and sign-in events (Tizim egasi only)
-- ---------------------------------------------------------------------------
create or replace function public.system_sessions()
returns table (user_id uuid, full_name text, email text, sessions integer, last_active_at timestamptz, user_agent text, ip text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.has_role('system_owner')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select s.user_id, p.full_name, p.email, count(*)::integer,
         max(coalesce(s.refreshed_at, s.updated_at, s.created_at))::timestamptz,
         (array_agg(s.user_agent order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc))[1],
         (array_agg(host(s.ip) order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc))[1]
  from auth.sessions s
  left join public.profiles p on p.id = s.user_id
  where s.not_after is null or s.not_after > now()
  group by s.user_id, p.full_name, p.email
  order by 5 desc nulls last;
end;
$$;

create or replace function public.system_revoke_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.has_role('system_owner')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use sign out for your own sessions' using errcode = '22023';
  end if;
  -- Refresh tokens belong to the sessions and go with them; open access tokens simply expire.
  delete from auth.sessions where user_id = p_user_id;
  perform private.audit_event('account.sessions_revoked', 'profiles', p_user_id::text);
end;
$$;

create or replace function public.system_auth_events(p_limit integer default 50)
returns table (occurred_at timestamptz, action text, email text, ip text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.has_role('system_owner')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select e.created_at, e.payload ->> 'action', e.payload ->> 'actor_username', nullif(e.ip_address, '')::text
  from auth.audit_log_entries e
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.system_sessions(), public.system_revoke_sessions(uuid), public.system_auth_events(integer) from public, anon;
grant execute on function public.system_sessions(), public.system_revoke_sessions(uuid), public.system_auth_events(integer) to authenticated;
