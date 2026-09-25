-- Shared internal workspace: staff-only visibility, audience targeting, notifications, calendar,
-- team directory privacy, role/permission changes and the configurable work schedule.
-- Seed-safe and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ws_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on ws_ids to authenticated, anon;
insert into ws_ids (key) values ('admin'), ('editor'), ('operator'), ('client_user'), ('client'), ('new_employee');

create function pg_temp.ws(p_key text) returns uuid language sql stable as $$ select id from ws_ids where key = p_key $$;
grant execute on function pg_temp.ws(text) to authenticated, anon;
create function pg_temp.ws_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ws(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.ws_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@ws-tests.local',
       jsonb_build_object('full_name', 'WS ' || key), '{}'
from ws_ids where key in ('admin', 'editor', 'operator', 'client_user', 'new_employee');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from ws_ids i join public.roles r on r.key = i.key where i.key in ('admin', 'editor', 'operator');
insert into public.employees (user_id) select id from ws_ids where key in ('admin', 'editor', 'operator');
insert into public.clients (id, name, code) values (pg_temp.ws('client'), 'WS client', 'WS' || upper(left(replace(pg_temp.ws('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.ws('client'), pg_temp.ws('client_user'), id from public.roles where key = 'client_owner';

-- Announcements
select pg_temp.ws_login('editor');
select throws_ok($$insert into public.announcements (title, body) values ('x', 'y')$$, '42501', null, 'an editor cannot post announcements');
reset role;

select pg_temp.ws_login('admin');
select lives_ok($$insert into public.announcements (title, body, is_pinned) values ('Bayram', 'Ertaga dam olish kuni', true)$$, 'admin posts an announcement');
select lives_ok($$insert into public.announcements (title, body, audience_roles) values ('Montajyorlar uchun', 'Yangi eksport sozlamalari', array['editor'])$$, 'admin targets editors');
reset role;

select ok(exists (select 1 from public.notifications where user_id = pg_temp.ws('editor') and type = 'announcement' and title like '📌 Bayram'),
  'staff are notified about a pinned announcement');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.ws('admin') and type = 'announcement'),
  'the author is not notified about their own post');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.ws('client_user') and type = 'announcement'),
  'clients never get staff announcements');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.ws('operator') and title = 'Montajyorlar uchun'),
  'targeted announcements reach only their audience');

select pg_temp.ws_login('editor');
select ok(exists (select 1 from public.announcements where title = 'Montajyorlar uchun'), 'editor sees the editor announcement');
select lives_ok($$insert into public.announcement_reads (announcement_id, user_id) select id, pg_temp.ws('editor') from public.announcements where title = 'Bayram'$$,
  'staff mark announcements read');
reset role;
select pg_temp.ws_login('operator');
select ok(not exists (select 1 from public.announcements where title = 'Montajyorlar uchun'), 'operator does not see the editor announcement');
select ok(exists (select 1 from public.announcements where title = 'Bayram'), 'operator sees the all-staff announcement');
reset role;
select pg_temp.ws_login('client_user');
select is((select count(*)::int from public.announcements), 0, 'clients see no announcements');
select is((select count(*)::int from public.company_events), 0, 'clients see no company events');
select is((select count(*)::int from public.shared_documents), 0, 'clients see no internal documents');
reset role;

-- Company events + calendar
select pg_temp.ws_login('admin');
select lives_ok($$insert into public.company_events (title, kind, starts_at, ends_at) values ('Umumiy yig‘ilish', 'meeting', now() + interval '1 hour', now() + interval '2 hours')$$,
  'admin schedules a company meeting');
reset role;
select pg_temp.ws_login('operator');
select ok(exists (select 1 from public.get_calendar_events(now(), now() + interval '1 day') e where e.event_type = 'company_meeting'),
  'company events appear in the staff calendar');
reset role;
select pg_temp.ws_login('client_user');
select ok(not exists (select 1 from public.get_calendar_events(now(), now() + interval '1 day') e where e.event_type like 'company_%'),
  'company events never appear in a client calendar');
reset role;

-- Shared documents
insert into public.files (id, client_id, name, external_url, status) values (pg_temp.ws('new_employee'), pg_temp.ws('client'), 'client brief', 'https://example.invalid/b', 'uploaded');
select pg_temp.ws_login('admin');
select lives_ok($$insert into public.shared_documents (title, category, url) values ('Montaj SOP', 'sop', 'https://docs.example/sop')$$, 'admin shares an SOP link');
select throws_ok($$insert into public.shared_documents (title, file_id) values ('Brief', pg_temp.ws('new_employee'))$$, '22023', null,
  'client files cannot be shared company-wide');
select throws_ok($$insert into public.shared_documents (title, url) values ('Bad', 'http://insecure')$$, '23514', null, 'only https links');
reset role;

-- Team directory privacy
select pg_temp.ws_login('client_user');
select throws_ok($$select * from public.get_team_directory()$$, '42501', null, 'clients cannot read the team directory');
reset role;
select pg_temp.ws_login('editor');
select ok(exists (select 1 from public.get_team_directory() d where d.user_id = pg_temp.ws('operator')), 'staff see colleagues in the directory');
select is((select d.open_tasks from public.get_team_directory() d where d.user_id = pg_temp.ws('operator')), null::int, 'workload is hidden from an editor');
select is((select d.account_status::text from public.get_team_directory() d where d.user_id = pg_temp.ws('operator')), null, 'account status is hidden from an editor');
reset role;
select pg_temp.ws_login('admin');
select is((select d.open_tasks from public.get_team_directory() d where d.user_id = pg_temp.ws('operator')), 0, 'admins see workload');
reset role;

-- Role changes and extra permissions
select pg_temp.ws_login('editor');
select throws_ok($$select public.change_staff_role(pg_temp.ws('operator'), 'designer')$$, '42501', null, 'an editor cannot change roles');
reset role;
select pg_temp.ws_login('admin');
select lives_ok($$select public.change_staff_role(pg_temp.ws('editor'), 'designer')$$, 'admin changes a role');
select throws_ok($$select public.change_staff_role(pg_temp.ws('editor'), 'owner')$$, '42501', null, 'admin cannot promote to owner');
select lives_ok($$select public.set_staff_permissions(pg_temp.ws('operator'), array['attendance.read'])$$, 'admin grants a permission they hold');
reset role;
select is((select array_agg(r.key) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = pg_temp.ws('editor')),
  array['designer'], 'the old role is replaced, not added');
select ok(exists (select 1 from public.audit_logs where action = 'account.role_changed' and entity_id = pg_temp.ws('editor')::text), 'role change audited');

-- Work schedule settings
select throws_ok($$update public.app_settings set value = '[0, 8]' where key = 'attendance.work_days'$$, '22023', null, 'invalid work days rejected');
update public.app_settings set value = '[1, 2, 3, 4, 5]' where key = 'attendance.work_days';
update public.app_settings set value = '"10:00"' where key = 'attendance.workday_start';
insert into public.user_roles (user_id, role_id) select pg_temp.ws('new_employee'), id from public.roles where key = 'operator';
insert into public.employees (user_id) values (pg_temp.ws('new_employee'));
select is((select work_days from public.employees where user_id = pg_temp.ws('new_employee')), '{1,2,3,4,5}'::smallint[], 'new employees follow the configured work days');
select is((select work_start_time from public.employees where user_id = pg_temp.ws('new_employee')), '10:00'::time, 'and the configured start time');

select * from finish();
rollback;
