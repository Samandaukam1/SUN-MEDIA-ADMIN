-- Inbox & chat: direct rooms are unique per pair and staff-only, group rooms take staff only,
-- unread counts / read markers, atomic send with attachments, client isolation. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ch_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on ch_ids to authenticated, anon;
insert into ch_ids (key) values ('alice'), ('bob'), ('carol'), ('client_user'), ('client');

create function pg_temp.ch(p_key text) returns uuid language sql stable as $$ select id from ch_ids where key = p_key $$;
grant execute on function pg_temp.ch(text) to authenticated, anon;
create function pg_temp.ch_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ch(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.ch_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@chat-tests.local',
       jsonb_build_object('full_name', 'Chat ' || key), '{}'
from ch_ids where key in ('alice', 'bob', 'carol', 'client_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from ch_ids i join public.roles r on r.key = 'editor' where i.key in ('alice', 'bob', 'carol');
insert into public.employees (user_id) select id from ch_ids where key in ('alice', 'bob', 'carol');
insert into public.clients (id, name, code) values (pg_temp.ch('client'), 'Chat client', 'CH' || upper(left(replace(pg_temp.ch('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id) select pg_temp.ch('client'), pg_temp.ch('client_user'), id from public.roles where key = 'client_owner';

-- Direct chats
select pg_temp.ch_login('alice');
insert into ch_ids (key, id) select 'dm', public.open_direct_chat(pg_temp.ch('bob'));
select is(public.open_direct_chat(pg_temp.ch('bob')), pg_temp.ch('dm'), 'opening the same direct chat again returns the same room');
select throws_ok($$select public.open_direct_chat(pg_temp.ch('alice'))$$, '22023', null, 'no direct chat with yourself');
select throws_ok($$select public.open_direct_chat(pg_temp.ch('client_user'))$$, '22023', null, 'no direct chat with a client user');
select lives_ok($$select public.send_message(pg_temp.ch('dm'), 'Salom, montaj tayyor')$$, 'alice sends a message');
select throws_ok($$select public.send_message(pg_temp.ch('dm'), '   ')$$, '22023', null, 'empty messages are rejected');
reset role;
-- One transaction shares one now(): place the room's history in the past so "later" means later.
update public.chat_members set last_read_at = now() - interval '1 hour' where room_id = pg_temp.ch('dm');
update public.messages set created_at = now() - interval '10 minutes' where room_id = pg_temp.ch('dm');

select pg_temp.ch_login('bob');
select is(public.open_direct_chat(pg_temp.ch('alice')), pg_temp.ch('dm'), 'the other side finds the same room');
select is((select unread_count from public.get_my_chats() where room_id = pg_temp.ch('dm')), 1, 'bob has one unread message');
select is((select peer_name from public.get_my_chats() where room_id = pg_temp.ch('dm')), 'Chat alice', 'direct chat shows the other person');
select is((select last_message_body from public.get_my_chats() where room_id = pg_temp.ch('dm')), 'Salom, montaj tayyor', 'last message shown');
select ok((public.get_inbox_counts() ->> 'chat_unread')::int >= 1, 'inbox badge counts unread chat');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.ch('bob') and type = 'chat.message' and read_at is null), 'bob got a chat notification');
select lives_ok($$select public.mark_chat_read(pg_temp.ch('dm'))$$, 'bob reads the chat');
select is((select unread_count from public.get_my_chats() where room_id = pg_temp.ch('dm')), 0, 'unread cleared');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.ch('bob') and type = 'chat.message' and entity_id = pg_temp.ch('dm') and read_at is null),
  'the room''s chat notifications are marked read');
reset role;

select pg_temp.ch_login('carol');
select is((select count(*)::int from public.get_my_chats() where room_id = pg_temp.ch('dm')), 0, 'others do not see the direct chat');
select throws_ok($$select public.send_message(pg_temp.ch('dm'), 'men ham')$$, '42501', null, 'others cannot write into it');
select throws_ok($$select public.mark_chat_read(pg_temp.ch('dm'))$$, '42501', null, 'others cannot touch its read markers');
reset role;

-- Attachments must be the sender's uploads in this very room
select pg_temp.ch_login('alice');
insert into ch_ids (key, id) select 'att', id from public.create_file_upload('brief.pdf', 'application/pdf', 1024, p_chat_room_id => pg_temp.ch('dm'));
reset role;
insert into storage.objects (bucket_id, name, owner, metadata)
select bucket, storage_path, uploaded_by, '{"size": 1024, "mimetype": "application/pdf"}'::jsonb from public.files where id = pg_temp.ch('att');
select pg_temp.ch_login('alice');
select throws_ok($$select public.send_message(pg_temp.ch('dm'), '', null, array[pg_temp.ch('att')])$$, '22023', null, 'a pending upload cannot be attached');
select public.complete_file_upload(pg_temp.ch('att'));
select lives_ok($$select public.send_message(pg_temp.ch('dm'), '', null, array[pg_temp.ch('att')])$$, 'a file-only message is sent');
reset role;
select is((select count(*)::int from public.message_attachments a join public.messages m on m.id = a.message_id where m.room_id = pg_temp.ch('dm')), 1, 'attachment linked');
select pg_temp.ch_login('bob');
select ok((select last_has_files from public.get_my_chats() where room_id = pg_temp.ch('dm')), 'chat list knows the last message has a file');
select is((select count(*)::int from public.files where id = pg_temp.ch('att')), 1, 'bob can open the attachment');
reset role;
select pg_temp.ch_login('carol');
select is((select count(*)::int from public.files where id = pg_temp.ch('att')), 0, 'others cannot open the attachment');
reset role;

-- Group chats
select pg_temp.ch_login('alice');
select throws_ok($$select public.create_group_chat('Montaj', array[pg_temp.ch('client_user')])$$, '22023', null, 'clients cannot be added to a staff group');
select throws_ok($$select public.create_group_chat(' ', array[pg_temp.ch('bob')])$$, '22023', null, 'a group needs a name');
insert into ch_ids (key, id) select 'group', public.create_group_chat('Montaj jamoasi', array[pg_temp.ch('bob'), pg_temp.ch('carol')]);
reset role;
select is((select count(*)::int from public.chat_members where room_id = pg_temp.ch('group')), 3, 'creator and two colleagues joined');
select ok((select is_admin from public.chat_members where room_id = pg_temp.ch('group') and user_id = pg_temp.ch('alice')), 'the creator administers the group');
select pg_temp.ch_login('carol');
select is((select last_is_system from public.get_my_chats() where room_id = pg_temp.ch('group')), true, 'the group starts with a system message');
reset role;

-- Clients: their company room only
select pg_temp.ch_login('client_user');
select ok(exists (select 1 from public.get_my_chats() where client_id = pg_temp.ch('client') and kind = 'project'), 'client sees the company project chat');
select is((select count(*)::int from public.get_my_chats() where kind <> 'project'), 0, 'client sees no internal or direct chats');
select throws_ok($$select public.open_direct_chat(pg_temp.ch('alice'))$$, '42501', null, 'clients cannot open direct chats');
select throws_ok($$select public.create_group_chat('x', array[pg_temp.ch('alice')])$$, '42501', null, 'clients cannot create groups');
select lives_ok($$select public.send_message((select room_id from public.get_my_chats() where kind = 'project' and client_id = pg_temp.ch('client')), 'Assalomu alaykum!')$$,
  'client writes in the project chat');
reset role;

select * from finish();
rollback;
