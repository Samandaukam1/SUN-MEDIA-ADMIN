-- SUN MEDIA — every new assignment is accepted by its own person; managers see who and when.
begin;

create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ak_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on ak_ids to authenticated, anon;
insert into ak_ids (key) values ('pm'), ('aziz'), ('jasur'), ('madina'), ('outsider'), ('client');

create function pg_temp.ak(p_key text) returns uuid language sql stable as $$ select id from ak_ids where key = p_key $$;
grant execute on function pg_temp.ak(text) to authenticated, anon;
create function pg_temp.ak_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ak(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.ak_login(text) to authenticated, anon;
create function pg_temp.notes(p_key text, p_task text) returns bigint language sql stable security definer as $$
  select count(*) from public.notifications where user_id = pg_temp.ak(p_key) and type = 'task.assigned' and entity_id = pg_temp.ak(p_task)
$$;
grant execute on function pg_temp.notes(text, text) to authenticated, anon;
create function pg_temp.note(p_key text, p_task text) returns public.notifications language sql stable security definer as $$
  select * from public.notifications where user_id = pg_temp.ak(p_key) and type = 'task.assigned' and entity_id = pg_temp.ak(p_task) limit 1
$$;
grant execute on function pg_temp.note(text, text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@ack-tests.local',
       jsonb_build_object('full_name', initcap(key)), '{}'
from ak_ids where key <> 'client';
insert into public.user_roles (user_id, role_id)
select i.id, r.id from ak_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' when 'madina' then 'designer' else 'editor' end
where i.key <> 'client';
insert into public.employees (user_id) select id from ak_ids where key not in ('client');
insert into public.clients (id, name, code) values (pg_temp.ak('client'), 'Ack client', 'AK' || upper(left(replace(pg_temp.ak('client')::text, '-', ''), 10)));
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.ak('client'), pg_temp.ak('pm'), 'project_manager');

-- 1. An ordinary task for one person: notified, must accept.
select pg_temp.ak_login('pm');
insert into ak_ids (key, id) select 'one', public.save_task(null, jsonb_build_object(
  'client_id', pg_temp.ak('client'), 'title', 'Oddiy vazifa', 'task_type', 'other',
  'due_at', (now() + interval '1 day')::text, 'assignees', jsonb_build_array(pg_temp.ak('aziz'))));
select is(pg_temp.notes('aziz', 'one'), 1::bigint, 'the assignee of an ordinary task is notified once');
select is((pg_temp.note('aziz', 'one')).title, 'Sizga yangi vazifa biriktirildi!', 'notification title');
select is((pg_temp.note('aziz', 'one')).body, 'Oddiy vazifa — vazifani ko‘rib chiqing va qabul qiling.', 'notification body');
select is((pg_temp.note('aziz', 'one')).data ->> 'staff_href', '/xodim/vazifa/' || pg_temp.ak('one'), 'the notification opens the task in the staff cabinet');
select is((select count(*) from public.notifications where user_id = pg_temp.ak('pm') and entity_id = pg_temp.ak('one')), 0::bigint, 'the manager is not notified about the task');
select ok((select ack_required and acknowledged_at is null from public.task_assignments where task_id = pg_temp.ak('one') and user_id = pg_temp.ak('aziz')), 'the new assignment waits for acceptance');

select pg_temp.ak_login('aziz');
select is((select count(*) from public.get_my_pending_acks() where task_id = pg_temp.ak('one')), 1::bigint, 'it is pending for the assignee');
select is((select client_name from public.get_my_pending_acks() where task_id = pg_temp.ak('one')), 'Ack client', 'with its client');
select pg_temp.ak_login('outsider');
select is((select count(*) from public.get_my_pending_acks()), 0::bigint, 'nobody else sees it pending');
select throws_ok($$select public.acknowledge_task(pg_temp.ak('one'))$$, 'P0002', null, 'a non-assignee cannot accept it');

select pg_temp.ak_login('aziz');
create temp table first_ack as select public.acknowledge_task(pg_temp.ak('one')) as at;
select ok((select at is not null from first_ack), 'accepted with a server timestamp');
select is(public.acknowledge_task(pg_temp.ak('one')), (select at from first_ack), 'pressing again keeps the first time (idempotent)');
select is((select status::text from public.tasks where id = pg_temp.ak('one')), 'todo', 'accepting does not start or finish the task');
select is((select count(*) from public.get_my_pending_acks()), 0::bigint, 'nothing pending after accepting');

-- 2. Three people: each notified and each accepts on their own.
select pg_temp.ak_login('pm');
insert into ak_ids (key, id) select 'three', public.save_task(null, jsonb_build_object(
  'client_id', pg_temp.ak('client'), 'title', 'Syomka', 'task_type', 'shooting',
  'assignees', jsonb_build_array(pg_temp.ak('aziz'), pg_temp.ak('jasur'), pg_temp.ak('madina'))));
select is(pg_temp.notes('aziz', 'three') + pg_temp.notes('jasur', 'three') + pg_temp.notes('madina', 'three'), 3::bigint, 'one notification for each of the three');
select pg_temp.ak_login('jasur');
select lives_ok($$select public.acknowledge_task(pg_temp.ak('three'))$$, 'Jasur accepts');
select pg_temp.ak_login('pm');
select is((select count(*) from public.task_assignments where task_id = pg_temp.ak('three') and acknowledged_at is not null), 1::bigint, 'the manager sees one of three accepted');
select ok((select acknowledged_at is null from public.task_assignments where task_id = pg_temp.ak('three') and user_id = pg_temp.ak('madina')), 'Madina has not accepted yet');

-- Editing the task does not notify again; a newly added person is notified and must accept.
select lives_ok($$select public.save_task(pg_temp.ak('three'), jsonb_build_object('title', 'Syomka v2',
  'assignees', jsonb_build_array(pg_temp.ak('aziz'), pg_temp.ak('jasur'), pg_temp.ak('madina'), pg_temp.ak('outsider'))))$$, 'the manager edits the task and adds a person');
select is(pg_temp.notes('aziz', 'three'), 1::bigint, 'an edit does not notify the earlier assignees again');
select is(pg_temp.notes('outsider', 'three'), 1::bigint, 'the added person is notified');
select ok((select acknowledged_at is not null from public.task_assignments where task_id = pg_temp.ak('three') and user_id = pg_temp.ak('jasur')), 'an earlier acceptance survives the edit');

-- 3. Removed from the task / task cancelled: the requirement goes away by itself.
select lives_ok($$select public.save_task(pg_temp.ak('three'), jsonb_build_object('title', 'Syomka v2',
  'assignees', jsonb_build_array(pg_temp.ak('aziz'), pg_temp.ak('jasur'), pg_temp.ak('madina'))))$$, 'the manager removes a person');
select pg_temp.ak_login('outsider');
select is((select count(*) from public.get_my_pending_acks()), 0::bigint, 'an unassigned person has nothing to accept');
reset role;
update public.tasks set status = 'cancelled' where id = pg_temp.ak('three');
select pg_temp.ak_login('madina');
select is((select count(*) from public.get_my_pending_acks()), 0::bigint, 'a cancelled task is not pending');

-- 4. One's own task needs no acceptance; whoever assigns cannot pre-fill one.
select pg_temp.ak_login('pm');
insert into ak_ids (key, id) select 'own', public.save_task(null, jsonb_build_object('client_id', pg_temp.ak('client'), 'title', 'O‘zim', 'assignees', jsonb_build_array(pg_temp.ak('pm'))));
select ok((select acknowledged_at is not null from public.task_assignments where task_id = pg_temp.ak('own') and user_id = pg_temp.ak('pm')), 'assigning oneself counts as accepted');
select is(pg_temp.notes('pm', 'own'), 0::bigint, 'and sends no notification');
insert into ak_ids (key, id) select 'forged', public.save_task(null, jsonb_build_object('client_id', pg_temp.ak('client'), 'title', 'Soxta'));
insert into public.task_assignments (task_id, user_id, ack_required, acknowledged_at) values (pg_temp.ak('forged'), pg_temp.ak('aziz'), false, now() - interval '1 day');
select ok((select ack_required and acknowledged_at is null from public.task_assignments where task_id = pg_temp.ak('forged') and user_id = pg_temp.ak('aziz')),
          'a manager cannot insert an assignment as already accepted or not required');
do $$ begin update public.task_assignments set acknowledged_at = now() where task_id = pg_temp.ak('forged'); exception when insufficient_privilege then null; end $$;
select ok((select acknowledged_at is null from public.task_assignments where task_id = pg_temp.ak('forged') and user_id = pg_temp.ak('aziz')), 'nor accept on someone''s behalf');

-- 5. Assignments made before the feature stay as they were (nobody is locked out by old work).
reset role;
update public.task_assignments set ack_required = false, acknowledged_at = null where task_id = pg_temp.ak('one') and user_id = pg_temp.ak('aziz');
select pg_temp.ak_login('aziz');
select is((select count(*) from public.get_my_pending_acks() where task_id = pg_temp.ak('one')), 0::bigint, 'an old assignment (not required) is never pending');

select * from finish();
rollback;
