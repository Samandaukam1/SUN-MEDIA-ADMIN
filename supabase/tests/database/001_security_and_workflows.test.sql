-- SUN MEDIA — RLS isolation, role boundaries and end-to-end workflow tests.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Test harness
-- ---------------------------------------------------------------------------
create temp table ids (key text primary key, id uuid not null);
grant select, insert on ids to authenticated, anon;

create function pg_temp.id(p_key text) returns uuid language sql stable as $$
  select id from ids where key = p_key
$$;

create function pg_temp.new_user(p_key text, p_name text) returns uuid language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_key || '@test.sunmedia.uz', jsonb_build_object('full_name', p_name), '{}', now(), now());
  insert into ids values (p_key, v);
  return v;
end $$;

create function pg_temp.staff(p_key text, p_role text) returns void language plpgsql as $$
begin
  insert into public.user_roles (user_id, role_id) select pg_temp.id(p_key), id from public.roles where key = p_role;
  insert into public.employees (user_id, job_title) values (pg_temp.id(p_key), p_role) on conflict do nothing;
end $$;

create function pg_temp.login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Helpers are called after switching to the authenticated role.
grant execute on function pg_temp.id(text) to authenticated, anon;
grant execute on function pg_temp.new_user(text, text) to authenticated, anon;
grant execute on function pg_temp.staff(text, text) to authenticated, anon;
grant execute on function pg_temp.login(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixture (as postgres)
-- ---------------------------------------------------------------------------
select pg_temp.new_user('owner', 'Owner');
select pg_temp.new_user('admin', 'Admin');
select pg_temp.new_user('pm', 'Project Manager');
select pg_temp.new_user('smm', 'SMM Manager');
select pg_temp.new_user('editor', 'Jasur');
select pg_temp.new_user('editor2', 'Boshqa Montajyor');
select pg_temp.new_user('operator', 'Anisjon Abdullayev');
select pg_temp.new_user('client_safi', 'SAFI Owner');
select pg_temp.new_user('client_safi_emp', 'SAFI Employee');
select pg_temp.new_user('client_wd', 'WeDrink Owner');
select pg_temp.new_user('stranger', 'No Role');

select pg_temp.staff('owner', 'owner');
select pg_temp.staff('admin', 'admin');
select pg_temp.staff('pm', 'project_manager');
select pg_temp.staff('smm', 'smm_manager');
select pg_temp.staff('editor', 'editor');
select pg_temp.staff('editor2', 'editor');
select pg_temp.staff('operator', 'operator');

insert into public.clients (id, name, code, created_by) values
  (gen_random_uuid(), 'SAFI', 'TSTSAFI', pg_temp.id('owner')),
  (gen_random_uuid(), 'WeDrink', 'TSTWEDRINK', pg_temp.id('owner'));
insert into ids select 'safi', id from public.clients where code = 'TSTSAFI';
insert into ids select 'wd', id from public.clients where code = 'TSTWEDRINK';

insert into public.client_members (client_id, user_id, role_id)
select pg_temp.id('safi'), pg_temp.id('client_safi'), id from public.roles where key = 'client_owner';
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.id('safi'), pg_temp.id('client_safi_emp'), id from public.roles where key = 'client_employee';
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.id('wd'), pg_temp.id('client_wd'), id from public.roles where key = 'client_owner';

insert into public.client_team_members (client_id, user_id, team_role) values
  (pg_temp.id('safi'), pg_temp.id('pm'), 'project_manager'),
  (pg_temp.id('safi'), pg_temp.id('smm'), 'smm_manager');

insert into public.content_items (client_id, title, content_type, status)
values (pg_temp.id('wd'), 'WeDrink Reel', 'reel', 'editing');

-- ---------------------------------------------------------------------------
-- Provisioning
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.folders where client_id = pg_temp.id('safi') and is_system), 9,
  'every client gets 9 system folders');
select is((select count(*)::int from public.chat_members cm join public.chat_rooms r on r.id = cm.room_id
           where r.client_id = pg_temp.id('safi') and r.is_default), 4,
  'SAFI project chat has 2 client users + PM + SMM');
select ok(exists (select 1 from public.chat_members cm join public.chat_rooms r on r.id = cm.room_id
                  where r.kind = 'internal' and r.is_default and cm.user_id = pg_temp.id('editor')),
  'staff auto-join the internal chat');
select ok(not exists (select 1 from public.chat_members cm join public.chat_rooms r on r.id = cm.room_id
                      where r.kind = 'internal' and cm.user_id = pg_temp.id('client_safi')),
  'client users never join the internal chat');

-- ---------------------------------------------------------------------------
-- PM builds the SAFI plan through RLS
-- ---------------------------------------------------------------------------
select pg_temp.login('pm');
insert into public.content_items (client_id, title, content_type, script, due_at, client_approval_due_at)
values (pg_temp.id('safi'), 'Mahsulot qanday tayyorlanadi?', 'reel', 'Ssenariy', now() + interval '1 day', now() + interval '2 days');
insert into public.content_items (client_id, title, content_type, is_client_visible)
values (pg_temp.id('safi'), 'Ichki g''oya', 'post', false);
reset role;
insert into ids select 'reel', id from public.content_items where title = 'Mahsulot qanday tayyorlanadi?' and client_id = pg_temp.id('safi');
insert into ids select 'hidden', id from public.content_items where title = 'Ichki g''oya' and client_id = pg_temp.id('safi');

select is((select number from public.content_items where id = pg_temp.id('reel')), 1, 'content numbered per client and type');
select is((select created_by from public.content_items where id = pg_temp.id('reel')), pg_temp.id('pm'), 'created_by forced to caller');

select pg_temp.login('pm');
insert into public.shootings (client_id, title, starts_at, ends_at, location_name)
values (pg_temp.id('safi'), 'SAFI Yunusobod', now() + interval '1 hour', now() + interval '3 hours', 'SAFI Yunusobod filiali');
reset role;
insert into ids select 'shoot', id from public.shootings where title = 'SAFI Yunusobod' and client_id = pg_temp.id('safi');
update public.content_items set shooting_id = pg_temp.id('shoot') where id = pg_temp.id('reel');

select pg_temp.login('pm');
insert into public.shooting_members (shooting_id, user_id, role) values (pg_temp.id('shoot'), pg_temp.id('operator'), 'operator');
insert into public.content_assignments (content_id, user_id, role) values (pg_temp.id('reel'), pg_temp.id('editor'), 'editor');
insert into public.content_comments (content_id, client_id, author_id, body, visibility) values
  (pg_temp.id('reel'), pg_temp.id('safi'), pg_temp.id('pm'), 'Ichki izoh', 'internal'),
  (pg_temp.id('reel'), pg_temp.id('safi'), pg_temp.id('pm'), 'Mijoz uchun izoh', 'client');
insert into public.tasks (content_id, title, task_type, due_at)
values (pg_temp.id('reel'), 'SAFI Reel #1 montaj', 'editing', now() + interval '5 hours');
reset role;
insert into ids select 'task', id from public.tasks where title = 'SAFI Reel #1 montaj' and client_id = pg_temp.id('safi');

select is((select client_id from public.tasks where id = pg_temp.id('task')), pg_temp.id('safi'), 'task inherits client from content');

select pg_temp.login('pm');
insert into public.task_assignments (task_id, user_id) values (pg_temp.id('task'), pg_temp.id('editor'));
reset role;

select pg_temp.login('pm');
select throws_ok(
  $$insert into public.content_items (client_id, title, content_type) values (pg_temp.id('wd'), 'x', 'reel')$$,
  '42501', null, 'PM cannot create content for a client they are not assigned to');
reset role;

-- ---------------------------------------------------------------------------
-- Client isolation
-- ---------------------------------------------------------------------------
select pg_temp.login('client_safi');
select is((select count(*)::int from public.clients), 1, 'client sees only their own company');
select is((select count(*)::int from public.content_items), 1, 'client sees own client-visible content only');
select is((select count(*)::int from public.content_items where client_id = pg_temp.id('wd')), 0, 'client never sees another client''s content');
select is((select count(*)::int from public.tasks), 0, 'client never sees internal tasks');
select is((select count(*)::int from public.content_comments), 1, 'client sees only client-visible comments');
select is((select count(*)::int from public.shootings), 1, 'client sees own shooting');
select is((select count(*)::int from public.shooting_members), 1, 'client sees who is shooting');
select is((select count(*)::int from public.folders), 7, 'client sees only shared folders (RAW/EDITED hidden)');
select is((select count(*)::int from public.profiles where id = pg_temp.id('editor')), 1, 'client sees the assigned editor');
select is((select count(*)::int from public.profiles where id = pg_temp.id('editor2')), 0, 'client cannot see unrelated staff');
select is((select count(*)::int from public.profiles where id = pg_temp.id('client_wd')), 0, 'client cannot see other clients'' users');
select is((select count(*)::int from public.audit_logs), 0, 'client cannot read the audit log');
select is((select count(*)::int from public.attendance), 0, 'client cannot read attendance');
update public.content_items set title = 'hacked' where id = pg_temp.id('reel');
select throws_ok(
  $$select public.set_content_status(pg_temp.id('reel'), 'approved')$$,
  '42501', null, 'client cannot move content through the pipeline');
select throws_ok(
  $$insert into public.attendance (user_id, work_date, status) values (pg_temp.id('editor'), current_date, 'present')$$,
  '42501', null, 'client cannot write attendance');
select ok(private.can_access_topic('client:' || pg_temp.id('safi')), 'client may subscribe to own client topic');
select ok(not private.can_access_topic('client:' || pg_temp.id('wd')), 'client may not subscribe to another client topic');
select ok(not private.can_access_topic('staff'), 'client may not subscribe to the staff topic');
select ok(not private.can_access_topic('user:' || pg_temp.id('editor')), 'client may not subscribe to another user topic');
reset role;
select is((select title from public.content_items where id = pg_temp.id('reel')), 'Mahsulot qanday tayyorlanadi?', 'client update was silently blocked by RLS');

-- ---------------------------------------------------------------------------
-- Staff role boundaries
-- ---------------------------------------------------------------------------
select pg_temp.login('editor2');
select is((select count(*)::int from public.content_items where client_id = pg_temp.id('safi')), 0, 'unassigned editor sees no SAFI content');
select is((select count(*)::int from public.tasks), 0, 'unassigned editor sees no tasks');
reset role;

select pg_temp.login('editor');
select is((select count(*)::int from public.content_items), 1, 'editor sees only assigned content');
select is((select count(*)::int from public.tasks), 1, 'editor sees own task');
select is((select count(*)::int from public.content_comments), 2, 'staff see internal and client comments');
select is((select count(*)::int from public.client_subscriptions), 0, 'editor cannot see billing');
select throws_ok(
  $$update public.tasks set due_at = now() + interval '9 days' where id = pg_temp.id('task')$$,
  '42501', null, 'assignee cannot move their own deadline');
select lives_ok(
  $$update public.tasks set status = 'in_progress' where id = pg_temp.id('task')$$,
  'assignee can change task status');
select throws_ok(
  $$select public.set_content_status(pg_temp.id('reel'), 'approved')$$,
  '42501', null, 'editor cannot approve content');
select throws_ok(
  $$select public.get_command_center()$$,
  '42501', null, 'editor has no access to the command center');
reset role;
select isnt((select started_at from public.tasks where id = pg_temp.id('task')), null, 'task start time recorded');

select pg_temp.login('operator');
select is((select count(*)::int from public.shootings), 1, 'operator sees their shooting');
select is((select count(*)::int from public.content_items), 1, 'operator sees content of their shooting (script)');
update public.shooting_attendance set status = 'arrived' where shooting_id = pg_temp.id('shoot');
select throws_ok(
  $$insert into public.attendance (user_id, work_date, status) values (pg_temp.id('operator'), current_date, 'present')$$,
  '42501', null, 'employee cannot mark their own attendance');
reset role;
select is((select status::text from public.shooting_attendance where shooting_id = pg_temp.id('shoot')), 'pending',
  'operator cannot mark their own shooting attendance');

-- ---------------------------------------------------------------------------
-- Admin: attendance, escalation guards
-- ---------------------------------------------------------------------------
select pg_temp.login('admin');
select lives_ok(
  $$insert into public.attendance (user_id, work_date, status, arrived_at) values (pg_temp.id('operator'), current_date, 'late', '09:40')$$,
  'admin marks attendance');
select lives_ok(
  $$update public.shooting_attendance set status = 'arrived' where shooting_id = pg_temp.id('shoot') and user_id = pg_temp.id('operator')$$,
  'admin marks shooting attendance');
select throws_ok(
  $$insert into public.user_roles (user_id, role_id) select pg_temp.id('editor2'), id from public.roles where key = 'owner'$$,
  '42501', null, 'admin cannot grant the owner role');
select ok((public.get_command_center() -> 'attendance' ->> 'late')::int >= 1, 'command center reflects attendance');
reset role;
select is((select late_minutes from public.attendance where user_id = pg_temp.id('operator')), 40, 'late minutes computed from work start');
select is((select count(*)::int from public.attendance_history where user_id = pg_temp.id('operator')), 2,
  'attendance history kept for daily and shooting attendance');
select ok(exists (select 1 from public.audit_logs where action = 'attendance.insert' and actor_id = pg_temp.id('admin')),
  'attendance change audited with actor');

-- The local development seed has its own owner. Inside this rolled-back transaction the test
-- owner must be the only one, otherwise the "last owner" guard is (correctly) not triggered.
reset role;
delete from public.user_roles ur using public.roles r
where r.id = ur.role_id and r.key = 'owner' and ur.user_id not in (select id from ids);
select pg_temp.login('owner');
select throws_ok(
  $$delete from public.user_roles where user_id = pg_temp.id('owner')$$,
  '42501', null, 'the last owner cannot be removed');
reset role;

-- ---------------------------------------------------------------------------
-- Approval pipeline: editor → internal review → client → revision → approval → publish
-- ---------------------------------------------------------------------------
select pg_temp.login('pm');
select lives_ok($$select public.set_content_status(pg_temp.id('reel'), 'shooting')$$, 'PM moves content to SHOOTING');
reset role;
select pg_temp.login('editor');
select throws_ok($$select public.set_content_status(pg_temp.id('reel'), 'idea')$$, '42501', null, 'editor cannot move content backwards');
select lives_ok($$select public.set_content_status(pg_temp.id('reel'), 'editing')$$, 'assigned editor moves SHOOTING → EDITING');
select lives_ok(
  $$insert into ids select 'cut1', id from public.create_file_upload('cut v1.mp4', 'video/mp4', 1048576, pg_temp.id('safi'),
      (select id from public.folders where client_id = pg_temp.id('safi') and kind = 'edited'), pg_temp.id('reel'))$$,
  'editor registers an upload for assigned content');
reset role;
select throws_ok(
  $$select public.complete_file_upload(pg_temp.id('cut1'))$$,
  'P0002', null, 'upload cannot complete before the object exists (and only by uploader)');
insert into storage.objects (bucket_id, name, owner, metadata)
select bucket, storage_path, uploaded_by, '{"size": 1048576, "mimetype": "video/mp4"}'::jsonb from public.files where id = pg_temp.id('cut1');

select pg_temp.login('editor');
select is((public.complete_file_upload(pg_temp.id('cut1'))).status::text, 'uploaded', 'uploader completes the upload');
select lives_ok(
  $$insert into ids select 'v1', id from public.submit_content_version(pg_temp.id('reel'), pg_temp.id('cut1'), 'Birinchi variant')$$,
  'editor submits a version for internal review');
select throws_ok(
  $$select public.submit_content_version(pg_temp.id('reel'), pg_temp.id('cut1'), null, 'client')$$,
  '42501', null, 'editor cannot bypass internal review');
reset role;

select pg_temp.login('client_safi');
select is((select count(*)::int from public.content_versions), 0, 'client cannot see versions still in internal review');
select is((select count(*)::int from public.files where id = pg_temp.id('cut1')), 0, 'client cannot see internal cut');
reset role;

select pg_temp.login('pm');
select lives_ok($$select public.review_content_version(pg_temp.id('v1'), 'approved', 'Mijozga yuborildi')$$, 'PM approves internally');
reset role;
select is((select status::text from public.content_items where id = pg_temp.id('reel')), 'client_review', 'content moved to CLIENT REVIEW');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('client_safi') and type = 'approval.requested'),
  'client owner notified: video ready for approval');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.id('client_safi_emp') and type = 'approval.requested'),
  'client employee without approve permission is not asked to approve');

select pg_temp.login('client_safi_emp');
select throws_ok(
  $$select public.review_content_version(pg_temp.id('v1'), 'approved')$$,
  '42501', null, 'client employee cannot approve by default');
reset role;

select pg_temp.login('client_wd');
select is((select count(*)::int from public.content_versions), 0, 'another client never sees SAFI versions');
select throws_ok(
  $$select public.review_content_version(pg_temp.id('v1'), 'approved')$$,
  '42501', null, 'another client cannot approve SAFI content');
reset role;

select pg_temp.login('client_safi');
select is((select count(*)::int from public.content_versions), 1, 'client sees the version sent to them');
select is((select count(*)::int from public.files where id = pg_temp.id('cut1')), 1, 'client can now stream the cut');
select lives_ok(
  $$select public.review_content_version(pg_temp.id('v1'), 'changes_requested', 'Ikki joyni o''zgartiring',
      '[{"timecode_ms": 13000, "body": "Logo kattaroq bo''lsin"}, {"timecode_ms": 27000, "body": "Bu kadrni almashtiring"}]')$$,
  'client requests changes with timecoded comments');
reset role;
select is((select status::text from public.content_items where id = pg_temp.id('reel')), 'revision', 'content moved to REVISION');
select is((select revision_count from public.content_items where id = pg_temp.id('reel')), 1, 'revision counted');
select is((select count(*)::int from public.revision_comments where revision_id in (select id from public.revisions where content_id = pg_temp.id('reel'))), 2, 'timecoded comments stored');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('editor') and type = 'approval.changes_requested'),
  'editor notified about requested changes');

select pg_temp.login('editor');
select is((select array_agg(timecode_ms order by timecode_ms) from public.revision_comments where revision_id in (select id from public.revisions where content_id = pg_temp.id('reel'))), array[13000, 27000],
  'editor sees comments on the timeline');
select lives_ok($$update public.revision_comments set is_resolved = true where timecode_ms = 13000 and revision_id in (select id from public.revisions where content_id = pg_temp.id('reel'))$$, 'editor resolves a comment');
reset role;

select pg_temp.login('client_safi');
select throws_ok(
  $$update public.revision_comments set is_resolved = false where timecode_ms = 13000 and revision_id in (select id from public.revisions where content_id = pg_temp.id('reel'))$$,
  '42501', null, 'client cannot un-resolve staff work');
reset role;

select pg_temp.login('editor');
select lives_ok($$select public.set_content_status(pg_temp.id('reel'), 'editing')$$, 'editor returns to editing');
insert into ids select 'cut2', id from public.create_file_upload('cut v2.mp4', 'video/mp4', 2097152, pg_temp.id('safi'),
  (select id from public.folders where client_id = pg_temp.id('safi') and kind = 'edited'), pg_temp.id('reel'));
reset role;
insert into storage.objects (bucket_id, name, owner, metadata)
select bucket, storage_path, uploaded_by, '{"size": 2097152, "mimetype": "video/mp4"}'::jsonb from public.files where id = pg_temp.id('cut2');

select pg_temp.login('editor');
select public.complete_file_upload(pg_temp.id('cut2'));
insert into ids select 'v2', id from public.submit_content_version(pg_temp.id('reel'), pg_temp.id('cut2'), 'Tuzatildi');
reset role;
select is((select status::text from public.revisions where content_id = pg_temp.id('reel')), 'resolved', 'new version resolves the open revision');

select pg_temp.login('smm');
select lives_ok($$select public.review_content_version(pg_temp.id('v2'), 'approved')$$, 'SMM manager approves internally');
reset role;

select pg_temp.login('client_safi');
select lives_ok($$select public.review_content_version(pg_temp.id('v2'), 'approved', 'Zo''r!')$$, 'client approves');
select is((select count(*)::int from public.client_approvals), 2, 'client sees their approval history only (internal decisions hidden)');
reset role;
select is((select status::text from public.content_items where id = pg_temp.id('reel')), 'approved', 'content APPROVED');
select isnt((select approved_at from public.content_items where id = pg_temp.id('reel')), null, 'approval time recorded');
select is((select fo.kind::text from public.files f join public.folders fo on fo.id = f.folder_id where f.id = pg_temp.id('cut2')),
  'approved', 'approved cut filed into APPROVED');
select ok(exists (select 1 from public.client_approvals where version_id = pg_temp.id('v2') and decided_by = pg_temp.id('client_safi')),
  'who approved is recorded');

-- Tariff + publication → usage
select pg_temp.login('admin');
insert into public.plans (name, slug, price) values ('Premium', 'tst-premium', 15000000);
insert into public.plan_features (plan_id, service_key, quantity)
select id, x.k, x.q from public.plans, (values ('reels', 12), ('posts', 8), ('stories', 40), ('shooting_days', 4), ('designs', 6)) x(k, q)
where slug = 'tst-premium';
insert into public.client_subscriptions (client_id, plan_id, starts_on, ends_on, price)
select pg_temp.id('safi'), id, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 15000000
from public.plans where slug = 'tst-premium';
reset role;
select is((select count(*)::int from public.subscription_quotas q join public.client_subscriptions cs on cs.id = q.subscription_id
           where cs.client_id = pg_temp.id('safi')), 5, 'plan features snapshotted into subscription quotas');

select pg_temp.login('smm');
select lives_ok($$select public.set_content_status(pg_temp.id('reel'), 'scheduled')$$, 'SMM schedules approved content');
insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
values (pg_temp.id('reel'), pg_temp.id('safi'), 'instagram', now() - interval '10 minutes', 'scheduled');
update public.content_publications set status = 'published', published_at = now(), published_by = auth.uid(),
  post_url = 'https://instagram.com/p/test' where content_id = pg_temp.id('reel');
reset role;
select is((select status::text from public.content_items where id = pg_temp.id('reel')), 'published', 'publishing all platforms publishes the content');
select is((select sum(quantity)::int from public.client_plan_usage where client_id = pg_temp.id('safi') and service_key = 'reels'), 1,
  'reel usage recorded automatically');

select pg_temp.login('client_safi');
select is((select used from public.subscription_usage_summary where service_key = 'reels'), 1, 'client sees Reels 1 / 12');
select is((select planned from public.subscription_usage_summary where service_key = 'reels'), 12, 'client sees plan quantity');
select lives_ok(
  $$insert into public.plan_upgrade_requests (client_id, requested_plan_id, message) select pg_temp.id('safi'), id, 'Ko''proq reels kerak' from public.plans where slug = 'tst-premium'$$,
  'client owner requests a plan upgrade');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('admin') and type = 'plan.upgrade_requested'),
  'admin notified about upgrade request');

select pg_temp.login('client_safi_emp');
select is((select count(*)::int from public.client_subscriptions), 0, 'client employee cannot see the plan and price');
reset role;

-- ---------------------------------------------------------------------------
-- Monthly report
-- ---------------------------------------------------------------------------
select pg_temp.login('pm');
select lives_ok($$insert into ids select 'report', id from public.generate_monthly_report(pg_temp.id('safi'), current_date)$$,
  'PM generates the monthly report');
reset role;
select is((select value::int from public.monthly_report_metrics where report_id = pg_temp.id('report') and metric_key = 'delivery.reels'), 1,
  'report counts delivered reels');
select is((select target_value::int from public.monthly_report_metrics where report_id = pg_temp.id('report') and metric_key = 'delivery.reels'), 12,
  'report shows planned reels');
select ok(not exists (select 1 from public.monthly_report_metrics where report_id = pg_temp.id('report') and section = 'social'),
  'no social metrics are invented when none were entered');

select pg_temp.login('client_safi');
select is((select count(*)::int from public.monthly_reports), 0, 'client cannot see a draft report');
reset role;

select pg_temp.login('pm');
select public.publish_monthly_report(pg_temp.id('report'));
reset role;

select pg_temp.login('client_safi');
select is((select count(*)::int from public.monthly_reports), 1, 'client sees the published report');
select is((select count(*)::int from public.monthly_report_metrics where section = 'internal'), 0, 'internal operational metrics hidden from client');
reset role;

select pg_temp.login('client_wd');
select is((select count(*)::int from public.monthly_reports), 0, 'other clients never see the SAFI report');
reset role;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
insert into ids select 'internal_room', id from public.chat_rooms where kind = 'internal' and is_default;
select pg_temp.login('client_safi');
select is((select count(*)::int from public.chat_rooms), 1, 'client sees only their project chat');
select lives_ok(
  $$insert into public.messages (room_id, body) select id, 'Salom!' from public.chat_rooms where client_id = pg_temp.id('safi')$$,
  'client writes to the project chat');
select throws_ok(
  $$insert into public.messages (room_id, body) values (pg_temp.id('internal_room'), 'hi')$$,
  '42501', null, 'client cannot write to the internal chat');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('pm') and type = 'chat.message'),
  'room members are notified about new messages');

-- ---------------------------------------------------------------------------
-- Users without a role and anon
-- ---------------------------------------------------------------------------
select pg_temp.login('stranger');
select is((select count(*)::int from public.clients), 0, 'user without a role sees no clients');
select is((select count(*)::int from public.content_items), 0, 'user without a role sees no content');
reset role;

set local role anon;
select throws_ok($$select count(*) from public.clients$$, '42501', null, 'anon has no table access');
reset role;

-- ---------------------------------------------------------------------------
-- Deadline alerts
-- ---------------------------------------------------------------------------
update public.tasks set due_at = now() - interval '1 minute', overdue_at = null where id = pg_temp.id('task');
select ok(private.process_deadline_alerts() > 0, 'deadline processor sends alerts');
select isnt((select overdue_at from public.tasks where id = pg_temp.id('task')), null, 'task marked OVERDUE');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('owner') and type = 'deadline.overdue'),
  'owner notified about overdue task');
select is(private.process_deadline_alerts(), 0, 'alerts are sent once per rule and deadline');

select * from finish();
rollback;
