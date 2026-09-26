-- SUN MEDIA — inbox & chat.
--   * get_my_chats: every room I belong to with its last message and my unread count.
--   * mark_chat_read: moves my read marker and clears that room's chat notifications.
--   * open_direct_chat: one private room per pair of staff members, created on first use.
--   * create_group_chat: staff group rooms with chosen colleagues; the creator administers it.
--   * send_message: text plus already-uploaded attachments in one step, under the caller's RLS.
--   * get_inbox_counts: one call for the INBOX tab badge.

create or replace function public.get_my_chats()
returns table (
  room_id uuid,
  kind public.chat_room_kind,
  name text,
  description text,
  client_id uuid,
  client_name text,
  client_code text,
  client_logo text,
  is_default boolean,
  archived boolean,
  muted boolean,
  member_count integer,
  peer_id uuid,
  peer_name text,
  peer_avatar text,
  last_message_id uuid,
  last_message_body text,
  last_message_at timestamptz,
  last_sender_id uuid,
  last_sender_name text,
  last_is_system boolean,
  last_has_files boolean,
  unread_count integer,
  last_read_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id, r.kind, r.name, r.description, r.client_id, c.name, c.code, c.logo_url,
    r.is_default, r.archived_at is not null, coalesce(me.muted_until > now(), false),
    (select count(*)::integer from public.chat_members m where m.room_id = r.id),
    peer.id, peer.full_name, peer.avatar_url,
    lm.id, lm.body, lm.created_at, lm.sender_id, sp.full_name, lm.is_system, lm.has_files,
    (select count(*)::integer from public.messages x
     where x.room_id = r.id and x.created_at > me.last_read_at
       and x.sender_id is distinct from me.user_id and x.deleted_at is null),
    me.last_read_at
  from public.chat_members me
  join public.chat_rooms r on r.id = me.room_id
  left join public.clients c on c.id = r.client_id
  left join lateral (
    select p.id, p.full_name, p.avatar_url
    from public.chat_members o
    join public.profiles p on p.id = o.user_id
    where r.kind = 'direct' and o.room_id = r.id and o.user_id <> me.user_id
    limit 1
  ) peer on true
  left join lateral (
    select m.id,
           case when m.deleted_at is not null then '' else m.body end as body,
           m.created_at, m.sender_id, m.is_system,
           exists (select 1 from public.message_attachments a where a.message_id = m.id) as has_files
    from public.messages m
    where m.room_id = r.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join public.profiles sp on sp.id = lm.sender_id
  where me.user_id = (select auth.uid())
    and r.id = any ((select private.my_chat_room_ids())::uuid[])
  order by coalesce(lm.created_at, r.created_at) desc;
$$;

create or replace function public.mark_chat_read(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (p_room_id = any (private.my_chat_room_ids())) then
    raise exception 'Not a member of this chat' using errcode = '42501';
  end if;
  update public.chat_members set last_read_at = now() where room_id = p_room_id and user_id = auth.uid();
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and type = 'chat.message' and entity_id = p_room_id;
end;
$$;

create or replace function public.open_direct_chat(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  if auth.uid() is null or not private.is_staff() then
    raise exception 'Direct messages are for SUN MEDIA staff' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Choose a colleague' using errcode = '22023';
  end if;
  if not private.user_is_staff(p_user_id)
     or not exists (select 1 from public.profiles where id = p_user_id and status = 'active' and deleted_at is null) then
    raise exception 'Choose an active colleague' using errcode = '22023';
  end if;

  select r.id into v_room
  from public.chat_rooms r
  where r.kind = 'direct'
    and exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = auth.uid())
    and exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = p_user_id)
    and (select count(*) from public.chat_members m where m.room_id = r.id) = 2
  order by r.created_at
  limit 1;
  if v_room is not null then
    return v_room;
  end if;

  insert into public.chat_rooms (kind, name, created_by) values ('direct', 'Shaxsiy', auth.uid()) returning id into v_room;
  insert into public.chat_members (room_id, user_id) values (v_room, auth.uid()), (v_room, p_user_id);
  return v_room;
end;
$$;

create or replace function public.create_group_chat(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_members uuid[];
begin
  if auth.uid() is null or not private.is_staff() then
    raise exception 'Group chats are for SUN MEDIA staff' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(p_name)), 0) = 0 or char_length(trim(p_name)) > 120 then
    raise exception 'Name must be 1–120 characters' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_members
  from unnest(coalesce(p_member_ids, '{}')) u
  where u <> auth.uid();
  if cardinality(v_members) = 0 then
    raise exception 'Add at least one colleague' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_members) u
    where not private.user_is_staff(u)
       or not exists (select 1 from public.profiles p where p.id = u and p.status = 'active' and p.deleted_at is null)
  ) then
    raise exception 'Only active SUN MEDIA staff can join a group chat' using errcode = '22023';
  end if;

  insert into public.chat_rooms (kind, name, created_by) values ('internal', trim(p_name), auth.uid()) returning id into v_room;
  insert into public.chat_members (room_id, user_id, is_admin) values (v_room, auth.uid(), true);
  insert into public.chat_members (room_id, user_id) select v_room, u from unnest(v_members) u;
  insert into public.messages (room_id, sender_id, body, is_system)
  values (v_room, auth.uid(), (select full_name from public.profiles where id = auth.uid()) || ' guruh yaratdi', true);
  return v_room;
end;
$$;

-- Runs as the caller: the messages / message_attachments policies decide.
create or replace function public.send_message(
  p_room_id uuid,
  p_body text,
  p_reply_to uuid default null,
  p_file_ids uuid[] default '{}'
)
returns public.messages
language plpgsql
security invoker
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

  insert into public.messages (room_id, sender_id, body, reply_to_id)
  values (p_room_id, auth.uid(), v_body, p_reply_to)
  returning * into v_message;
  insert into public.message_attachments (message_id, file_id) select v_message.id, f from unnest(v_files) f;
  return v_message;
end;
$$;

create or replace function public.get_inbox_counts()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_approvals jsonb := public.get_approval_counts();
begin
  return jsonb_build_object(
    'chat_unread', coalesce((
      select sum(c.unread_count) from public.get_my_chats() c where not c.muted and not c.archived
    ), 0),
    'chat_rooms_unread', (
      select count(*) from public.get_my_chats() c where c.unread_count > 0 and not c.muted and not c.archived
    ),
    'notifications_unread', (
      select count(*) from public.notifications n
      where n.user_id = auth.uid() and n.read_at is null and n.type <> 'chat.message'
    ),
    'approvals', (v_approvals ->> 'to_review')::integer + (v_approvals ->> 'my_revisions')::integer
  );
end;
$$;

revoke execute on function
  public.get_my_chats(),
  public.mark_chat_read(uuid),
  public.open_direct_chat(uuid),
  public.create_group_chat(text, uuid[]),
  public.send_message(uuid, text, uuid, uuid[]),
  public.get_inbox_counts()
from public, anon;
grant execute on function
  public.get_my_chats(),
  public.mark_chat_read(uuid),
  public.open_direct_chat(uuid),
  public.create_group_chat(text, uuid[]),
  public.send_message(uuid, text, uuid, uuid[]),
  public.get_inbox_counts()
to authenticated;
