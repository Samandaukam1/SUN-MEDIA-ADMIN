-- SUN MEDIA — push polish.
--   * Chat pushes read like a messenger: a direct message is titled with the sender and makes a
--     sound; group / project rooms keep the room as title and arrive quietly.
--   * The push badge matches the app's INBOX badge: unread notifications plus rooms with unread
--     chat (not every single chat message).

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
       and (m.muted_until is null or m.muted_until < now())),
    'chat.message',
    case when v_room.kind = 'direct' then coalesce(v_sender, 'SUN MEDIA') else v_room.name end,
    case when v_room.kind = 'direct' then v_text else coalesce(v_sender, 'SUN MEDIA') || ': ' || v_text end,
    jsonb_build_object('route', '/chat/' || new.room_id),
    'chat_rooms', new.room_id, v_room.client_id,
    case when v_room.kind = 'direct' then 'normal' else 'low' end::public.notification_priority
  );
  return null;
end;
$$;

create or replace function private.unread_badge(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.notifications n where n.user_id = p_user and n.read_at is null and n.type <> 'chat.message')
    + (select count(distinct n.entity_id) from public.notifications n where n.user_id = p_user and n.read_at is null and n.type = 'chat.message')
  )::integer;
$$;

create or replace function public.claim_push_deliveries(p_limit integer default 100)
returns table (
  delivery_id bigint,
  token text,
  title text,
  body text,
  data jsonb,
  priority public.notification_priority,
  badge integer
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1,
        next_attempt_at = now() + make_interval(mins => least(60, 2 ^ d.attempts)::integer)
    where d.id in (
      select id from public.notification_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by id
      limit least(greatest(p_limit, 1), 500)
      for update skip locked
    )
    returning d.id, d.notification_id, d.push_token_id
  )
  select c.id, t.token, n.title, n.body,
         n.data || jsonb_build_object('notification_id', n.id, 'type', n.type),
         n.priority,
         private.unread_badge(n.user_id)
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_tokens t on t.id = c.push_token_id;
$$;

revoke all on function public.claim_push_deliveries(integer) from public, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
revoke all on function private.unread_badge(uuid) from public, authenticated;
