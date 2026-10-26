-- SUN MEDIA — Web Push for the installed web app (PWA) on iPhone, iPad, Android, Windows and macOS.
--
-- A browser's push subscription is one more device in push_tokens (platform 'web': the endpoint is the token, with
-- its two encryption keys), so every existing notification — chat, tasks, content, deadlines — reaches it through the
-- same queue (notify → notification_deliveries → push-dispatch) as the mobile app. Added here:
--   * per-person push settings: hidden previews (also on the phone app) and quiet hours;
--   * separate push switches for group and personal chats, without a new notification type (the app relies on
--     'chat.message');
--   * notifications for a task's new deadline and its cancellation;
--   * the click on a notification, recorded apart from "read".
-- Deploy order: the push-dispatch function first (it understands both the old and the new claim), then this file.

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------
alter table public.push_tokens drop constraint push_tokens_platform_check;
alter table public.push_tokens drop constraint push_tokens_token_check;
alter table public.push_tokens
  add column p256dh text,
  add column auth_secret text,
  add column user_agent text,
  add column last_success_at timestamptz,
  add column last_error text,
  add column failure_count integer not null default 0;
alter table public.push_tokens add constraint push_tokens_device_check check (
  (platform in ('ios', 'android') and token ~ '^Expo(nent)?PushToken\[.+\]$' and p256dh is null and auth_secret is null)
  or (
    platform = 'web'
    and token ~ '^https://[^[:space:]]+$' and char_length(token) <= 1024
    -- P-256 public key (65 bytes) and the 16-byte auth secret, base64url without padding.
    and p256dh ~ '^[A-Za-z0-9_-]{86,88}$' and auth_secret ~ '^[A-Za-z0-9_-]{21,24}$'
  )
);

alter table public.notifications add column clicked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.push_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Lock screens show "Sun Media — Yangi xabar" instead of who wrote what.
  hide_preview boolean not null default false,
  -- Agency time (Tashkent). No push in this window except high-priority ones (a director's order, overdue work).
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  constraint push_settings_quiet_check check ((quiet_start is null) = (quiet_end is null) and (quiet_start is null or quiet_start <> quiet_end))
);

create trigger push_settings_updated_at
  before update on public.push_settings
  for each row execute function private.set_updated_at();

alter table public.push_settings enable row level security;
create policy "own push settings" on public.push_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "create own push settings" on public.push_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own push settings" on public.push_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.in_quiet_hours(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when s.quiet_start < s.quiet_end then x.t >= s.quiet_start and x.t < s.quiet_end
      else x.t >= s.quiet_start or x.t < s.quiet_end
    end
    from public.push_settings s
    cross join lateral (select (now() at time zone private.agency_timezone())::time as t) x
    where s.user_id = p_user and s.quiet_start is not null
  ), false);
$$;

revoke all on function private.in_quiet_hours(uuid) from public, authenticated;

-- ---------------------------------------------------------------------------
-- notify(): the same contract; push now also honours a sub-category (p_data.push_category) and quiet hours.
-- ---------------------------------------------------------------------------
create or replace function private.notify(
  p_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_client uuid default null,
  p_priority public.notification_priority default 'normal',
  p_include_actor boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_push integer;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;

  with recipients as (
    select distinct p.id
    from public.profiles p
    where p.id = any (p_user_ids)
      and p.status = 'active'
      and p.deleted_at is null
      and (p_include_actor or p.id is distinct from auth.uid())
      and not exists (
        select 1 from public.notification_preferences np
        where np.user_id = p.id and np.type = p_type and not np.in_app_enabled
      )
  ),
  inserted as (
    insert into public.notifications (user_id, type, title, body, data, entity_type, entity_id, client_id, priority)
    select r.id, p_type, left(p_title, 200), left(p_body, 1000), coalesce(p_data, '{}'), p_entity_type, p_entity_id, p_client, p_priority
    from recipients r
    returning id, user_id
  ),
  queued as (
    insert into public.notification_deliveries (notification_id, push_token_id)
    select i.id, t.id
    from inserted i
    join public.push_tokens t on t.user_id = i.user_id and t.revoked_at is null
    where not exists (
      select 1 from public.notification_preferences np
      where np.user_id = i.user_id and np.type in (p_type, p_data ->> 'push_category') and not np.push_enabled
    )
      and (p_priority = 'high' or not private.in_quiet_hours(i.user_id))
    returning 1
  )
  select (select count(*) from inserted), (select count(*) from queued) into v_count, v_push;

  if v_push > 0 then
    perform private.request_push_dispatch();
  end if;
  return v_count;
end;
$$;

-- Chat: unchanged text and type; the push sub-category tells group rooms from personal chats.
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

-- ---------------------------------------------------------------------------
-- Tasks: a new deadline and a cancellation reach the people on the task.
-- ---------------------------------------------------------------------------
create or replace function private.notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people uuid[];
begin
  if current_setting('sunmedia.quiet_assign', true) = 'on' or new.deleted_at is not null then
    return null;
  end if;
  select coalesce(array_agg(distinct ta.user_id), '{}') into v_people from public.task_assignments ta where ta.task_id = new.id;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.notify(
      v_people, 'task.cancelled', 'Vazifa bekor qilindi', new.title,
      jsonb_build_object('route', '/tasks/' || new.id), 'tasks', new.id, new.client_id, 'normal'
    );
  elsif new.due_at is distinct from old.due_at and new.status not in ('done', 'cancelled') then
    perform private.notify(
      v_people, 'task.rescheduled', 'Vazifa vaqti o‘zgardi',
      new.title || coalesce('. Yangi muddat: ' || private.format_local(new.due_at), '. Muddat olib tashlandi'),
      jsonb_build_object('route', '/tasks/' || new.id), 'tasks', new.id, new.client_id,
      case when new.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority
    );
  end if;
  return null;
end;
$$;

create trigger tasks_notify_change
  after update of due_at, status on public.tasks
  for each row execute function private.notify_task_change();

-- ---------------------------------------------------------------------------
-- Delivery (service role, push-dispatch): web devices get their keys; hidden previews are applied here, for every
-- device the person has.
-- ---------------------------------------------------------------------------
drop function public.claim_push_deliveries(integer);
create function public.claim_push_deliveries(p_limit integer default 100)
returns table (
  delivery_id bigint,
  token text,
  title text,
  body text,
  data jsonb,
  priority public.notification_priority,
  badge integer,
  platform text,
  p256dh text,
  auth_secret text,
  notification_id uuid
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
  select c.id, t.token,
         case when s.hide_preview then 'Sun Media' else n.title end,
         case when s.hide_preview then case when n.type like 'chat.%' then 'Yangi xabar' else 'Yangi bildirishnoma' end else n.body end,
         n.data || jsonb_build_object('notification_id', n.id, 'type', n.type),
         n.priority,
         private.unread_badge(n.user_id),
         t.platform, t.p256dh, t.auth_secret, n.id
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_tokens t on t.id = c.push_token_id
  left join public.push_settings s on s.user_id = n.user_id;
$$;

revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

-- p_results: [{ "delivery_id": 1, "status": "sent"|"failed", "ticket_id": "...", "error": "...", "device_not_registered": true }]
create or replace function public.complete_push_deliveries(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_sent boolean;
  v_gone boolean;
  v_token uuid;
begin
  for v_item in select * from jsonb_array_elements(p_results) loop
    v_sent := v_item ->> 'status' = 'sent';
    v_gone := coalesce((v_item ->> 'device_not_registered')::boolean, false);
    update public.notification_deliveries
    set status = case
          when v_sent then 'sent'
          when attempts >= 5 or v_gone then 'failed'
          else 'pending'
        end::public.delivery_status,
        ticket_id = v_item ->> 'ticket_id',
        error = left(v_item ->> 'error', 500),
        sent_at = case when v_sent then now() end
    where id = (v_item ->> 'delivery_id')::bigint
    returning push_token_id into v_token;

    update public.push_tokens
    set last_success_at = case when v_sent then now() else last_success_at end,
        last_error = case when v_sent then null else left(v_item ->> 'error', 300) end,
        failure_count = case when v_sent then 0 else failure_count + 1 end,
        -- The push service says this subscription is gone (unsubscribed, expired, app removed).
        revoked_at = case when v_gone then now() else revoked_at end
    where id = v_token;
  end loop;
end;
$$;

revoke all on function public.complete_push_deliveries(jsonb) from public, anon, authenticated;
grant execute on function public.complete_push_deliveries(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The person's own devices
-- ---------------------------------------------------------------------------
create or replace function public.register_web_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_name text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, token, platform, p256dh, auth_secret, device_name, user_agent)
  values (auth.uid(), p_endpoint, 'web', rtrim(p_p256dh, '='), rtrim(p_auth, '='), left(p_device_name, 80), left(p_user_agent, 300))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = 'web',
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        device_name = excluded.device_name,
        user_agent = excluded.user_agent,
        last_seen_at = now(),
        last_error = null,
        failure_count = 0,
        revoked_at = null
  returning id into v_id;
  -- Another account signed in on this browser: what was still queued for the previous one is not sent here.
  update public.notification_deliveries d
  set status = 'failed', error = 'device changed account'
  where d.push_token_id = v_id and d.status = 'pending'
    and d.notification_id in (select n.id from public.notifications n where n.user_id <> auth.uid());
  return v_id;
end;
$$;

create or replace function public.unregister_web_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.push_tokens set revoked_at = now()
  where token = p_endpoint and user_id = auth.uid() and revoked_at is null
  returning id into v_id;
  update public.notification_deliveries set status = 'failed', error = 'device signed out'
  where push_token_id = v_id and status = 'pending';
end;
$$;

-- "Remove this device" from the settings list (any of the person's own devices, web or app).
create or replace function public.revoke_push_device(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_tokens set revoked_at = now() where id = p_id and user_id = auth.uid() and revoked_at is null;
  update public.notification_deliveries set status = 'failed', error = 'device removed'
  where push_token_id = p_id and status = 'pending' and exists (select 1 from public.push_tokens t where t.id = p_id and t.user_id = auth.uid());
end;
$$;

-- A notification was opened: clicked and read (the chat itself is read when the chat is opened).
create or replace function public.open_notification(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set clicked_at = coalesce(clicked_at, now()), read_at = coalesce(read_at, now())
  where id = p_id and user_id = auth.uid()
  returning jsonb_build_object('route', data ->> 'route', 'type', type, 'entity_type', entity_type, 'entity_id', entity_id, 'client_id', client_id);
$$;

revoke all on function
  public.register_web_push(text, text, text, text, text),
  public.unregister_web_push(text),
  public.revoke_push_device(uuid),
  public.open_notification(uuid)
from public, anon;
grant execute on function
  public.register_web_push(text, text, text, text, text),
  public.unregister_web_push(text),
  public.revoke_push_device(uuid),
  public.open_notification(uuid)
to authenticated;

-- "Test bildirishnomasi" in the settings: one notification to oneself, at most once a minute.
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.notifications
    where user_id = auth.uid() and type = 'system.test' and created_at > now() - interval '1 minute'
  ) then
    raise exception 'TEST_TOO_SOON' using errcode = '22023';
  end if;
  perform private.notify(
    array[auth.uid()], 'system.test', 'Sun Media', 'Bildirishnomalar ishlayapti ✓',
    jsonb_build_object('route', '/account'), null, null, null, 'normal', true
  );
end;
$$;

revoke all on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;
