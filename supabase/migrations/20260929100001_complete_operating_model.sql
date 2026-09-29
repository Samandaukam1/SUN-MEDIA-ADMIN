-- Complete the already-applied operating model; keep all historical decisions and dates.
-- CLI-created migration ordered after Claude's 20260929100000 migration.
update public.app_settings set value = 'false' where key = 'approvals.client_stage';

-- Approval is retired, not a feature toggle. Historical rows remain available to staff.
create or replace function private.client_stage_enabled()
returns boolean language sql stable security definer set search_path = ''
as $$ select false; $$;

CREATE OR REPLACE FUNCTION private.has_client_permission(p_client uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_permission <> 'client.approve' and p_client = any (private.member_client_ids()) and (
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
$function$;

CREATE OR REPLACE FUNCTION private.client_users_with_permission(p_client uuid, p_permission text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(distinct cm.user_id), '{}')
  from public.client_members cm
  join public.clients c on c.id = cm.client_id and c.status in ('active', 'paused') and c.deleted_at is null
  join public.profiles p on p.id = cm.user_id and p.status = 'active' and p.deleted_at is null
  where p_permission <> 'client.approve' and cm.client_id = p_client
    and (
      exists (select 1 from public.role_permissions rp where rp.role_id = cm.role_id and rp.permission_key = p_permission)
      or exists (select 1 from public.client_member_permissions x
                 where x.client_id = cm.client_id and x.user_id = cm.user_id and x.permission_key = p_permission)
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_my_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_calendar_events(p_from timestamp with time zone, p_to timestamp with time zone, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_type text, entity_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, title text, client_id uuid, client_name text, content_id uuid, content_type content_type, platform social_platform, status text, location_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select 'shooting', s.id, s.starts_at, s.ends_at, s.title, s.client_id, c.name,
         null::uuid, null::public.content_type, null::public.social_platform, s.status::text, s.location_name
  from public.shootings s
  join public.clients c on c.id = s.client_id
  where s.deleted_at is null and s.status <> 'cancelled' and s.starts_at < p_to and s.ends_at >= p_from
    and (p_client_id is null or s.client_id = p_client_id)

  union all
  select 'publication', p.id, p.scheduled_at, p.scheduled_at, ci.title, p.client_id, c.name,
         ci.id, ci.content_type, p.platform, p.status::text, null
  from public.content_publications p
  join public.content_items ci on ci.id = p.content_id and ci.deleted_at is null and ci.status <> 'cancelled'
  join public.clients c on c.id = p.client_id
  where p.scheduled_at >= p_from and p.scheduled_at < p_to and p.status <> 'cancelled'
    and (p_client_id is null or p.client_id = p_client_id)

  union all
  select 'content_due', ci.id, ci.due_at, ci.due_at, ci.title, ci.client_id, c.name,
         ci.id, ci.content_type, null, ci.status::text, null
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.deleted_at is null and ci.due_at >= p_from and ci.due_at < p_to
    and ci.status <> 'cancelled'
    and (p_client_id is null or ci.client_id = p_client_id)

  union all
  select case t.task_type when 'editing' then 'editing_deadline' when 'meeting' then 'meeting' when 'design' then 'design_deadline' else 'task_deadline' end,
         t.id, coalesce(t.starts_at, t.due_at), t.due_at, t.title, t.client_id, c.name,
         t.content_id, null, null, t.status::text, null
  from public.tasks t
  left join public.clients c on c.id = t.client_id
  where t.deleted_at is null and t.due_at >= p_from and t.due_at < p_to and t.status <> 'cancelled'
    and (p_client_id is null or t.client_id = p_client_id)

  union all
  select 'company_' || e.kind, e.id, e.starts_at, e.ends_at, e.title, null::uuid, null::text,
         null::uuid, null::public.content_type, null::public.social_platform, null::text, e.location
  from public.company_events e
  where e.deleted_at is null and e.starts_at < p_to and e.ends_at >= p_from and p_client_id is null

  order by 3;
$function$;

CREATE OR REPLACE FUNCTION public.get_content_transitions(p_content_id uuid)
 RETURNS content_status[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = p_content_id and deleted_at is null;
  if not found or not (private.sees_all_clients() or v_item.client_id = any (private.accessible_client_ids())) then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;

  if private.can_manage_client(v_item.client_id, 'content.manage') then
    return array(
      select s from unnest(enum_range(null::public.content_status)) s where s <> v_item.status and s <> 'client_review'
    );
  end if;
  if p_content_id = any (private.assigned_content_ids()) then
    return array(
      select s from unnest(enum_range(null::public.content_status)) s
      where private.assignee_transition_allowed(v_item.status, s)
    );
  end if;
  return '{}'::public.content_status[];
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_content_version(p_content_id uuid, p_file_id uuid, p_notes text DEFAULT NULL::text, p_stage approval_stage DEFAULT 'internal'::approval_stage)
 RETURNS content_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.content_items;
  v_file public.files;
  v_version public.content_versions;
  v_is_manager boolean;
begin
  select * into v_item from public.content_items where id = p_content_id and deleted_at is null for update;
  if not found then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;

  v_is_manager := private.can_manage_client(v_item.client_id, 'approvals.manage');
  if not v_is_manager and not (p_content_id = any (private.assigned_content_ids())) then
    raise exception 'Not assigned to this content' using errcode = '42501';
  end if;
  if p_stage = 'client' then
    raise exception 'Client approval is retired; submit for internal review' using errcode = '42501';
  end if;
  if v_item.status in ('approved', 'scheduled', 'published', 'cancelled') then
    raise exception 'Content is already %', v_item.status using errcode = '22023';
  end if;

  select * into v_file from public.files where id = p_file_id;
  if not found or v_file.client_id is distinct from v_item.client_id or v_file.status <> 'uploaded' or v_file.deleted_at is not null then
    raise exception 'File must be an uploaded file of the same client' using errcode = '22023';
  end if;

  update public.content_versions
  set status = 'superseded'
  where content_id = p_content_id and status in ('internal_review', 'client_review');

  update public.revisions
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
  where content_id = p_content_id and status in ('open', 'in_progress');

  insert into public.content_versions (content_id, client_id, version_number, file_id, notes, status, submitted_by, sent_to_client_at)
  values (
    p_content_id, v_item.client_id,
    coalesce((select max(version_number) from public.content_versions where content_id = p_content_id), 0) + 1,
    p_file_id, p_notes,
    case when p_stage = 'client' then 'client_review' else 'internal_review' end::public.version_status,
    auth.uid(),
    case when p_stage = 'client' then now() end
  )
  returning * into v_version;

  update public.files
  set content_id = p_content_id,
      visibility = case when p_stage = 'client' then 'client'::public.visibility_level else visibility end
  where id = p_file_id;

  update public.content_items
  set status = case when p_stage = 'client' then 'client_review' else 'internal_review' end::public.content_status,
      status_changed_at = now()
  where id = p_content_id;

  perform private.audit_event(
    'content.version_submitted', 'content_items', p_content_id::text, v_item.client_id,
    null, jsonb_build_object('version', v_version.version_number, 'stage', p_stage)
  );
  return v_version;
end;
$function$;

-- Direct status writes and save_content must not recreate the retired client queue.
create or replace function private.guard_retired_client_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status::text = 'client_review' then
    if tg_op = 'INSERT' or old.status::text is distinct from 'client_review' then
      raise exception 'Client approval is retired; use internal review' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger content_items_retired_client_review before insert or update of status on public.content_items
for each row execute function private.guard_retired_client_review();
create trigger content_versions_retired_client_review before insert or update of status on public.content_versions
for each row execute function private.guard_retired_client_review();

-- Both leadership roles have the same default oversight permissions.
delete from public.role_permissions rp using public.roles r
where rp.role_id = r.id and r.key in ('owner', 'director')
  and rp.permission_key not in ('dashboard.view', 'clients.read_all', 'employees.read', 'attendance.read',
    'performance.read', 'reports.read', 'tasks.read_all', 'subscriptions.read', 'finance.read', 'chat.observe');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.key in ('owner', 'director') and p.key in ('dashboard.view', 'clients.read_all', 'employees.read',
  'attendance.read', 'performance.read', 'reports.read', 'tasks.read_all', 'subscriptions.read', 'finance.read', 'chat.observe')
on conflict do nothing;

-- A Rahbar who was previously a room member still only observes client conversations.
create policy "observers cannot send to client rooms" on public.messages as restrictive
for insert to authenticated with check (
  not (private.has_permission('chat.observe') and not private.has_permission('chat.manage'))
  or not exists (select 1 from public.chat_rooms r where r.id = room_id and r.kind = 'project')
);
create policy "observers cannot edit client messages" on public.messages as restrictive
for update to authenticated using (
  not (private.has_permission('chat.observe') and not private.has_permission('chat.manage'))
  or not exists (select 1 from public.chat_rooms r where r.id = room_id and r.kind = 'project')
) with check (
  not (private.has_permission('chat.observe') and not private.has_permission('chat.manage'))
  or not exists (select 1 from public.chat_rooms r where r.id = room_id and r.kind = 'project')
);

-- No alerts ask a client to approve historical work. Keep the rules for audit/history.
update public.deadline_alert_rules set is_active = false where target = 'content_approval';
