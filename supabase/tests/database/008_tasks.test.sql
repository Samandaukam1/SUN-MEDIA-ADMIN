-- Tasks: atomic save with assignees/checklist/dependencies under RLS, loop-free dependencies,
-- comments + notifications, assignee limits, client invisibility. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table tk_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on tk_ids to authenticated, anon;
insert into tk_ids (key) values ('pm'), ('editor'), ('designer'), ('client_user'), ('client');

create function pg_temp.tk(p_key text) returns uuid language sql stable as $$ select id from tk_ids where key = p_key $$;
grant execute on function pg_temp.tk(text) to authenticated, anon;
create function pg_temp.tk_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.tk(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.tk_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@task-tests.local',
       jsonb_build_object('full_name', 'Task ' || key), '{}'
from tk_ids where key in ('pm', 'editor', 'designer', 'client_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from tk_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' else i.key end
where i.key in ('pm', 'editor', 'designer');
insert into public.employees (user_id) select id from tk_ids where key in ('pm', 'editor', 'designer');
insert into public.clients (id, name, code) values (pg_temp.tk('client'), 'Task client', 'TK' || upper(left(replace(pg_temp.tk('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id) select pg_temp.tk('client'), pg_temp.tk('client_user'), id from public.roles where key = 'client_owner';
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.tk('client'), pg_temp.tk('pm'), 'project_manager');

select pg_temp.tk_login('pm');
insert into tk_ids (key, id) select 'script_task', public.save_task(null, jsonb_build_object('client_id', pg_temp.tk('client'), 'title', 'Ssenariy yozish', 'task_type', 'copywriting'));
insert into tk_ids (key, id)
select 'edit_task', public.save_task(null, jsonb_build_object(
  'client_id', pg_temp.tk('client'), 'title', 'Montaj', 'task_type', 'editing', 'priority', 'high',
  'due_at', (now() + interval '1 day')::text,
  'assignees', jsonb_build_array(pg_temp.tk('editor')),
  'checklist', jsonb_build_array(jsonb_build_object('title', 'Rang korreksiyasi'), jsonb_build_object('title', ' '), jsonb_build_object('title', 'Subtitr')),
  'depends_on', jsonb_build_array(pg_temp.tk('script_task'))
));
select throws_ok($$select public.save_task(pg_temp.tk('script_task'), jsonb_build_object('title', 'Ssenariy yozish', 'depends_on', jsonb_build_array(pg_temp.tk('edit_task'))))$$,
  '22023', null, 'dependency loops are rejected');
select throws_ok($$select public.save_task(null, jsonb_build_object('title', 'x', 'starts_at', now()::text, 'due_at', (now() - interval '1 hour')::text))$$,
  '22023', null, 'deadline must not precede the start');
reset role;

select is((select count(*)::int from public.task_checklist_items where task_id = pg_temp.tk('edit_task')), 2, 'blank checklist items are skipped');
select is((select count(*)::int from public.task_dependencies where task_id = pg_temp.tk('edit_task')), 1, 'dependency stored');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.tk('editor') and entity_id = pg_temp.tk('edit_task')), 'assignee notified');

-- Assignee: may change status, tick checklist and comment; may not edit the task
select pg_temp.tk_login('editor');
select lives_ok($$update public.tasks set status = 'in_progress' where id = pg_temp.tk('edit_task')$$, 'assignee starts the task');
select throws_ok($$update public.tasks set due_at = now() + interval '5 days' where id = pg_temp.tk('edit_task')$$, '42501', null, 'assignee cannot move the deadline');
select lives_ok($$update public.task_checklist_items set is_done = true where task_id = pg_temp.tk('edit_task') and title = 'Subtitr'$$, 'assignee ticks the checklist');
select lives_ok($$insert into public.task_comments (task_id, body) values (pg_temp.tk('edit_task'), 'Birinchi variant tayyor')$$, 'assignee comments');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.tk('pm') and type = 'task.comment'), 'the task creator is notified about the comment');
select is((select done_by from public.task_checklist_items where task_id = pg_temp.tk('edit_task') and title = 'Subtitr'), pg_temp.tk('editor'), 'who ticked is recorded');

select pg_temp.tk_login('designer');
select throws_ok($$insert into public.task_comments (task_id, body) values (pg_temp.tk('edit_task'), 'x')$$, '42501', null, 'unrelated staff cannot comment');
reset role;
select pg_temp.tk_login('client_user');
select is((select count(*)::int from public.tasks), 0, 'clients never see internal tasks');
select is((select count(*)::int from public.task_comments), 0, 'nor task comments');
reset role;

-- Reassign through save_task
select pg_temp.tk_login('pm');
select lives_ok($$select public.save_task(pg_temp.tk('edit_task'), jsonb_build_object('title', 'Montaj v2', 'assignees', jsonb_build_array(pg_temp.tk('designer')), 'depends_on', '[]'::jsonb))$$,
  'manager reassigns and unlinks');
reset role;
select is((select array_agg(user_id) from public.task_assignments where task_id = pg_temp.tk('edit_task')), array[pg_temp.tk('designer')], 'assignees replaced');
select is((select count(*)::int from public.task_dependencies where task_id = pg_temp.tk('edit_task')), 0, 'dependency removed');

select * from finish();
rollback;
