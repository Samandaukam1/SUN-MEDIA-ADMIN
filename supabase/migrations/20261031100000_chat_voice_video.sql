-- SUN MEDIA — voice messages and round video messages in the existing chat.
--   * messages.kind: 'text' (every existing row keeps it), 'voice', 'round_video'. Nothing old changes meaning; apps
--     that do not know the kind still see an ordinary message with an audio / video attachment.
--   * files.waveform: the voice message's loudness bars, drawn without downloading the audio. Duration and size in
--     pixels already live on files (complete_file_upload), as do the real size and type read back from storage.
--   * send_media_message: one uploaded audio / video file of the caller in this chat becomes a voice / round video
--     message. It runs as the caller, so the same row-level security as send_message decides who may write (members,
--     not observers, not archived rooms); a retry with the same file returns the message already sent.
--   * discard_chat_upload + a storage delete rule: the caller's own upload that never became a message is removed.
--   * A deleted voice / round video message takes its file with it (only the uploader's own row stays readable).
--   * Voice / video messages cannot be edited; push and chat-list texts name the kind ("🎤 Ovozli xabar").
--   * Limits in app_settings (chat.voice_max_seconds, chat.round_video_max_seconds, chat.media_max_bytes).

alter table public.messages
  add column if not exists kind text not null default 'text' check (kind in ('text', 'voice', 'round_video'));

alter table public.files
  add column if not exists waveform smallint[] check (cardinality(waveform) <= 128);

insert into public.app_settings (key, value, description) values
  ('chat.voice_max_seconds', '600', 'Ovozli xabarning eng uzun davomiyligi (soniya)'),
  ('chat.round_video_max_seconds', '60', 'Dumaloq video xabarning eng uzun davomiyligi (soniya)'),
  ('chat.media_max_bytes', '52428800', 'Ovozli / video xabar faylining eng katta hajmi (bayt)')
on conflict (key) do nothing;

create or replace function private.chat_setting(p_key text, p_default bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key = p_key), p_default);
$$;

-- The bars are written once, by the sender, right before the message exists.
create or replace function private.set_file_waveform(p_file_id uuid, p_waveform smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_waveform is null then
    return;
  end if;
  if cardinality(p_waveform) > 128 or exists (select 1 from unnest(p_waveform) v where v is null or v < 0 or v > 100) then
    raise exception 'Waveform must be up to 128 values between 0 and 100' using errcode = '22023';
  end if;
  update public.files set waveform = p_waveform where id = p_file_id and uploaded_by = auth.uid();
end;
$$;

revoke all on function private.chat_setting(text, bigint) from public, anon;
revoke all on function private.set_file_waveform(uuid, smallint[]) from public, anon;
grant execute on function private.chat_setting(text, bigint) to authenticated;
grant execute on function private.set_file_waveform(uuid, smallint[]) to authenticated;

create or replace function public.send_media_message(
  p_room_id uuid,
  p_file_id uuid,
  p_kind text,
  p_waveform smallint[] default null,
  p_reply_to uuid default null
)
returns public.messages
language plpgsql
set search_path = ''
as $$
declare
  v_message public.messages;
  v_file public.files;
  v_max_ms bigint;
begin
  if p_kind is null or p_kind not in ('voice', 'round_video') then
    raise exception 'Unknown media message kind' using errcode = '22023';
  end if;
  -- One send per file at a time; a retry after a lost answer gets the message that already went out.
  perform pg_advisory_xact_lock(hashtextextended('chat-media:' || p_file_id::text, 0));
  select m.* into v_message
  from public.messages m
  join public.message_attachments a on a.message_id = m.id
  where a.file_id = p_file_id and m.room_id = p_room_id and m.sender_id = auth.uid()
  limit 1;
  if found then
    return v_message;
  end if;

  select * into v_file from public.files
  where id = p_file_id and status = 'uploaded' and chat_room_id = p_room_id and uploaded_by = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Attachments must be your uploaded files in this chat' using errcode = '22023';
  end if;
  if (p_kind = 'voice' and (v_file.kind <> 'audio' or split_part(v_file.mime_type, ';', 1) not in ('audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/mpeg', 'audio/webm', 'audio/ogg')))
     or (p_kind = 'round_video' and (v_file.kind <> 'video' or split_part(v_file.mime_type, ';', 1) not in ('video/mp4', 'video/webm', 'video/quicktime'))) then
    raise exception 'This file cannot be a % message', p_kind using errcode = '22023';
  end if;
  if v_file.size_bytes is null or v_file.size_bytes <= 0 or v_file.size_bytes > private.chat_setting('chat.media_max_bytes', 52428800) then
    raise exception 'Media message is too large' using errcode = '22023';
  end if;
  -- The recorder's own clock; a couple of seconds of slack for the encoder's tail.
  v_max_ms := 1000 * private.chat_setting(case when p_kind = 'voice' then 'chat.voice_max_seconds' else 'chat.round_video_max_seconds' end, case when p_kind = 'voice' then 600 else 60 end) + 3000;
  if v_file.duration_ms is null or v_file.duration_ms < 300 or v_file.duration_ms > v_max_ms then
    raise exception 'Media message duration is out of range' using errcode = '22023';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and room_id = p_room_id) then
    raise exception 'Reply target is not in this chat' using errcode = '22023';
  end if;

  if p_kind = 'voice' then
    perform private.set_file_waveform(p_file_id, p_waveform);
  end if;
  -- As the caller: "send messages to my rooms" and the observer rules apply exactly as for text.
  insert into public.messages (room_id, sender_id, body, reply_to_id, kind)
  values (p_room_id, auth.uid(), '', p_reply_to, p_kind)
  returning * into v_message;
  insert into public.message_attachments (message_id, file_id) values (v_message.id, p_file_id);
  return v_message;
end;
$$;

revoke all on function public.send_media_message(uuid, uuid, text, smallint[], uuid) from public, anon;
grant execute on function public.send_media_message(uuid, uuid, text, smallint[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- An upload that never became a message (the person gave up after a failed send): gone, file and object.
-- ---------------------------------------------------------------------------
create or replace function private.is_unsent_chat_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.files f
    where f.bucket = 'chat-attachments' and f.storage_path = p_name
      and f.uploaded_by = (select auth.uid())
      and not exists (select 1 from public.message_attachments a where a.file_id = f.id)
  );
$$;

revoke all on function private.is_unsent_chat_upload(text) from public, anon;
grant execute on function private.is_unsent_chat_upload(text) to authenticated;

create policy "sunmedia discard own unsent chat uploads" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-attachments' and private.is_unsent_chat_upload(name));

create or replace function public.discard_chat_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.files set deleted_at = now()
  where id = p_file_id and uploaded_by = auth.uid() and chat_room_id is not null and deleted_at is null
    and not exists (select 1 from public.message_attachments a where a.file_id = p_file_id);
end;
$$;

revoke all on function public.discard_chat_upload(uuid) from public, anon;
grant execute on function public.discard_chat_upload(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Voice / video messages: no text, no editing; deleting the message retires its recording.
-- ---------------------------------------------------------------------------
create or replace function private.messages_media_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'text' then
      new.body := '';
    end if;
  elsif old.kind <> 'text' and new.deleted_at is null and new.body is distinct from old.body then
    raise exception 'Voice and video messages cannot be edited' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger messages_20_media_guard
  before insert or update on public.messages
  for each row execute function private.messages_media_guard();

create or replace function private.messages_media_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.files f set deleted_at = now()
  where f.deleted_at is null
    and f.id in (select a.file_id from public.message_attachments a where a.message_id = new.id)
    and not exists (select 1 from public.message_attachments o where o.file_id = f.id and o.message_id <> new.id);
  return null;
end;
$$;

create trigger messages_media_deleted
  after update of deleted_at on public.messages
  for each row when (new.deleted_at is not null and old.deleted_at is null and new.kind <> 'text')
  execute function private.messages_media_deleted();

-- ---------------------------------------------------------------------------
-- Push and chat lists: the kind instead of "📎 Fayl" (same types, recipients, mute and privacy rules).
-- ---------------------------------------------------------------------------
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
  v_text := case
    when new.kind = 'voice' then case when v_room.kind = 'direct' then '🎤 Sizga ovozli xabar yuborildi.' else '🎤 Ovozli xabar' end
    when new.kind = 'round_video' then case when v_room.kind = 'direct' then '📹 Sizga video xabar yuborildi.' else '📹 Video xabar' end
    when new.body = '' then '📎 Fayl'
    else left(new.body, 200)
  end;
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
    jsonb_build_object(
      'route', '/chat/' || new.room_id,
      'message_id', new.id,
      'push_category', case when v_room.kind = 'direct' then 'chat.direct' else 'chat.group' end
    ),
    'chat_rooms', new.room_id, v_room.client_id,
    case when new.is_directive then 'high' when v_room.kind = 'direct' then 'normal' else 'low' end::public.notification_priority
  );
  return null;
end;
$$;

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
           case when m.deleted_at is not null then '' when m.kind = 'voice' then '🎤 Ovozli xabar' when m.kind = 'round_video' then '📹 Video xabar' else m.body end as body,
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
    case when lm.deleted_at is not null then '' when lm.kind = 'voice' then '🎤 Ovozli xabar' when lm.kind = 'round_video' then '📹 Video xabar' else lm.body end,
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
    select m.id, m.body, m.kind, m.created_at, m.sender_id, m.deleted_at
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
