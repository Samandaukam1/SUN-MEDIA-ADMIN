-- Push pipeline: tokens, per-type preferences, delivery queue, claim/complete by the dispatcher,
-- messenger-style chat pushes and a badge that matches the app. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table pu_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on pu_ids to authenticated, anon, service_role;
insert into pu_ids (key) values ('ann'), ('ben');

create function pg_temp.pu(p_key text) returns uuid language sql stable as $$ select id from pu_ids where key = p_key $$;
grant execute on function pg_temp.pu(text) to authenticated, anon, service_role;
create function pg_temp.pu_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.pu(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.pu_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@push-tests.local',
       jsonb_build_object('full_name', 'Push ' || key), '{}'
from pu_ids;
insert into public.user_roles (user_id, role_id) select i.id, r.id from pu_ids i join public.roles r on r.key = 'editor';
insert into public.employees (user_id) select id from pu_ids;

-- Tokens
select pg_temp.pu_login('ben');
select lives_ok($$select public.register_push_token('ExponentPushToken[pu-ben-' || left(pg_temp.pu('ben')::text, 8) || ']', 'ios', 'iPhone', '1.0.0')$$, 'ben registers a device');
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, '23514', null, 'malformed tokens are rejected');
select is((select count(*)::int from public.push_tokens where user_id = pg_temp.pu('ben')), 1, 'ben sees his own token');
reset role;
select pg_temp.pu_login('ann');
select is((select count(*)::int from public.push_tokens where user_id = pg_temp.pu('ben')), 0, 'tokens are private');
insert into pu_ids (key, id) select 'dm', public.open_direct_chat(pg_temp.pu('ben'));
select public.send_message(pg_temp.pu('dm'), 'Salom Ben');
reset role;

-- Delivery queue and messenger-style content
select is((select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
           where n.user_id = pg_temp.pu('ben') and d.status = 'pending'), 1, 'the chat message is queued for ben''s device');
select is((select title from public.notifications where user_id = pg_temp.pu('ben') and type = 'chat.message'), 'Push ann', 'a direct message is titled with the sender');
select is((select body from public.notifications where user_id = pg_temp.pu('ben') and type = 'chat.message'), 'Salom Ben', 'the body is the message itself');
select is((select priority::text from public.notifications where user_id = pg_temp.pu('ben') and type = 'chat.message'), 'normal', 'direct messages make a sound');

-- Preferences: push off keeps the in-app notification; in-app off drops it entirely
select pg_temp.pu_login('ben');
insert into public.notification_preferences (user_id, type, push_enabled, in_app_enabled) values (pg_temp.pu('ben'), 'chat.message', false, true);
reset role;
select pg_temp.pu_login('ann');
select public.send_message(pg_temp.pu('dm'), 'Ikkinchi xabar');
reset role;
select is((select count(*)::int from public.notifications where user_id = pg_temp.pu('ben') and type = 'chat.message'), 2, 'push off still notifies in the app');
select is((select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = pg_temp.pu('ben')), 1,
  'push off queues no new delivery');
select pg_temp.pu_login('ben');
update public.notification_preferences set in_app_enabled = false where user_id = pg_temp.pu('ben') and type = 'chat.message';
reset role;
select pg_temp.pu_login('ann');
select public.send_message(pg_temp.pu('dm'), 'Uchinchi');
reset role;
select is((select count(*)::int from public.notifications where user_id = pg_temp.pu('ben') and type = 'chat.message'), 2, 'in-app off drops the notification');

-- Dispatcher (service role): claim → Expo → complete
set local role service_role;
create temp table pu_claim as select * from public.claim_push_deliveries(500);
select ok(exists (select 1 from pu_claim where token like 'ExponentPushToken[pu-ben-%'), 'the dispatcher claims ben''s delivery');
select is((select badge from pu_claim where token like 'ExponentPushToken[pu-ben-%' limit 1), 1, 'badge counts the room once, not every message');
select ok((select (data ->> 'route') like '/chat/%' and data ? 'notification_id' from pu_claim where token like 'ExponentPushToken[pu-ben-%' limit 1), 'push data deep-links to the chat');
select is((select count(*)::int from public.claim_push_deliveries(500) c where c.token like 'ExponentPushToken[pu-ben-%'), 0, 'a claimed delivery is not handed out twice');
select public.complete_push_deliveries(jsonb_build_array(jsonb_build_object(
  'delivery_id', (select delivery_id from pu_claim where token like 'ExponentPushToken[pu-ben-%' limit 1),
  'status', 'failed', 'error', 'DeviceNotRegistered', 'device_not_registered', true)));
reset role;
select is((select status::text from public.notification_deliveries where id = (select delivery_id from pu_claim where token like 'ExponentPushToken[pu-ben-%' limit 1)),
  'failed', 'a dead device fails immediately');
select ok((select revoked_at is not null from public.push_tokens where user_id = pg_temp.pu('ben')), 'and its token is revoked');

-- Clients of the app never touch the queue
select pg_temp.pu_login('ben');
select throws_ok($$select public.claim_push_deliveries(10)$$, '42501', null, 'users cannot claim deliveries');
select throws_ok($$select public.complete_push_deliveries('[]'::jsonb)$$, '42501', null, 'users cannot complete deliveries');
reset role;

select * from finish();
rollback;
