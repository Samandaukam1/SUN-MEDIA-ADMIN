-- Home read models: client isolation, employee scope, command center shape, activity feed access,
-- extended content pipeline. Seed-safe (random codes/ids) and rolled back.
-- npx supabase test db --local supabase/tests/database/003_home_read_models.test.sql
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table hm_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on hm_ids to authenticated, anon;
insert into hm_ids (key) values
  ('owner'), ('editor'), ('outsider_editor'), ('client_a_user'), ('client_b_user'),
  ('client_a'), ('client_b'), ('content_a'), ('content_b'), ('task_a'), ('shooting_a');

create function pg_temp.hm(p_key text) returns uuid language sql stable as $$ select id from hm_ids where key = p_key $$;
grant execute on function pg_temp.hm(text) to authenticated, anon;
create function pg_temp.hm_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.hm(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.hm_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', id || '@home-tests.local',
       jsonb_build_object('full_name', 'Home test ' || key), '{}'
from hm_ids where key in ('owner', 'editor', 'outsider_editor', 'client_a_user', 'client_b_user');

insert into public.user_roles (user_id, role_id)
select i.id, r.id from hm_ids i join public.roles r on r.key = case when i.key = 'owner' then 'owner' else 'editor' end
where i.key in ('owner', 'editor', 'outsider_editor');
insert into public.employees (user_id) select id from hm_ids where key in ('owner', 'editor', 'outsider_editor');

insert into public.clients (id, name, code)
select id, 'Home test ' || key, 'HM' || upper(left(replace(id::text, '-', ''), 10)) from hm_ids where key in ('client_a', 'client_b');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.hm('client_a'), pg_temp.hm('client_a_user'), id from public.roles where key = 'client_owner'
union all
select pg_temp.hm('client_b'), pg_temp.hm('client_b_user'), id from public.roles where key = 'client_owner';

insert into public.content_items (id, client_id, title, content_type, status, due_at)
values (pg_temp.hm('content_a'), pg_temp.hm('client_a'), 'Home test reel A', 'reel', 'script', now() + interval '3 hours'),
       (pg_temp.hm('content_b'), pg_temp.hm('client_b'), 'Home test reel B', 'reel', 'client_review', now() + interval '3 hours');
insert into public.content_assignments (content_id, user_id, role) values (pg_temp.hm('content_a'), pg_temp.hm('editor'), 'editor');
insert into public.tasks (id, client_id, content_id, title, task_type, due_at)
values (pg_temp.hm('task_a'), pg_temp.hm('client_a'), pg_temp.hm('content_a'), 'Home test edit', 'editing', now() + interval '1 hour');
insert into public.task_assignments (task_id, user_id) values (pg_temp.hm('task_a'), pg_temp.hm('editor'));
insert into public.shootings (id, client_id, title, starts_at, ends_at, status)
values (pg_temp.hm('shooting_a'), pg_temp.hm('client_a'), 'Home test shooting',
        date_trunc('day', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent' + interval '23 hours',
        date_trunc('day', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent' + interval '23 hours 30 minutes', 'planned');

-- Grants
select ok(not has_function_privilege('anon', 'public.get_client_home(uuid)', 'EXECUTE'), 'anon cannot read a client home');
select ok(not has_function_privilege('anon', 'public.get_employee_home()', 'EXECUTE'), 'anon cannot read an employee home');
select ok(not has_function_privilege('anon', 'public.get_activity_feed(integer, bigint, uuid)', 'EXECUTE'), 'anon cannot read the activity feed');

-- Client home isolation
select pg_temp.hm_login('client_a_user');
select is((public.get_client_home(pg_temp.hm('client_a')) -> 'client' ->> 'id')::uuid, pg_temp.hm('client_a'), 'client reads their own home');
select is((public.get_client_home(pg_temp.hm('client_a')) -> 'stats' ->> 'in_production')::int, 1, 'own content in production is counted');
select throws_ok($$select public.get_client_home(pg_temp.hm('client_b'))$$, 'P0002', null, 'client cannot read another client home');
select throws_ok($$select * from public.get_activity_feed(10)$$, '42501', null, 'clients have no activity feed');
select throws_ok($$select public.get_command_center()$$, '42501', null, 'clients have no command center');
reset role;

-- Employee home is always about the caller
select pg_temp.hm_login('editor');
select is((public.get_employee_home() -> 'task_stats' ->> 'open')::int, 1, 'assigned editor sees their open task');
select is(jsonb_array_length(public.get_employee_home() -> 'content'), 1, 'assigned editor sees their content in production');
select throws_ok($$select * from public.get_activity_feed(10)$$, '42501', null, 'editors have no agency activity feed');
reset role;
select pg_temp.hm_login('outsider_editor');
select is((public.get_employee_home() -> 'task_stats' ->> 'open')::int, 0, 'other editor sees none of it');
reset role;

-- Command center shape and counters
select pg_temp.hm_login('owner');
select ok(public.get_command_center() ?& array['deadlines', 'clients', 'publications', 'activity_today'], 'command center exposes the new sections');
select ok((public.get_command_center() -> 'deadlines' ->> 'critical')::int >= 1, 'task due within two hours counts as critical');
select ok(exists (select 1 from jsonb_array_elements(public.get_command_center() -> 'clients') c
                  where (c ->> 'id')::uuid = pg_temp.hm('client_b') and (c ->> 'waiting_approval')::int = 1),
          'per-client waiting approval counter');
select ok(exists (select 1 from public.get_activity_feed(50) f where f.entity_type = 'content_items'), 'owner reads the activity feed');
reset role;

-- Extended pipeline: an assigned editor may move script → ready_for_shoot → shooting → shot → editing
select pg_temp.hm_login('editor');
select lives_ok($$select public.set_content_status(pg_temp.hm('content_a'), 'ready_for_shoot')$$, 'script → ready for shoot');
select lives_ok($$select public.set_content_status(pg_temp.hm('content_a'), 'shooting')$$, 'ready for shoot → shooting');
select lives_ok($$select public.set_content_status(pg_temp.hm('content_a'), 'shot')$$, 'shooting → shot');
select lives_ok($$select public.set_content_status(pg_temp.hm('content_a'), 'editing')$$, 'shot → editing');
select throws_ok($$select public.set_content_status(pg_temp.hm('content_a'), 'approved')$$, '42501', null, 'assignee cannot approve their own work');
reset role;
select is((select count(*)::int from public.content_status_history where content_id = pg_temp.hm('content_a')), 5, 'creation and every move are kept in status history');

select * from finish();
rollback;
