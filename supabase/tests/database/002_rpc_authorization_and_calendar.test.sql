-- Seed-safe regressions: every fixture has a random ID/code and the transaction rolls back.
-- Run independently without resetting the simulator database:
-- npx supabase test db --local supabase/tests/database/002_rpc_authorization_and_calendar.test.sql
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table rpc_test_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on rpc_test_ids to authenticated, anon;
insert into rpc_test_ids (key) values
  ('owner'), ('editor'), ('other_editor'), ('client_a_user'), ('client_b_user'), ('disabled'),
  ('client_a'), ('client_b'), ('content_a'), ('content_b'), ('deleted_content'), ('cancelled_content'),
  ('shooting_active'), ('shooting_cancelled'), ('shooting_deleted'), ('file'), ('orphan_file');

create function pg_temp.rpc_test_id(p_key text) returns uuid language sql stable as $$
  select id from rpc_test_ids where key = p_key
$$;
grant execute on function pg_temp.rpc_test_id(text) to authenticated, anon;

create function pg_temp.rpc_test_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.rpc_test_id(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id || '@rpc-regression.local', jsonb_build_object('full_name', 'RPC regression ' || key), '{}'
from rpc_test_ids where key in ('owner', 'editor', 'other_editor', 'client_a_user', 'client_b_user', 'disabled');

insert into public.user_roles (user_id, role_id)
select i.id, r.id from rpc_test_ids i join public.roles r
  on r.key = case when i.key = 'owner' then 'owner' else 'editor' end
where i.key in ('owner', 'editor', 'other_editor', 'disabled');
insert into public.employees (user_id)
select id from rpc_test_ids where key in ('owner', 'editor', 'other_editor', 'disabled');
update public.profiles set status = 'disabled' where id = pg_temp.rpc_test_id('disabled');

insert into public.clients (id, name, code)
select id, 'RPC regression ' || key, 'RG' || upper(left(replace(id::text, '-', ''), 10))
from rpc_test_ids where key in ('client_a', 'client_b');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.rpc_test_id('client_a'), pg_temp.rpc_test_id('client_a_user'), id from public.roles where key = 'client_owner'
union all
select pg_temp.rpc_test_id('client_b'), pg_temp.rpc_test_id('client_b_user'), id from public.roles where key = 'client_owner';

insert into public.content_items (id, client_id, title, content_type, status, due_at, client_approval_due_at, deleted_at)
select id, pg_temp.rpc_test_id(case when key = 'content_b' then 'client_b' else 'client_a' end),
       'RPC regression ' || key, 'reel',
       case when key = 'cancelled_content' then 'cancelled' else 'script' end::public.content_status,
       now() + interval '1 hour', now() + interval '2 hours',
       case when key = 'deleted_content' then now() end
from rpc_test_ids where key in ('content_a', 'content_b', 'deleted_content', 'cancelled_content');
insert into public.content_assignments (content_id, user_id, role)
values (pg_temp.rpc_test_id('content_a'), pg_temp.rpc_test_id('editor'), 'editor');
insert into public.content_publications (content_id, client_id, platform, scheduled_at)
select id, client_id, 'instagram', now() + interval '3 hours' from public.content_items
where id in (pg_temp.rpc_test_id('content_a'), pg_temp.rpc_test_id('deleted_content'), pg_temp.rpc_test_id('cancelled_content'));

insert into public.shootings (id, client_id, title, starts_at, ends_at, status, deleted_at)
select id, pg_temp.rpc_test_id('client_a'), 'RPC regression ' || key, now() + interval '1 hour', now() + interval '2 hours',
       case when key = 'shooting_cancelled' then 'cancelled' else 'planned' end::public.shooting_status,
       case when key = 'shooting_deleted' then now() end
from rpc_test_ids where key in ('shooting_active', 'shooting_cancelled', 'shooting_deleted');

insert into public.files (id, client_id, name, external_url, status, uploaded_by)
select id, pg_temp.rpc_test_id('client_a'), 'RPC regression file', 'https://example.invalid/regression', 'uploaded',
       case when key = 'file' then pg_temp.rpc_test_id('editor') end
from rpc_test_ids where key in ('file', 'orphan_file');

-- Function grants must protect the API even before function-body authorization runs.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
          'anon cannot execute any application RPC');
select ok(has_function_privilege('authenticated', 'public.get_my_context()', 'EXECUTE'), 'signed-in session context grant is unchanged');
select ok(has_function_privilege('authenticated', 'public.get_client_home(uuid)', 'EXECUTE'), 'client Home grant is unchanged');
select ok(not has_function_privilege('authenticated', 'public.claim_push_deliveries(integer)', 'EXECUTE'), 'push claims remain service-only');
select ok(has_function_privilege('service_role', 'public.claim_push_deliveries(integer)', 'EXECUTE'), 'push service role retains access');
select ok(not has_function_privilege('anon', 'pg_temp.rpc_test_login(text)', 'EXECUTE'), 'new functions no longer inherit global PUBLIC execute');

set local role anon;
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_a'), 'script')$$, '42501', null,
                 'anonymous no-op content access denied');
select throws_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('editor'), current_date - 7, current_date)$$, '42501', null,
                 'anonymous attendance summary denied');
select throws_ok($$select * from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('editor'))$$, '42501', null,
                 'anonymous employee scorecard denied');
select throws_ok($$select public.complete_file_upload(pg_temp.rpc_test_id('orphan_file'))$$, '42501', null,
                 'anonymous orphan-file metadata denied');
reset role;

-- Exercise body guards with authenticated DB role but no JWT subject, separately from grants.
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_a'), 'script')$$, '42501', null,
                 'missing subject cannot read no-op content');
select throws_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('editor'), current_date - 7, current_date)$$, '42501', null,
                 'missing subject cannot bypass attendance guard through NULL');
select throws_ok($$select * from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('editor'))$$, '42501', null,
                 'missing subject cannot bypass scorecard guard through NULL');
select throws_ok($$select public.complete_file_upload(pg_temp.rpc_test_id('orphan_file'))$$, '42501', null,
                 'missing subject cannot claim a file with NULL uploader');
reset role;

select pg_temp.rpc_test_login('client_a_user');
select is((select count(*)::int from public.content_items where id = pg_temp.rpc_test_id('content_b')), 0, 'cross-client RLS hides content');
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_b'), 'script')$$, '42501', null,
                 'same-status RPC cannot bypass cross-client RLS');
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_a'), 'script')$$, '42501', null,
                 'client content visibility does not grant status-write permission');
select throws_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('editor'), current_date - 7, current_date)$$, '42501', null,
                 'client cannot inspect employee attendance');
select throws_ok($$select * from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('editor'))$$, '42501', null,
                 'client cannot inspect employee scorecard');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_a'))
           where event_type = 'shooting'), 1, 'client calendar includes only active, undeleted shooting');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_b'))), 0,
          'calendar preserves cross-client isolation');
select lives_ok($$select public.get_client_home(pg_temp.rpc_test_id('client_a'))$$, 'client Home still works with hardened RPC grants');
reset role;

select pg_temp.rpc_test_login('other_editor');
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_a'), 'script')$$, '42501', null,
                 'unassigned employee cannot retrieve same-status content');
select throws_ok($$select public.complete_file_upload(pg_temp.rpc_test_id('file'))$$, 'P0002', null,
                 'another employee cannot complete or read uploaded file');
reset role;

select pg_temp.rpc_test_login('editor');
select is((public.set_content_status(pg_temp.rpc_test_id('content_a'), 'script')).status::text, 'script',
          'assigned employee retains idempotent status updates');
select is((public.set_content_status(pg_temp.rpc_test_id('content_a'), 'ready_for_shoot')).status::text, 'ready_for_shoot',
          'assigned employee retains allowed forward transition');
select throws_ok($$select public.set_content_status(pg_temp.rpc_test_id('content_a'), 'idea')$$, '42501', null,
                 'assigned employee still cannot move backwards');
select lives_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('editor'), current_date - 7, current_date)$$,
                'employee retains own attendance summary');
select is((select count(*)::int from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('editor'))), 1,
          'employee retains own scorecard');
select is((public.complete_file_upload(pg_temp.rpc_test_id('file'))).status::text, 'uploaded', 'uploader retains idempotent upload completion');
select lives_ok($$select public.get_employee_home()$$, 'employee Home remains available');
reset role;

select pg_temp.rpc_test_login('disabled');
select throws_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('disabled'), current_date - 7, current_date)$$, '42501', null,
                 'disabled employee cannot read own attendance through RPC');
select throws_ok($$select * from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('disabled'))$$, '42501', null,
                 'disabled employee cannot read own scorecard through RPC');
reset role;

select pg_temp.rpc_test_login('owner');
select is((public.set_content_status(pg_temp.rpc_test_id('content_b'), 'script')).status::text, 'script', 'owner retains cross-client management');
select lives_ok($$select public.get_attendance_summary(pg_temp.rpc_test_id('editor'), current_date - 7, current_date)$$, 'owner retains team attendance');
select is((select count(*)::int from public.get_employee_scorecards(current_date - 7, current_date, pg_temp.rpc_test_id('editor'))), 1,
          'owner retains team performance');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_a'))
           where event_type = 'shooting'), 1, 'owner calendar hides cancelled and deleted shootings despite broad RLS');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_a'))
           where content_id = pg_temp.rpc_test_id('deleted_content')), 0, 'deleted content creates no calendar events for managers');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_a'))
           where content_id = pg_temp.rpc_test_id('cancelled_content')), 0, 'cancelled content creates no calendar events for managers');
select is((select count(*)::int from public.get_calendar_events(now(), now() + interval '1 day', pg_temp.rpc_test_id('client_a'))
           where content_id = pg_temp.rpc_test_id('content_a')), 3, 'active content retains publication, approval and content-deadline events');
select lives_ok($$select public.get_command_center()$$, 'owner Command Center remains available');
select lives_ok($$select public.get_my_context()$$, 'session context remains available without auth changes');
reset role;

select * from finish();
rollback;
