-- SUN MEDIA — chat rooms, per-client folders, file registry, Supabase Storage buckets and policies.

-- ---------------------------------------------------------------------------
-- Chat rooms & members
-- ---------------------------------------------------------------------------
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind public.chat_room_kind not null,
  client_id uuid references public.clients (id) on delete cascade,
  project_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  is_default boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, client_id) references public.projects (id, client_id),
  -- Project chats belong to a client; internal/direct chats never do.
  check ((kind = 'project' and client_id is not null) or (kind <> 'project' and client_id is null and project_id is null))
);

create unique index chat_rooms_default_project_idx on public.chat_rooms (client_id) where is_default and kind = 'project';
create unique index chat_rooms_default_internal_idx on public.chat_rooms (kind) where is_default and kind = 'internal';

create trigger chat_rooms_updated_at
  before update on public.chat_rooms
  for each row execute function private.set_updated_at();

create table public.chat_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  last_read_at timestamptz not null default now(),
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

create or replace function private.my_chat_room_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_active_user() then '{}'::uuid[] else
    (select coalesce(array_agg(cm.room_id), '{}')
     from public.chat_members cm
     join public.chat_rooms r on r.id = cm.room_id
     where cm.user_id = (select auth.uid())
       and (r.client_id is null or r.client_id = any (private.accessible_client_ids()) or private.sees_all_clients()))
  end;
$$;

create or replace function private.can_manage_room(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_rooms r
    where r.id = p_room
      and (
        (r.kind = 'project' and private.can_manage_client(r.client_id, 'clients.manage'))
        or (r.kind <> 'project' and private.is_staff() and (
          r.created_by = (select auth.uid())
          or exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = (select auth.uid()) and m.is_admin)
          or private.has_permission('chat.manage')
        ))
      )
  );
$$;

grant execute on function private.my_chat_room_ids(), private.can_manage_room(uuid) to authenticated;

-- Client users may only join their own company's project rooms; internal rooms are staff-only.
create or replace function private.guard_chat_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chat_rooms;
begin
  select * into v_room from public.chat_rooms where id = new.room_id;
  if private.user_is_staff(new.user_id) then
    return new;
  end if;
  if v_room.kind <> 'project' then
    raise exception 'Client users cannot join internal chats' using errcode = '42501';
  end if;
  if not exists (select 1 from public.client_members where client_id = v_room.client_id and user_id = new.user_id) then
    raise exception 'User is not a member of this client' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger chat_members_guard
  before insert or update on public.chat_members
  for each row execute function private.guard_chat_members();

-- ---------------------------------------------------------------------------
-- Folders
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  kind public.folder_kind not null default 'custom',
  name text not null check (char_length(name) between 1 and 120),
  visibility public.visibility_level not null default 'client',
  is_system boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique nulls not distinct (client_id, parent_id, name)
);

create unique index folders_system_kind_idx on public.folders (client_id, kind) where is_system;

create trigger folders_updated_at
  before update on public.folders
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  content_id uuid,
  chat_room_id uuid references public.chat_rooms (id) on delete cascade,
  bucket text,
  storage_path text,
  external_url text,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  kind public.file_kind not null default 'other',
  duration_ms integer check (duration_ms >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  visibility public.visibility_level not null default 'internal',
  status public.file_status not null default 'pending',
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, storage_path),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete set null (content_id),
  check ((bucket is not null and storage_path is not null) or external_url is not null)
);

create index files_client_folder_idx on public.files (client_id, folder_id) where deleted_at is null;
create index files_content_idx on public.files (content_id) where content_id is not null;
create index files_room_idx on public.files (chat_room_id) where chat_room_id is not null;
create index files_pending_idx on public.files (created_at) where status = 'pending';

create trigger files_updated_at
  before update on public.files
  for each row execute function private.set_updated_at();

alter table public.content_items
  add constraint content_items_thumbnail_file_fk
  foreign key (thumbnail_file_id) references public.files (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  reply_to_id uuid references public.messages (id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index messages_room_created_idx on public.messages (room_id, created_at desc);

create table public.message_attachments (
  message_id uuid not null references public.messages (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  primary key (message_id, file_id)
);

create or replace function private.messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_privileged_context() then
      new.sender_id := auth.uid();
      new.is_system := false;
    end if;
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '';
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_10_before_write
  before insert or update on public.messages
  for each row execute function private.messages_before_write();

create or replace function private.messages_touch_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id;
  update public.chat_members set last_read_at = new.created_at
  where room_id = new.room_id and user_id = new.sender_id;
  return null;
end;
$$;

create trigger messages_touch_room
  after insert on public.messages
  for each row execute function private.messages_touch_room();

-- ---------------------------------------------------------------------------
-- Automatic provisioning: every client gets system folders and a project chat
-- ---------------------------------------------------------------------------
create or replace function private.provision_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.folders (client_id, kind, name, visibility, is_system, created_by)
  values
    (new.id, 'raw', 'RAW', 'internal', true, new.created_by),
    (new.id, 'edited', 'EDITED', 'internal', true, new.created_by),
    (new.id, 'approved', 'APPROVED', 'client', true, new.created_by),
    (new.id, 'logos', 'LOGOS', 'client', true, new.created_by),
    (new.id, 'brandbook', 'BRANDBOOK', 'client', true, new.created_by),
    (new.id, 'music', 'MUSIC', 'client', true, new.created_by),
    (new.id, 'photos', 'PHOTOS', 'client', true, new.created_by),
    (new.id, 'documents', 'DOCUMENTS', 'client', true, new.created_by),
    (new.id, 'contracts', 'CONTRACTS', 'client', true, new.created_by);

  insert into public.chat_rooms (kind, client_id, name, is_default, created_by)
  values ('project', new.id, new.name, true, new.created_by);
  return null;
end;
$$;

create trigger clients_provision
  after insert on public.clients
  for each row execute function private.provision_client();

-- Client users and their account/project/SMM managers join the client's default project chat.
create or replace function private.sync_project_chat_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_room uuid;
  v_client uuid := (v_row ->> 'client_id')::uuid;
  v_user uuid := (v_row ->> 'user_id')::uuid;
begin
  if tg_table_name = 'client_team_members'
     and v_row ->> 'team_role' not in ('account_manager', 'project_manager', 'smm_manager') then
    return null;
  end if;
  select id into v_room from public.chat_rooms where client_id = v_client and kind = 'project' and is_default;
  if v_room is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.chat_members (room_id, user_id) values (v_room, v_user) on conflict do nothing;
  elsif tg_op = 'DELETE' then
    if tg_table_name = 'client_members'
       or not exists (
         select 1 from public.client_team_members
         where client_id = v_client and user_id = v_user
           and team_role in ('account_manager', 'project_manager', 'smm_manager')
       ) then
      delete from public.chat_members where room_id = v_room and user_id = v_user;
    end if;
  end if;
  return null;
end;
$$;

create trigger client_members_sync_chat
  after insert or delete on public.client_members
  for each row execute function private.sync_project_chat_member();
create trigger client_team_members_sync_chat
  after insert or delete on public.client_team_members
  for each row execute function private.sync_project_chat_member();

-- Every staff member joins the default internal SUN MEDIA chat.
create or replace function private.sync_internal_chat_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  select id into v_room from public.chat_rooms where kind = 'internal' and is_default;
  if v_room is not null and (select scope from public.roles where id = new.role_id) = 'staff' then
    insert into public.chat_members (room_id, user_id) values (v_room, new.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger user_roles_sync_internal_chat
  after insert on public.user_roles
  for each row execute function private.sync_internal_chat_member();

-- ---------------------------------------------------------------------------
-- Upload RPCs
-- ---------------------------------------------------------------------------
create or replace function private.file_kind_from_mime(p_mime text)
returns public.file_kind
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mime like 'video/%' then 'video'
    when p_mime like 'image/%' then 'image'
    when p_mime like 'audio/%' then 'audio'
    when p_mime = 'application/pdf' then 'pdf'
    when p_mime in ('application/zip', 'application/x-zip-compressed') then 'archive'
    when p_mime in (
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'text/plain', 'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) then 'document'
    else 'other'
  end::public.file_kind;
$$;

create or replace function public.create_file_upload(
  p_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_client_id uuid default null,
  p_folder_id uuid default null,
  p_content_id uuid default null,
  p_chat_room_id uuid default null
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
  v_is_staff boolean := private.is_staff();
  v_max bigint := coalesce((select (value #>> '{}')::bigint from public.app_settings where key = 'uploads.max_file_bytes'), 52428800);
  v_kind public.file_kind := private.file_kind_from_mime(p_mime_type);
  v_bucket text;
  v_visibility public.visibility_level;
  v_id uuid := gen_random_uuid();
  v_safe_name text := left(regexp_replace(coalesce(p_name, 'file'), '[^A-Za-z0-9._-]+', '_', 'g'), 120);
begin
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

create or replace function public.complete_file_upload(
  p_file_id uuid,
  p_duration_ms integer default null,
  p_width integer default null,
  p_height integer default null
)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_object storage.objects;
begin
  select * into v_file from public.files where id = p_file_id for update;
  if not found or v_file.uploaded_by is distinct from auth.uid() then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if v_file.status = 'uploaded' then
    return v_file;
  end if;
  select * into v_object from storage.objects where bucket_id = v_file.bucket and name = v_file.storage_path;
  if not found then
    raise exception 'Upload has not reached storage yet' using errcode = 'P0002';
  end if;

  update public.files
  set status = 'uploaded',
      uploaded_at = now(),
      size_bytes = coalesce((v_object.metadata ->> 'size')::bigint, size_bytes),
      mime_type = coalesce(v_object.metadata ->> 'mimetype', mime_type),
      duration_ms = coalesce(p_duration_ms, duration_ms),
      width = coalesce(p_width, width),
      height = coalesce(p_height, height)
  where id = p_file_id
  returning * into v_file;
  return v_file;
end;
$$;

-- External links (e.g. raw footage on a shared drive) registered without uploading.
create or replace function public.register_external_file(
  p_client_id uuid,
  p_folder_id uuid,
  p_name text,
  p_external_url text,
  p_content_id uuid default null
)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_folder public.folders;
begin
  if not private.can_manage_client(p_client_id, 'files.upload') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_external_url !~ '^https://' then
    raise exception 'Only https links are allowed' using errcode = '22023';
  end if;
  select * into v_folder from public.folders where id = p_folder_id and client_id = p_client_id;
  insert into public.files (client_id, folder_id, content_id, external_url, name, visibility, status, uploaded_by, uploaded_at)
  values (p_client_id, p_folder_id, p_content_id, p_external_url, p_name,
          coalesce(v_folder.visibility, 'internal'), 'uploaded', auth.uid(), now())
  returning * into v_file;
  return v_file;
end;
$$;

grant execute on function
  public.create_file_upload(text, text, bigint, uuid, uuid, uuid, uuid),
  public.complete_file_upload(uuid, integer, integer, integer),
  public.register_external_file(uuid, uuid, text, text, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('client-files', 'client-files', false, 5368709120, array[
    'video/*', 'image/*', 'audio/*', 'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]),
  ('chat-attachments', 'chat-attachments', false, 524288000, array[
    'video/*', 'image/*', 'audio/*', 'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]),
  ('reports', 'reports', false, 52428800, array['application/pdf']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Object access mirrors the files table: the subquery runs under the caller's RLS on public.files.
create policy "sunmedia read registered files" on storage.objects
  for select to authenticated using (
    bucket_id in ('client-files', 'chat-attachments')
    and exists (
      select 1 from public.files f
      where f.bucket = storage.objects.bucket_id and f.storage_path = storage.objects.name
    )
  );

create policy "sunmedia upload registered files" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('client-files', 'chat-attachments')
    and exists (
      select 1 from public.files f
      where f.bucket = storage.objects.bucket_id
        and f.storage_path = storage.objects.name
        and f.status = 'pending'
        and f.uploaded_by = (select auth.uid())
    )
  );

create policy "sunmedia delete managed files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'client-files'
    and exists (
      select 1 from public.files f
      where f.bucket = storage.objects.bucket_id
        and f.storage_path = storage.objects.name
        and private.can_manage_client(f.client_id, 'files.manage')
    )
  );

create policy "sunmedia avatars upload own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "sunmedia avatars update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sunmedia avatars delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_row();
create trigger audit_folders after insert or update or delete on public.folders
  for each row execute function private.audit_row();
create trigger audit_chat_members after insert or delete on public.chat_members
  for each row execute function private.audit_row('room_id', 'user_id');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

-- chat_rooms
create policy "read my rooms" on public.chat_rooms
  for select to authenticated using (
    id = any ((select private.my_chat_room_ids())::uuid[])
    or (kind = 'project' and (select private.sees_all_clients()))
    or created_by = (select auth.uid())
  );
create policy "staff create rooms" on public.chat_rooms
  for insert to authenticated with check (
    (select private.is_staff())
    and (
      (kind = 'project' and private.can_manage_client(client_id, 'clients.manage'))
      or kind in ('internal', 'direct')
    )
  );
create policy "room managers update rooms" on public.chat_rooms
  for update to authenticated
  using (private.can_manage_room(id))
  with check (private.can_manage_room(id));

-- chat_members
create policy "read members of my rooms" on public.chat_members
  for select to authenticated using (
    room_id = any ((select private.my_chat_room_ids())::uuid[]) or private.can_manage_room(room_id)
  );
create policy "room managers add members" on public.chat_members
  for insert to authenticated with check (private.can_manage_room(room_id));
create policy "room managers remove members" on public.chat_members
  for delete to authenticated using (private.can_manage_room(room_id) or user_id = (select auth.uid()));
create policy "members update own membership" on public.chat_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke update on public.chat_members from authenticated;
grant update (last_read_at, muted_until) on public.chat_members to authenticated;

-- messages
create policy "read messages in my rooms" on public.messages
  for select to authenticated using (room_id = any ((select private.my_chat_room_ids())::uuid[]));
create policy "send messages to my rooms" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and room_id = any ((select private.my_chat_room_ids())::uuid[])
    and exists (select 1 from public.chat_rooms r where r.id = room_id and r.archived_at is null)
  );
create policy "edit own messages" on public.messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and deleted_at is null)
  with check (sender_id = (select auth.uid()));
revoke update on public.messages from authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

create policy "read attachments" on public.message_attachments
  for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id));
create policy "attach own files" on public.message_attachments
  for insert to authenticated with check (
    exists (
      select 1 from public.messages m
      join public.files f on f.id = file_id
      where m.id = message_id
        and m.sender_id = (select auth.uid())
        and f.uploaded_by = (select auth.uid())
        and f.chat_room_id = m.room_id
    )
  );

-- folders
create policy "read folders" on public.folders
  for select to authenticated using (
    deleted_at is null
    and (
      (select private.sees_all_clients())
      or client_id = any ((select private.staff_client_ids())::uuid[])
      or (client_id = any ((select private.work_client_ids())::uuid[]) and kind <> 'contracts')
      or (client_id = any ((select private.member_client_ids())::uuid[]) and visibility = 'client')
    )
  );
create policy "manage folders" on public.folders
  for insert to authenticated with check (private.can_manage_client(client_id, 'files.manage') and not is_system);
create policy "update folders" on public.folders
  for update to authenticated
  using (private.can_manage_client(client_id, 'files.manage') and not is_system)
  with check (private.can_manage_client(client_id, 'files.manage') and not is_system);

-- files (rows are created only through create_file_upload / register_external_file)
create policy "read files" on public.files
  for select to authenticated using (
    uploaded_by = (select auth.uid())
    or (
      (deleted_at is null or (select private.has_permission('files.manage')))
      and (
        (chat_room_id is not null and chat_room_id = any ((select private.my_chat_room_ids())::uuid[]))
        or (
          chat_room_id is null
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
          and client_id = any ((select private.member_client_ids())::uuid[])
          and visibility = 'client'
          and status = 'uploaded'
          and deleted_at is null
        )
      )
    )
  );
create policy "managers update files" on public.files
  for update to authenticated
  using (client_id is not null and private.can_manage_client(client_id, 'files.manage'))
  with check (client_id is not null and private.can_manage_client(client_id, 'files.manage'));
revoke insert, delete on public.files from authenticated;
revoke update on public.files from authenticated;
grant update (name, folder_id, visibility, content_id, deleted_at) on public.files to authenticated;
