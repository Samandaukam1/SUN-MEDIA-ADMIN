-- Agency workflow: skills pick people, "+ Vazifa yaratish" builds the stages and tells each person once, the
-- script and equipment steps, "Keldim", attendance alerts, billing and passport privacy, chat read receipts.
-- Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table aw_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into aw_ids(key) values ('sys'), ('rahbar'), ('admin'), ('writer'), ('operator'), ('helper'), ('editor'), ('client');
grant select on aw_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from aw_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@aw-tests.local',
       jsonb_build_object('full_name', initcap(key)), '{}'
from aw_ids;
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('sys', 'system_owner'), ('rahbar', 'owner'), ('admin', 'admin'), ('writer', 'scriptwriter'),
  ('operator', 'operator'), ('helper', 'staff'), ('editor', 'editor')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id) select pg_temp.id(k) from unnest(array['sys', 'rahbar', 'admin', 'writer', 'operator', 'helper', 'editor']) k;
insert into public.employee_skills(user_id, skill_id)
select pg_temp.id(k), s.id from (values ('writer', 'scriptwriter'), ('operator', 'operator'), ('editor', 'editor')) v(k, wr)
join public.skills s on s.workflow_role = v.wr;
insert into public.clients(id, name, code, status) values (pg_temp.id('client'), 'AW Test Client', 'AWT', 'active');

create temp table aw_run(key text primary key, id uuid);
grant select, insert, update on aw_run to authenticated;

-- Passport data: only the system owner.
set local role authenticated;
select pg_temp.login('sys');
select lives_ok($$insert into public.employee_private(user_id, birth_date, passport_series, passport_number) values (pg_temp.id('writer'), '1998-05-01', 'AB', '1234567')$$,
  'the system owner stores passport data');
select pg_temp.login('admin');
select is((select count(*) from public.employee_private), 0::bigint, 'an admin sees no passport data');
select throws_ok($$insert into public.employee_private(user_id, passport_series) values (pg_temp.id('helper'), 'AA')$$, '42501', null, 'and cannot write it');
reset role;
select ok(not exists (select 1 from public.audit_logs where entity_type = 'employee_private' and (new_values::text like '%1234567%' or metadata::text like '%1234567%')),
  'the audit log never holds passport values');

-- Billing: finance people only.
set local role authenticated;
select pg_temp.login('rahbar');
select lives_ok($$insert into public.client_billing(client_id, agreed_price, next_payment_on) values (pg_temp.id('client'), 6500000, current_date + 10)$$,
  'the Rahbar sets a client''s agreed price');
select lives_ok($$update public.client_billing set agreed_price = 7000000 where client_id = pg_temp.id('client')$$, 'and changes it');
select pg_temp.login('operator');
select is((select count(*) from public.client_billing), 0::bigint, 'an operator sees no prices');

-- Creating the workflow: skills are checked.
select pg_temp.login('rahbar');
select throws_ok($$select public.create_content_task(jsonb_build_object('title', 'Reklama', 'topic', 'Tovuq', 'client_id', pg_temp.id('client'),
  'shoot_at', now() + interval '2 days', 'operator_ids', jsonb_build_array(pg_temp.id('helper'))))$$, '22023', 'OPERATOR_SKILL',
  'only people with the operator skill are operators');
insert into aw_run select 'content', public.create_content_task(jsonb_build_object(
  'title', 'Yangi mahsulot reklamasi', 'topic', 'Yangi tovuq mahsulotlari', 'client_id', pg_temp.id('client'), 'content_type', 'reel',
  'shoot_at', now() + interval '2 days', 'post_at', now() + interval '4 days', 'location', 'Studiya',
  'scriptwriter_id', pg_temp.id('writer'), 'operator_ids', jsonb_build_array(pg_temp.id('operator')),
  'shoot_member_ids', jsonb_build_array(pg_temp.id('operator'), pg_temp.id('helper')),
  'responsible_ids', jsonb_build_array(pg_temp.id('rahbar')), 'equipment_ids', (select jsonb_agg(id) from public.equipment where name in ('Kamera', 'Shtativ'))));
reset role;

select set_eq($$select stage from public.tasks where content_id = (select id from aw_run where key = 'content')$$,
  array['script', 'equipment', 'shooting', 'editing', 'publishing'], 'every stage is one linked task');
select is((select array_agg(user_id) from public.task_assignments ta join public.tasks t on t.id = ta.task_id
  where t.content_id = (select id from aw_run where key = 'content') and t.stage = 'script'), array[pg_temp.id('writer')], 'the scriptwriter gets the script task');
select is((select count(*) from public.notifications where user_id = pg_temp.id('writer')), 1::bigint, 'one message for the scriptwriter, not one per row');
select is((select title from public.notifications where user_id = pg_temp.id('writer')), 'Ssenariy vazifasi berildi', 'telling them it is a script task');
select is((select count(*) from public.notifications where user_id = pg_temp.id('helper')), 1::bigint, 'the person going to the shoot hears once too');
select is((select count(*) from public.shooting_members where user_id = pg_temp.id('helper')), 1::bigint, 'and is on the shooting');
select is((select count(*) from public.content_assignments where user_id = pg_temp.id('helper')), 0::bigint, 'going to the shoot is not a role in the content');

-- Script: write, send, approve.
set local role authenticated;
select pg_temp.login('writer');
select lives_ok($$select public.save_script((select id from aw_run where key = 'content'), 'Kadr 1: tovuq')$$, 'the scriptwriter writes the script');
select throws_ok($$update public.tasks set status = 'done' where content_id = (select id from aw_run where key = 'content') and stage = 'script'$$,
  '42501', null, 'but cannot approve it');
select lives_ok($$select public.submit_script((select id from aw_run where key = 'content'))$$, 'and sends it');
select pg_temp.login('rahbar');
select lives_ok($$select public.review_script((select id from aw_run where key = 'content'), true, null)$$, 'the Rahbar approves it');
reset role;
select is((select status::text from public.content_items where id = (select id from aw_run where key = 'content')), 'ready_for_shoot', 'the content moves on');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('rahbar') and type = 'script.submitted'), 'the Rahbar was told it was sent');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('writer') and type = 'script.approved'), 'the scriptwriter was told it was approved');

-- Equipment: admins tick and confirm; the Rahbar is told.
set local role authenticated;
select pg_temp.login('operator');
select throws_ok($$select public.set_equipment_prepared((select id from aw_run where key = 'content'), (select id from public.equipment where name = 'Kamera'), true)$$,
  '42501', null, 'an operator does not tick equipment');
select pg_temp.login('admin');
select lives_ok($$select public.set_equipment_prepared((select id from aw_run where key = 'content'), (select id from public.equipment where name = 'Kamera'), true)$$, 'an admin ticks an item');
select throws_ok($$select public.confirm_equipment((select id from aw_run where key = 'content'))$$, '22023', 'EQUIPMENT_NOT_READY', 'confirming waits for every item');
select lives_ok($$select public.set_equipment_prepared((select id from aw_run where key = 'content'), (select id from public.equipment where name = 'Shtativ'), true)$$, 'the last item');
select lives_ok($$select public.confirm_equipment((select id from aw_run where key = 'content'))$$, 'then confirms');
reset role;
select ok((select equipment_ready_by = pg_temp.id('admin') from public.content_items where id = (select id from aw_run where key = 'content')), 'who confirmed is kept');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('rahbar') and type = 'equipment.ready' and body like '%Tasdiqladi:%'), 'the Rahbar is told');

-- Montaj: the editor needs the skill.
set local role authenticated;
select pg_temp.login('admin');
select throws_ok($$select public.assign_editing((select id from aw_run where key = 'content'), pg_temp.id('helper'), now() + interval '3 days')$$, '22023', 'EDITOR_SKILL',
  'only montajyors are picked');
select lives_ok($$select public.assign_editing((select id from aw_run where key = 'content'), pg_temp.id('editor'), now() + interval '3 days', 'Musiqa yengil')$$, 'a montajyor is assigned');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('editor') and type = 'editing.assigned'), 'and told');

-- "Keldim": only from the configured time, once a day, only for oneself.
update public.app_settings set value = '"23:59:59"' where key = 'attendance.check_in_from';
set local role authenticated;
select pg_temp.login('helper');
select throws_ok($$select public.check_in()$$, '22023', 'CHECK_IN_TOO_EARLY', 'before the opening time the button does not work');
reset role;
update public.app_settings set value = '"00:00"' where key = 'attendance.check_in_from';
set local role authenticated;
select pg_temp.login('helper');
select lives_ok($$select public.check_in()$$, 'after it, the employee marks their arrival');
select throws_ok($$select public.check_in()$$, '23505', 'ALREADY_CHECKED_IN', 'once a day');
select throws_ok($$insert into public.attendance(user_id, work_date, status) values (pg_temp.id('writer'), current_date, 'present')$$, '42501', null,
  'nobody marks a colleague');
reset role;
select is((select marked_by from public.attendance where user_id = pg_temp.id('helper')), pg_temp.id('helper'), 'the record shows it was self-marked');

-- Attendance alert: everyone is told once.
set local role authenticated;
select pg_temp.login('rahbar');
insert into aw_run select 'alert', public.report_attendance_error((select id from public.attendance where user_id = pg_temp.id('helper')), 'Vaqt noto‘g‘ri');
select is(public.report_attendance_error((select id from public.attendance where user_id = pg_temp.id('helper'))), (select id from aw_run where key = 'alert'),
  'a second report reuses the open alert');
reset role;
select is((select count(*) from public.notifications where type = 'attendance.error' and user_id = pg_temp.id('writer')), 1::bigint, 'each employee is told once');
set local role authenticated;
select pg_temp.login('operator');
select throws_ok($$select public.resolve_attendance_alert((select id from aw_run where key = 'alert'), 'ok')$$, '42501', null, 'an operator cannot close it');
select pg_temp.login('rahbar');
select lives_ok($$select public.resolve_attendance_alert((select id from aw_run where key = 'alert'), 'Tuzatildi')$$, 'the Rahbar closes it');
reset role;

-- Chat: reading records a per-person read time.
set local role authenticated;
select pg_temp.login('rahbar');
insert into aw_run select 'room', public.open_direct_chat(pg_temp.id('editor'));
select lives_ok($$select public.send_message((select id from aw_run where key = 'room'), 'SAFI videosini bugun tugating')$$, 'the Rahbar writes');
reset role;
-- One transaction has one now(): place the message and the last read a little in the past, as in real use.
update public.messages set created_at = now() - interval '1 minute' where room_id = (select id from aw_run where key = 'room');
update public.chat_members set last_read_at = now() - interval '2 minutes', last_delivered_at = null
  where room_id = (select id from aw_run where key = 'room') and user_id = pg_temp.id('editor');
set local role authenticated;
select pg_temp.login('editor');
select lives_ok($$select public.mark_chat_delivered()$$, 'the montajyor''s client receives it');
select lives_ok($$select public.mark_chat_read((select id from aw_run where key = 'room'))$$, 'and reads it');
select pg_temp.login('rahbar');
select is((select count(*) from public.message_reads mr join public.messages m on m.id = mr.message_id
  where m.room_id = (select id from aw_run where key = 'room') and mr.user_id = pg_temp.id('editor')), 1::bigint, 'the Rahbar sees it was read');
select pg_temp.login('helper');
select is((select count(*) from public.message_reads mr join public.messages m on m.id = mr.message_id where m.room_id = (select id from aw_run where key = 'room')),
  0::bigint, 'outsiders do not see the receipts');
reset role;

select * from finish();
rollback;
