-- Rahbar = the senior operational manager (no longer an observer): writes to clients and the team, gives
-- directives ("Rahbar topshirig‘i"), manages tasks, shootings, content and projects. Daily attendance stays with
-- the Admin (the Rahbar keeps read access only). Additive; historical messages are untouched.

-- ---------------------------------------------------------------------------
-- Permissions of both leadership roles (owner = Rahbar, director)
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'tasks.manage', 'shootings.manage', 'content.manage', 'content.edit_copy', 'publications.manage',
  'projects.manage', 'approvals.manage', 'chat.manage', 'files.upload'
)
where r.key in ('owner', 'director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Client threads: Admin and Rahbar both answer the client (same "SUN MEDIA" conversation)
-- ---------------------------------------------------------------------------
create or replace function private.client_room_staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ur.user_id), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key in ('admin', 'owner', 'director')
  join public.profiles p on p.id = ur.user_id and p.deleted_at is null;
$$;

create or replace function private.sync_admin_client_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'user_roles' then
    if (select key from public.roles where id = new.role_id) in ('admin', 'owner', 'director') then
      insert into public.chat_members (room_id, user_id)
      select r.id, new.user_id from public.chat_rooms r where r.kind = 'project' and r.is_default
      on conflict do nothing;
    end if;
  elsif new.kind = 'project' and new.is_default then
    insert into public.chat_members (room_id, user_id)
    select new.id, a from unnest(private.client_room_staff_ids()) a
    on conflict do nothing;
  end if;
  return null;
end;
$$;

-- Existing Rahbar accounts join the existing client threads.
insert into public.chat_members (room_id, user_id)
select r.id, u
from public.chat_rooms r, unnest(private.client_room_staff_ids()) u
where r.kind = 'project' and r.is_default
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Who wrote it (the client sees "Rahbar" / "Admin") and Rahbar directives in team chats
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists sender_label text check (sender_label in ('Rahbar', 'Admin', 'SUN MEDIA')),
  add column if not exists is_directive boolean not null default false;

create or replace function private.is_leadership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('owner') or private.has_role('director') or private.has_role('system_owner');
$$;

grant execute on function private.is_leadership() to authenticated;

create or replace function private.messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.chat_room_kind;
begin
  if tg_op = 'INSERT' then
    if not private.is_privileged_context() then
      new.sender_id := auth.uid();
      new.is_system := false;
      select kind into v_kind from public.chat_rooms where id = new.room_id;
      new.sender_label := case
        when private.is_leadership() then 'Rahbar'
        when private.has_role('admin') then 'Admin'
        when v_kind = 'project' and private.is_staff() then 'SUN MEDIA'
      end;
      if new.is_directive and not (private.is_leadership() and v_kind in ('internal', 'direct')) then
        raise exception 'Only the Rahbar gives directives, in team chats' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  -- Authorship marks never change after sending.
  new.sender_label := old.sender_label;
  new.is_directive := old.is_directive;
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '';
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop function if exists public.send_message(uuid, text, uuid, uuid[]);

create function public.send_message(
  p_room_id uuid, p_body text, p_reply_to uuid default null, p_file_ids uuid[] default '{}', p_directive boolean default false
)
returns public.messages
language plpgsql
set search_path = ''
as $$
declare
  v_message public.messages;
  v_body text := coalesce(trim(p_body), '');
  v_files uuid[] := coalesce(p_file_ids, '{}');
begin
  if v_body = '' and cardinality(v_files) = 0 then
    raise exception 'Write a message or attach a file' using errcode = '22023';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Message is too long' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_files) f
    where not exists (
      select 1 from public.files x
      where x.id = f and x.status = 'uploaded' and x.chat_room_id = p_room_id and x.uploaded_by = auth.uid()
    )
  ) then
    raise exception 'Attachments must be your uploaded files in this chat' using errcode = '22023';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and room_id = p_room_id) then
    raise exception 'Reply target is not in this chat' using errcode = '22023';
  end if;

  insert into public.messages (room_id, sender_id, body, reply_to_id, is_directive)
  values (p_room_id, auth.uid(), v_body, p_reply_to, coalesce(p_directive, false))
  returning * into v_message;
  insert into public.message_attachments (message_id, file_id) select v_message.id, f from unnest(v_files) f;
  return v_message;
end;
$$;

revoke all on function public.send_message(uuid, text, uuid, uuid[], boolean) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid[], boolean) to authenticated;

-- A directive reaches everyone in the room as a high-priority notification; other messages stay as before.
create or replace function private.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chat_rooms;
  v_sender text;
  v_text text;
begin
  if new.is_system then
    return null;
  end if;
  select * into v_room from public.chat_rooms where id = new.room_id;
  select full_name into v_sender from public.profiles where id = new.sender_id;
  v_text := case when new.body = '' then '📎 Fayl' else left(new.body, 200) end;
  perform private.notify(
    (select coalesce(array_agg(m.user_id), '{}') from public.chat_members m
     where m.room_id = new.room_id and m.user_id <> new.sender_id
       and (new.is_directive or m.muted_until is null or m.muted_until < now())),
    case when new.is_directive then 'chat.directive' else 'chat.message' end,
    case
      when new.is_directive then 'Rahbar topshirig‘i'
      when v_room.kind = 'direct' then coalesce(v_sender, 'SUN MEDIA')
      else v_room.name
    end,
    case when v_room.kind = 'direct' and not new.is_directive then v_text else coalesce(v_sender, 'SUN MEDIA') || ': ' || v_text end,
    jsonb_build_object('route', '/chat/' || new.room_id),
    'chat_rooms', new.room_id, v_room.client_id,
    case when new.is_directive then 'high' when v_room.kind = 'direct' then 'normal' else 'low' end::public.notification_priority
  );
  return null;
end;
$$;
