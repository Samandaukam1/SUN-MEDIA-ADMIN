-- Studio: atomic content save (team, shooting, publications) runs under the caller's RLS; pipeline
-- transitions offered to the app match set_content_status. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table st_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on st_ids to authenticated, anon;
insert into st_ids (key) values ('pm'), ('editor'), ('operator'), ('outsider'), ('client_user'), ('client'), ('other_client');

create function pg_temp.st(p_key text) returns uuid language sql stable as $$ select id from st_ids where key = p_key $$;
grant execute on function pg_temp.st(text) to authenticated, anon;
create function pg_temp.st_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.st(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.st_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@studio-tests.local',
       jsonb_build_object('full_name', 'Studio ' || key), '{}'
from st_ids where key in ('pm', 'editor', 'operator', 'outsider', 'client_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from st_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' when 'outsider' then 'editor' else i.key end
where i.key in ('pm', 'editor', 'operator', 'outsider');
insert into public.employees (user_id) select id from st_ids where key in ('pm', 'editor', 'operator', 'outsider');
insert into public.clients (id, name, code)
select id, 'Studio ' || key, 'ST' || upper(left(replace(id::text, '-', ''), 10)) from st_ids where key in ('client', 'other_client');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.st('client'), pg_temp.st('client_user'), id from public.roles where key = 'client_owner';
insert into public.client_team_members (client_id, user_id, team_role) values
  (pg_temp.st('client'), pg_temp.st('pm'), 'project_manager'),
  (pg_temp.st('client'), pg_temp.st('editor'), 'editor'),
  (pg_temp.st('client'), pg_temp.st('operator'), 'operator');

-- Create with everything at once
select pg_temp.st_login('pm');
insert into st_ids (key, id)
select 'content', public.save_content(null, jsonb_build_object(
  'client_id', pg_temp.st('client'), 'title', 'Studio reel', 'content_type', 'reel', 'priority', 'high',
  'due_at', (now() + interval '2 days')::text, 'hashtags', jsonb_build_array('#safi', ' ', '#reels'),
  'platforms', jsonb_build_array('instagram', 'tiktok'), 'publish_at', (now() + interval '3 days')::text,
  'team', jsonb_build_object('editor', pg_temp.st('editor'), 'operator', pg_temp.st('operator')),
  'shooting', jsonb_build_object('mode', 'new', 'starts_at', (now() + interval '1 day')::text, 'ends_at', (now() + interval '1 day 2 hours')::text, 'location_name', 'Studiya')
));
reset role;

select is((select status::text from public.content_items where id = pg_temp.st('content')), 'idea', 'new content starts as an idea');
select is((select hashtags from public.content_items where id = pg_temp.st('content')), array['#safi', '#reels'], 'blank hashtags are dropped');
select is((select count(*)::int from public.content_publications where content_id = pg_temp.st('content')), 2, 'one publication per platform');
select ok((select shooting_id is not null from public.content_items where id = pg_temp.st('content')), 'a new shooting is planned and linked');
select ok(exists (select 1 from public.shooting_members sm join public.content_items ci on ci.shooting_id = sm.shooting_id
                  where ci.id = pg_temp.st('content') and sm.user_id = pg_temp.st('operator')), 'the operator joins the shooting crew');
select is((select count(*)::int from public.content_assignments where content_id = pg_temp.st('content')), 2, 'editor and operator assigned');

-- Update: drop a platform and an assignee
select pg_temp.st_login('pm');
select lives_ok($$select public.save_content(pg_temp.st('content'), jsonb_build_object('title', 'Studio reel v2', 'platforms', jsonb_build_array('instagram'), 'team', jsonb_build_object('editor', null)))$$,
  'the manager edits the content');
reset role;
select is((select status::text from public.content_publications where content_id = pg_temp.st('content') and platform = 'tiktok'), 'cancelled', 'removed platform is cancelled, not deleted');
select ok(not exists (select 1 from public.content_assignments where content_id = pg_temp.st('content') and role = 'editor'), 'editor unassigned');
select ok(exists (select 1 from public.content_assignments where content_id = pg_temp.st('content') and role = 'operator'), 'other roles untouched');

-- Authorization comes from RLS
select pg_temp.st_login('client_user');
select throws_ok($$select public.save_content(null, jsonb_build_object('client_id', pg_temp.st('client'), 'title', 'x'))$$, '42501', null, 'clients cannot create content');
reset role;
select pg_temp.st_login('pm');
select throws_ok($$select public.save_content(null, jsonb_build_object('client_id', pg_temp.st('other_client'), 'title', 'x'))$$, '42501', null,
  'managers cannot create content for clients they are not assigned to');
select throws_ok($$select public.save_content(pg_temp.st('content'), jsonb_build_object('title', ' '))$$, '22023', null, 'a title is required');
reset role;
select pg_temp.st_login('outsider');
select throws_ok($$select public.save_content(pg_temp.st('content'), jsonb_build_object('title', 'hijack'))$$, 'P0002', null, 'an unrelated editor cannot even see it');
select throws_ok($$select public.get_content_transitions(pg_temp.st('content'))$$, 'P0002', null, 'nor ask for its transitions');
reset role;

-- Transitions
select pg_temp.st_login('pm');
select is(array_length(public.get_content_transitions(pg_temp.st('content')), 1), 12, 'managers may move to any other status');
reset role;
update public.content_items set status = 'shooting' where id = pg_temp.st('content');
select pg_temp.st_login('operator');
select is(public.get_content_transitions(pg_temp.st('content')), array['shot', 'editing']::public.content_status[], 'assignees get only their pipeline moves');
reset role;

select * from finish();
rollback;
