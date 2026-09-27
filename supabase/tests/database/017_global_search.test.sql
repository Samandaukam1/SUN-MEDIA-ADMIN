-- Global search and the client overview: both run under the caller's RLS, hides staff-only kinds from clients, treats % and _
-- literally and ignores one-letter queries. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table gs_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on gs_ids to authenticated, anon;
insert into gs_ids (key) values ('pm'), ('mine'), ('other'), ('client_a'), ('client_b');

create function pg_temp.gs(p_key text) returns uuid language sql stable as $$ select id from gs_ids where key = p_key $$;
grant execute on function pg_temp.gs(text) to authenticated, anon;
create function pg_temp.gs_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.gs(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.gs_login(text) to authenticated, anon;
create function pg_temp.kinds(p_query text) returns text[] language sql stable as $$
  select coalesce(array_agg(distinct x ->> 'kind' order by x ->> 'kind'), '{}') from jsonb_array_elements(public.global_search(p_query)) x
$$;
grant execute on function pg_temp.kinds(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@search-tests.local',
       jsonb_build_object('full_name', 'Zebra ' || key), '{}'
from gs_ids where key in ('pm', 'mine', 'other');
insert into public.user_roles (user_id, role_id) select pg_temp.gs('pm'), id from public.roles where key = 'admin';
insert into public.employees (user_id) values (pg_temp.gs('pm'));
insert into public.clients (id, name, code)
select id, 'Zebra ' || key, 'ZB' || upper(left(replace(id::text, '-', ''), 10)) from gs_ids where key in ('client_a', 'client_b');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.gs(c), pg_temp.gs(u), r.id from (values ('client_a', 'mine'), ('client_b', 'other')) m(c, u) join public.roles r on r.key = 'client_owner';

select pg_temp.gs_login('pm');
select public.save_content(null, jsonb_build_object('client_id', pg_temp.gs('client_a'), 'title', 'Zebraxon kampaniya A', 'content_type', 'reel'));
select public.save_content(null, jsonb_build_object('client_id', pg_temp.gs('client_b'), 'title', 'Zebraxon kampaniya B', 'content_type', 'reel'));
select public.save_task(null, jsonb_build_object('client_id', pg_temp.gs('client_a'), 'title', 'Zebraxon montaj'));
select ok(pg_temp.kinds('zebraxon') @> array['content', 'task'], 'staff find content and tasks');
select ok(pg_temp.kinds('zebra') @> array['client', 'person'], 'staff find clients and people');
select is(jsonb_array_length(public.global_search('z')), 0, 'one-letter queries return nothing');
select is(jsonb_array_length(public.global_search('%')), 0, 'a lone % is not a wildcard');
reset role;

select pg_temp.gs_login('mine');
select is((select array_agg(x ->> 'title') from jsonb_array_elements(public.global_search('zebraxon')) x), array['Zebraxon kampaniya A'],
  'a client only finds their own company''s content');
select ok(not (pg_temp.kinds('zebra') && array['task', 'client', 'person']), 'clients never see tasks, other clients or staff');
select is(jsonb_array_length(public.global_search('kampaniya zebraxon')), 1, 'every word must match, in any order');
select is(jsonb_array_length(public.global_search('zebraxon reels')), 1, 'the format is searchable by the word people use (reels)');
select is(jsonb_array_length(public.global_search('zebraxon stories')), 0, 'a word that matches nothing narrows to nothing');
reset role;

-- Client overview: staff only; plan figures only for people allowed to see them
insert into gs_ids (key) values ('editor');
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor.' || left(id::text, 8) || '@search-tests.local', '{"full_name": "Zebra editor"}', '{}'
from gs_ids where key = 'editor';
insert into public.user_roles (user_id, role_id) select pg_temp.gs('editor'), id from public.roles where key = 'editor';
insert into public.employees (user_id) values (pg_temp.gs('editor'));
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.gs('client_a'), pg_temp.gs('editor'), 'editor');

select pg_temp.gs_login('pm');
select is((public.get_client_overview(pg_temp.gs('client_a')) -> 'client' ->> 'name'), 'Zebra client_a', 'the owner/admin opens the client overview');
select ok((public.get_client_overview(pg_temp.gs('client_a')) ->> 'plan_visible')::boolean, 'admins see plan figures');
reset role;
select pg_temp.gs_login('editor');
select is((public.get_client_overview(pg_temp.gs('client_a')) ->> 'plan_visible')::boolean, false, 'an editor does not see plan figures');
reset role;
select pg_temp.gs_login('mine');
select throws_ok($$select public.get_client_overview(pg_temp.gs('client_a'))$$, '42501', null, 'client users cannot open the staff overview');
reset role;

select * from finish();
rollback;
