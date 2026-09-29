-- Rahbar: writes to the client thread (labelled "Rahbar"), gives directives in team chats, manages tasks,
-- but does not mark attendance. Admins answer clients too; nobody else can give directives. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table rh_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on rh_ids to authenticated, anon;
insert into rh_ids (key) values ('rahbar'), ('admin'), ('editor'), ('client_user'), ('client');
create function pg_temp.rh(p_key text) returns uuid language sql stable as $$ select id from rh_ids where key = p_key $$;
grant execute on function pg_temp.rh(text) to authenticated, anon;
create function pg_temp.rh_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.rh(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.rh_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@rahbar-tests.local',
       jsonb_build_object('full_name', key), '{}'
from rh_ids where key <> 'client';
insert into public.user_roles (user_id, role_id)
select i.id, r.id from rh_ids i join public.roles r on r.key = case i.key when 'rahbar' then 'owner' when 'admin' then 'admin' else 'editor' end
where i.key in ('rahbar', 'admin', 'editor');
insert into public.employees (user_id) select id from rh_ids where key in ('rahbar', 'admin', 'editor');
insert into public.clients (id, name, code) values (pg_temp.rh('client'), 'Rahbar Test', 'RHTEST');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.rh('client'), pg_temp.rh('client_user'), id from public.roles where key = 'client_owner';

create function pg_temp.client_room() returns uuid language sql stable as $$
  select id from public.chat_rooms where client_id = pg_temp.rh('client') and kind = 'project' and is_default $$;
grant execute on function pg_temp.client_room() to authenticated, anon;
create function pg_temp.team_room() returns uuid language sql stable as $$
  select id from public.chat_rooms where kind = 'internal' and is_default $$;
grant execute on function pg_temp.team_room() to authenticated, anon;

select ok(pg_temp.rh('rahbar') = any (select user_id from public.chat_members where room_id = pg_temp.client_room()), 'the Rahbar is in every client thread');
select ok(pg_temp.rh('admin') = any (select user_id from public.chat_members where room_id = pg_temp.client_room()), 'so is the Admin');

-- Rahbar
select pg_temp.rh_login('rahbar');
select is((public.send_message(pg_temp.client_room(), 'Assalomu alaykum, SAFI!')).sender_label, 'Rahbar', 'the Rahbar writes to the client, labelled "Rahbar"');
select is((public.send_message(pg_temp.team_room(), 'Ertaga 9:00 da syomka', null, '{}', true)).is_directive, true, 'the Rahbar gives a directive in the team chat');
select throws_ok($$select public.send_message(pg_temp.client_room(), 'x', null, '{}', true)$$, '42501', null, 'directives stay inside the team');
select ok((public.get_my_context() -> 'permissions') ? 'tasks.manage', 'the Rahbar manages tasks');
select ok((public.get_my_context() -> 'permissions') ? 'shootings.manage', 'and shootings');
select ok(not ((public.get_my_context() -> 'permissions') ? 'attendance.manage'), 'but does not mark attendance');
reset role;

-- Admin
select pg_temp.rh_login('admin');
select is((public.send_message(pg_temp.client_room(), 'Admin javobi')).sender_label, 'Admin', 'the Admin answers the client, labelled "Admin"');
select throws_ok($$select public.send_message(pg_temp.team_room(), 'x', null, '{}', true)$$, '42501', null, 'only the Rahbar gives directives');
reset role;

-- Client sees who wrote, and cannot fake a label
select pg_temp.rh_login('client_user');
select is((select string_agg(sender_label, ',' order by sender_label) from public.messages where room_id = pg_temp.client_room()), 'Admin,Rahbar', 'the client sees Rahbar and Admin');
select is((public.send_message(pg_temp.client_room(), 'Rahmat')).sender_label, null, 'client messages carry no staff label');
select is((select count(*)::int from public.messages where room_id = pg_temp.team_room()), 0, 'the client never sees the team chat');
reset role;

select is((select count(*)::int from public.notifications where user_id = pg_temp.rh('editor') and type = 'chat.directive' and priority = 'high'), 1,
  'team members get the directive as a high-priority notification');

select * from finish();
rollback;
