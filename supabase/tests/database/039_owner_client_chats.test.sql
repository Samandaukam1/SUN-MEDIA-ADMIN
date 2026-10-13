-- The system owner is a member of every client's chat, including clients added later. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select ok(not exists (
  select 1 from public.chat_rooms r
  cross join public.user_roles ur join public.roles ro on ro.id = ur.role_id and ro.key = 'system_owner'
  where r.kind = 'project' and r.is_default
    and not exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = ur.user_id)
), 'every system owner is in every client chat');

insert into public.clients (id, name, code) values ('00000000-0000-4000-8000-0000000000c1', 'Chat test', 'CHATTEST01');
select ok(exists (
  select 1 from public.chat_rooms r join public.chat_members m on m.room_id = r.id
  join public.user_roles ur on ur.user_id = m.user_id join public.roles ro on ro.id = ur.role_id and ro.key = 'system_owner'
  where r.client_id = '00000000-0000-4000-8000-0000000000c1' and r.kind = 'project'
) or not exists (select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id where ro.key = 'system_owner'),
  'a new client''s chat gets the system owner too');

select * from finish();
rollback;
