-- Web Push for the installed app (20261026100000, master prompt §42): who is notified of what, on which device, and
-- when not — the general chat reaches every member but the sender, a private chat only its people, nobody outside a
-- room; muted rooms, quiet hours, per-kind push switches and hidden previews are honoured; a task's new time and its
-- cancellation reach the people on it; a browser that changes account gets nothing meant for the previous one.
-- Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select * from no_plan();

create temp table wp_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on wp_ids to authenticated, anon, service_role;
insert into wp_ids (key) values ('ann'), ('ben'), ('cat'), ('dan');

create function pg_temp.wp(p_key text) returns uuid language sql stable as $$ select id from wp_ids where key = p_key $$;
grant execute on function pg_temp.wp(text) to authenticated, anon, service_role;
create function pg_temp.wp_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.wp(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.wp_login(text) to authenticated, anon;
-- A browser endpoint and keys in the shape the push services use.
create function pg_temp.endpoint(p_key text) returns text language sql stable as $$ select 'https://fcm.googleapis.com/fcm/send/wp-' || p_key || '-' || left(pg_temp.wp(p_key)::text, 8) $$;
grant execute on function pg_temp.endpoint(text) to authenticated, anon;
-- Push deliveries queued for one notification type to one person, since the start of this test.
create function pg_temp.queued(p_key text, p_type text, p_body text) returns int language sql stable as $$
  select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.user_id = pg_temp.wp(p_key) and n.type = p_type and n.body like p_body
$$;
create function pg_temp.notified(p_key text, p_type text, p_body text) returns int language sql stable as $$
  select count(*)::int from public.notifications where user_id = pg_temp.wp(p_key) and type = p_type and body like p_body
$$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@webpush-tests.local',
       jsonb_build_object('full_name', 'Wp ' || key), '{}'
from wp_ids;
insert into public.user_roles (user_id, role_id) select i.id, r.id from wp_ids i join public.roles r on r.key = 'editor';
insert into public.employees (user_id) select id from wp_ids;

-- ---------------------------------------------------------------------------
-- Devices: a browser subscription is one more of the person's devices
-- ---------------------------------------------------------------------------
select pg_temp.wp_login('ben');
select lives_ok($$select public.register_web_push(pg_temp.endpoint('ben'), repeat('B', 87), repeat('a', 22), 'Chrome', 'test')$$, 'a browser registers as a web device');
select throws_ok($$select public.register_web_push('http://insecure.example/x', repeat('B', 87), repeat('a', 22))$$, '23514', null, 'only https endpoints with real keys');
select is((select platform from public.push_tokens where token = pg_temp.endpoint('ben')), 'web', 'stored as a web device');
reset role;
select pg_temp.wp_login('cat');
select public.register_web_push(pg_temp.endpoint('cat'), repeat('C', 87), repeat('c', 22), 'Safari', 'test');
reset role;
select pg_temp.wp_login('dan');
select public.register_web_push(pg_temp.endpoint('dan'), repeat('D', 87), repeat('d', 22), 'Edge', 'test');
reset role;

-- ---------------------------------------------------------------------------
-- The team chat: everyone in it but the sender; nobody outside it
-- ---------------------------------------------------------------------------
select pg_temp.wp_login('ann');
insert into wp_ids (key, id) select 'group', public.create_group_chat('Montaj', array[pg_temp.wp('ben'), pg_temp.wp('cat')]);
select public.send_message(pg_temp.wp('group'), 'Hammaga salom');
reset role;
select is(pg_temp.notified('ben', 'chat.message', '%Hammaga salom'), 1, 'group message: ben is notified');
select is(pg_temp.notified('cat', 'chat.message', '%Hammaga salom'), 1, 'group message: cat is notified');
select is(pg_temp.notified('ann', 'chat.message', '%Hammaga salom'), 0, 'never the sender');
select is(pg_temp.notified('dan', 'chat.message', '%Hammaga salom'), 0, 'never a colleague outside the room');
select is(pg_temp.queued('ben', 'chat.message', '%Hammaga salom') + pg_temp.queued('cat', 'chat.message', '%Hammaga salom'), 2, 'one push per member device');
select is((select data ->> 'push_category' from public.notifications where user_id = pg_temp.wp('ben') and body like '%Hammaga salom'), 'chat.group', 'marked as a group chat (its own push switch)');
select is((select data ->> 'route' from public.notifications where user_id = pg_temp.wp('ben') and body like '%Hammaga salom'), '/chat/' || pg_temp.wp('group'), 'deep link to that chat');

-- A muted room stays quiet for that person only.
update public.chat_members set muted_until = now() + interval '1 hour' where room_id = pg_temp.wp('group') and user_id = pg_temp.wp('cat');
select pg_temp.wp_login('ann');
select public.send_message(pg_temp.wp('group'), 'Ikkinchi xabar');
reset role;
select is(pg_temp.notified('cat', 'chat.message', '%Ikkinchi xabar'), 0, 'muted: nothing for cat');
select is(pg_temp.notified('ben', 'chat.message', '%Ikkinchi xabar'), 1, 'ben still hears it');
update public.chat_members set muted_until = null where room_id = pg_temp.wp('group') and user_id = pg_temp.wp('cat');

-- ---------------------------------------------------------------------------
-- A private chat: only its other person
-- ---------------------------------------------------------------------------
select pg_temp.wp_login('ann');
insert into wp_ids (key, id) select 'dm', public.open_direct_chat(pg_temp.wp('cat'));
select public.send_message(pg_temp.wp('dm'), 'Faqat senga');
reset role;
select is((select count(*)::int from public.notifications where body like '%Faqat senga'), 1, 'a private message notifies exactly one person');
select is(pg_temp.notified('cat', 'chat.message', 'Faqat senga'), 1, 'and it is cat');
select is((select data ->> 'push_category' from public.notifications where user_id = pg_temp.wp('cat') and body = 'Faqat senga'), 'chat.direct', 'marked as a personal chat');

-- ---------------------------------------------------------------------------
-- The person's own choices: a push switch per kind, quiet hours, hidden previews
-- ---------------------------------------------------------------------------
insert into public.notification_preferences (user_id, type, in_app_enabled, push_enabled) values (pg_temp.wp('cat'), 'chat.group', true, false);
insert into public.push_settings (user_id, quiet_start, quiet_end)
values (pg_temp.wp('ben'), ((now() at time zone private.agency_timezone()) - interval '1 hour')::time, ((now() at time zone private.agency_timezone()) + interval '1 hour')::time);
select pg_temp.wp_login('ann');
select public.send_message(pg_temp.wp('group'), 'Kechki xabar');
select public.send_message(pg_temp.wp('dm'), 'Shaxsiy kechki');
reset role;
select is(pg_temp.notified('cat', 'chat.message', '%Kechki xabar'), 1, 'group push off: still in the app');
select is(pg_temp.queued('cat', 'chat.message', '%Kechki xabar'), 0, '…but no push for the group');
select is(pg_temp.queued('cat', 'chat.message', 'Shaxsiy kechki'), 1, 'personal chats still push');
select is(pg_temp.notified('ben', 'chat.message', '%Kechki xabar'), 1, 'quiet hours: in the app');
select is(pg_temp.queued('ben', 'chat.message', '%Kechki xabar'), 0, '…but no push during quiet hours');

update public.push_settings set quiet_start = null, quiet_end = null, hide_preview = true where user_id = pg_temp.wp('ben');
select pg_temp.wp_login('ann');
select public.send_message(pg_temp.wp('group'), 'Maxfiy gap');
reset role;
set local role service_role;
create temp table wp_claimed as select token, title, body from public.claim_push_deliveries(500);
reset role;
select ok(exists (select 1 from wp_claimed where token = pg_temp.endpoint('ben')), 'ben’s pushes are handed to the dispatcher');
select is((select count(*)::int from wp_claimed where token = pg_temp.endpoint('ben') and not (title = 'Sun Media' and body = 'Yangi xabar')), 0, 'hidden preview: every push to ben shows no sender and no text');
select ok(not exists (select 1 from wp_claimed where token = pg_temp.endpoint('ben') and body like '%Maxfiy gap%'), 'the text never leaves for ben’s device');
select ok(exists (select 1 from wp_claimed where body = 'Faqat senga' and token = pg_temp.endpoint('cat')), 'others see their usual preview');

-- ---------------------------------------------------------------------------
-- Tasks: a new time and a cancellation reach the people on the task
-- ---------------------------------------------------------------------------
with t as (insert into public.tasks (title, task_type, status, due_at) values ('WP montaj', 'editing', 'todo', now() + interval '2 days') returning id)
insert into wp_ids (key, id) select 'task', id from t;
insert into public.task_assignments (task_id, user_id) values (pg_temp.wp('task'), pg_temp.wp('ben')), (pg_temp.wp('task'), pg_temp.wp('cat'));
select is(pg_temp.notified('ben', 'task.assigned', 'WP montaj%'), 1, 'assigned: notified');
update public.tasks set due_at = now() + interval '3 days' where id = pg_temp.wp('task');
select is(pg_temp.notified('ben', 'task.rescheduled', 'WP montaj. Yangi muddat:%') + pg_temp.notified('cat', 'task.rescheduled', 'WP montaj. Yangi muddat:%'), 2, 'a new time: everyone on the task');
select is(pg_temp.notified('dan', 'task.rescheduled', 'WP montaj%'), 0, 'nobody else');
update public.tasks set status = 'cancelled' where id = pg_temp.wp('task');
select is(pg_temp.notified('cat', 'task.cancelled', 'WP montaj'), 1, 'cancelled: notified');
update public.tasks set due_at = now() + interval '5 days' where id = pg_temp.wp('task');
select is(pg_temp.notified('cat', 'task.rescheduled', 'WP montaj%'), 1, 'a cancelled task’s time change is not news');

-- ---------------------------------------------------------------------------
-- One browser, another account: what was queued for the first is not sent there
-- ---------------------------------------------------------------------------
select pg_temp.wp_login('ann');
select public.send_message(pg_temp.wp('dm'), 'Navbatdagi xabar');
reset role;
select is(pg_temp.queued('cat', 'chat.message', 'Navbatdagi xabar'), 1, 'queued for cat’s browser');
select pg_temp.wp_login('dan');
select public.register_web_push(pg_temp.endpoint('cat'), repeat('E', 87), repeat('e', 22), 'Safari', 'test');
reset role;
select is((select d.status::text || ':' || d.error from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.body = 'Navbatdagi xabar'), 'failed:device changed account', 'the browser now belongs to dan: cat’s message is not delivered there');
select is((select user_id from public.push_tokens where token = pg_temp.endpoint('cat')), pg_temp.wp('dan'), 'and the device is dan’s');

-- ---------------------------------------------------------------------------
-- Opening a notification marks it clicked and read — only one's own
-- ---------------------------------------------------------------------------
select pg_temp.wp_login('dan');
select is(public.open_notification((select id from public.notifications where user_id = pg_temp.wp('cat') and body = 'Faqat senga')), null, 'someone else’s notification cannot be opened');
reset role;
select pg_temp.wp_login('cat');
select is(public.open_notification((select id from public.notifications where user_id = pg_temp.wp('cat') and body = 'Faqat senga')) ->> 'route', '/chat/' || pg_temp.wp('dm'), 'opening returns its deep link');
reset role;
select ok((select clicked_at is not null and read_at is not null from public.notifications where user_id = pg_temp.wp('cat') and body = 'Faqat senga'), 'clicked and read');

select * from finish();
rollback;
