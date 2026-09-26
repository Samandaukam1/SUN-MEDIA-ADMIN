-- SUN MEDIA — files module.
--   * create_file_upload gains p_task_id: task attachments by assignees and task managers, stored
--     under the task's client (or the internal area) and never visible to clients.
--   * Task attachments are readable exactly by the people who can read the task.
--   * Moving a file checks the folder belongs to the same client and adopts the folder's visibility.
--   * remove_file: uploader, files manager or task manager; files used as content versions stay.
--   * get_files_overview / get_client_folders: read models for the Files screens (caller's RLS).

drop function if exists public.create_file_upload(text, text, bigint, uuid, uuid, uuid, uuid);

create or replace function public.create_file_upload(
  p_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_client_id uuid default null,
  p_folder_id uuid default null,
  p_content_id uuid default null,
  p_chat_room_id uuid default null,
  p_task_id uuid default null
)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_folder public.folders;
  v_room public.chat_rooms;
  v_task public.tasks;
  v_is_staff boolean := private.is_staff();
  v_max bigint := coalesce((select (value #>> '{}')::bigint from public.app_settings where key = 'uploads.max_file_bytes'), 52428800);
  v_kind public.file_kind := private.file_kind_from_mime(p_mime_type);
  v_bucket text;
  v_visibility public.visibility_level;
  v_id uuid := gen_random_uuid();
  v_safe_name text := left(regexp_replace(coalesce(p_name, 'file'), '[^A-Za-z0-9._-]+', '_', 'g'), 120);
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(p_name)), 0) = 0 or char_length(p_name) > 255 then
    raise exception 'File name must be 1–255 characters' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_max then
    raise exception 'File size must be between 1 byte and % bytes', v_max using errcode = '22023';
  end if;
  if v_kind = 'other' then
    raise exception 'Unsupported file type: %', p_mime_type using errcode = '22023';
  end if;

  if p_chat_room_id is not null then
    if not (p_chat_room_id = any (private.my_chat_room_ids())) then
      raise exception 'Not a member of this chat' using errcode = '42501';
    end if;
    select * into v_room from public.chat_rooms where id = p_chat_room_id;
    v_bucket := 'chat-attachments';
    v_visibility := case when v_room.kind = 'project' then 'client' else 'internal' end::public.visibility_level;
    insert into public.files (id, client_id, chat_room_id, bucket, storage_path, name, mime_type, size_bytes, kind, visibility, uploaded_by)
    values (v_id, v_room.client_id, p_chat_room_id, v_bucket, p_chat_room_id || '/' || v_id || '/' || v_safe_name,
            p_name, p_mime_type, p_size_bytes, v_kind, v_visibility, auth.uid())
    returning * into v_file;
    return v_file;
  end if;

  -- Task attachments: internal working files of the task's people.
  if p_task_id is not null then
    if not v_is_staff then
      raise exception 'Clients cannot attach files to tasks' using errcode = '42501';
    end if;
    select * into v_task from public.tasks where id = p_task_id and deleted_at is null;
    if not found then
      raise exception 'Task not found' using errcode = 'P0002';
    end if;
    if not (
      private.can_manage_task(p_task_id)
      or (private.has_permission('files.upload') and (p_task_id = any (private.my_task_ids()) or v_task.created_by = auth.uid()))
    ) then
      raise exception 'Not allowed to attach files to this task' using errcode = '42501';
    end if;
    insert into public.files (id, client_id, task_id, bucket, storage_path, name, mime_type, size_bytes, kind, visibility, uploaded_by)
    values (v_id, v_task.client_id, p_task_id, 'client-files',
            coalesce(v_task.client_id::text, 'internal') || '/tasks/' || p_task_id || '/' || v_id || '/' || v_safe_name,
            p_name, p_mime_type, p_size_bytes, v_kind, 'internal', auth.uid())
    returning * into v_file;
    return v_file;
  end if;

  if p_client_id is null then
    raise exception 'client_id is required' using errcode = '22023';
  end if;

  if p_folder_id is not null then
    select * into v_folder from public.folders where id = p_folder_id and client_id = p_client_id and deleted_at is null;
    if not found then
      raise exception 'Folder not found' using errcode = 'P0002';
    end if;
  end if;

  if v_is_staff then
    if not (
      private.can_manage_client(p_client_id, 'files.upload')
      or (private.has_permission('files.upload') and p_client_id = any (private.work_client_ids()))
    ) then
      raise exception 'Not allowed to upload files for this client' using errcode = '42501';
    end if;
    v_visibility := coalesce(v_folder.visibility, 'internal');
  else
    if not private.has_client_permission(p_client_id, 'client.files.upload') then
      raise exception 'Not allowed to upload files' using errcode = '42501';
    end if;
    if v_folder.id is null or v_folder.visibility <> 'client' or v_folder.kind in ('approved', 'contracts') then
      raise exception 'Choose a shared folder for your upload' using errcode = '42501';
    end if;
    if p_content_id is not null then
      raise exception 'Clients cannot attach files to content' using errcode = '42501';
    end if;
    v_visibility := 'client';
  end if;

  if p_content_id is not null and not exists (
    select 1 from public.content_items where id = p_content_id and client_id = p_client_id
  ) then
    raise exception 'Content does not belong to this client' using errcode = '22023';
  end if;

  v_bucket := 'client-files';
  insert into public.files (id, client_id, folder_id, content_id, bucket, storage_path, name, mime_type, size_bytes, kind, visibility, uploaded_by)
  values (v_id, p_client_id, p_folder_id, p_content_id, v_bucket, p_client_id || '/' || v_id || '/' || v_safe_name,
          p_name, p_mime_type, p_size_bytes, v_kind, v_visibility, auth.uid())
  returning * into v_file;
  return v_file;
end;
$$;

revoke execute on function public.create_file_upload(text, text, bigint, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_file_upload(text, text, bigint, uuid, uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read access: task attachments follow the task; everything else is unchanged.
-- ---------------------------------------------------------------------------
drop policy "read files" on public.files;
create policy "read files" on public.files
  for select to authenticated using (
    uploaded_by = (select auth.uid())
    or (
      (deleted_at is null or (select private.has_permission('files.manage')))
      and (
        (chat_room_id is not null and chat_room_id = any ((select private.my_chat_room_ids())::uuid[]))
        or (
          chat_room_id is null
          and task_id is not null
          and (select private.is_staff())
          and exists (select 1 from public.tasks t where t.id = task_id)
        )
        or (
          chat_room_id is null
          and task_id is null
          and (select private.is_staff())
          and (
            (select private.sees_all_clients())
            or client_id is null
            or client_id = any ((select private.staff_client_ids())::uuid[])
            or content_id = any ((select private.assigned_content_ids())::uuid[])
            or (
              client_id = any ((select private.work_client_ids())::uuid[])
              and not exists (select 1 from public.folders fo where fo.id = folder_id and fo.kind = 'contracts')
            )
          )
        )
        or (
          chat_room_id is null
          and task_id is null
          and client_id = any ((select private.member_client_ids())::uuid[])
          and visibility = 'client'
          and status = 'uploaded'
          and deleted_at is null
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Moving files: same client only; the file takes the folder's visibility unless set explicitly.
-- ---------------------------------------------------------------------------
create or replace function private.files_guard_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder public.folders;
begin
  if new.folder_id is not null and new.folder_id is distinct from old.folder_id then
    select * into v_folder from public.folders where id = new.folder_id and deleted_at is null;
    if not found or v_folder.client_id is distinct from new.client_id then
      raise exception 'Folder belongs to another client' using errcode = '22023';
    end if;
    if new.visibility is not distinct from old.visibility then
      new.visibility := v_folder.visibility;
    end if;
  end if;
  if new.task_id is not null and new.visibility = 'client' then
    raise exception 'Task attachments stay internal' using errcode = '22023';
  end if;
  if new.name is distinct from old.name and (char_length(trim(new.name)) = 0 or char_length(new.name) > 255) then
    raise exception 'File name must be 1–255 characters' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger files_10_guard_folder
  before update on public.files
  for each row execute function private.files_guard_folder();

-- ---------------------------------------------------------------------------
-- Removing a file (soft delete; the object stays for restore and audit).
-- ---------------------------------------------------------------------------
create or replace function public.remove_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_file from public.files where id = p_file_id and deleted_at is null for update;
  if not found then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if not (
    v_file.uploaded_by = auth.uid()
    or (v_file.client_id is not null and private.can_manage_client(v_file.client_id, 'files.manage'))
    or (v_file.task_id is not null and private.can_manage_task(v_file.task_id))
  ) then
    raise exception 'Not allowed to remove this file' using errcode = '42501';
  end if;
  if exists (select 1 from public.content_versions where file_id = p_file_id) then
    raise exception 'This file is a content version and stays in the history' using errcode = '22023';
  end if;
  if not private.is_staff() and exists (
    select 1 from public.folders fo where fo.id = v_file.folder_id and fo.kind in ('approved', 'contracts')
  ) then
    raise exception 'Not allowed to remove this file' using errcode = '42501';
  end if;

  update public.files set deleted_at = now() where id = p_file_id;
  update public.content_items set thumbnail_file_id = null where thumbnail_file_id = p_file_id;
  perform private.audit_event('file.removed', 'files', p_file_id::text, v_file.client_id, null, jsonb_build_object('name', v_file.name));
end;
$$;

revoke execute on function public.remove_file(uuid) from public, anon;
grant execute on function public.remove_file(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create or replace function public.get_files_overview()
returns table (
  client_id uuid,
  name text,
  code text,
  logo_url text,
  file_count bigint,
  total_bytes bigint,
  last_upload_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.code, c.logo_url,
         count(f.id), coalesce(sum(f.size_bytes), 0)::bigint, max(f.uploaded_at)
  from public.clients c
  left join public.files f
    on f.client_id = c.id and f.deleted_at is null and f.status = 'uploaded' and f.chat_room_id is null and f.task_id is null
  where c.deleted_at is null
  group by c.id
  order by max(f.uploaded_at) desc nulls last, c.name;
$$;

create or replace function public.get_client_folders(p_client_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  kind public.folder_kind,
  name text,
  visibility public.visibility_level,
  is_system boolean,
  file_count bigint,
  total_bytes bigint,
  last_upload_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select fo.id, fo.parent_id, fo.kind, fo.name, fo.visibility, fo.is_system,
         count(f.id), coalesce(sum(f.size_bytes), 0)::bigint, max(f.uploaded_at)
  from public.folders fo
  left join public.files f on f.folder_id = fo.id and f.deleted_at is null and f.status = 'uploaded'
  where fo.client_id = p_client_id and fo.deleted_at is null
  group by fo.id
  order by fo.is_system desc, fo.kind, fo.name;
$$;

revoke execute on function public.get_files_overview(), public.get_client_folders(uuid) from public, anon;
grant execute on function public.get_files_overview(), public.get_client_folders(uuid) to authenticated;
