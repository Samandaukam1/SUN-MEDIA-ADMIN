-- Shootings: atomic save with crew and shot list under RLS; crew can tick the shot list but not edit
-- the shooting; attendance rows appear for the crew; clients read but never write. Seed-safe.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table sh_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on sh_ids to authenticated, anon;
insert into sh_ids (key) values ('pm'), ('operator'), ('editor'), ('outsider'), ('client_user'), ('client');

create function pg_temp.sh(p_key text) returns uuid language sql stable as $$ select id from sh_ids where key = p_key $$;
grant execute on function pg_temp.sh(text) to authenticated, anon;
create function pg_temp.sh_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.sh(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.sh_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@shooting-tests.local',
       jsonb_build_object('full_name', 'Shoot ' || key), '{}'
from sh_ids where key in ('pm', 'operator', 'editor', 'outsider', 'client_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from sh_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' when 'outsider' then 'operator' else i.key end
where i.key in ('pm', 'operator', 'editor', 'outsider');
insert into public.employees (user_id) select id from sh_ids where key in ('pm', 'operator', 'editor', 'outsider');
insert into public.clients (id, name, code) values (pg_temp.sh('client'), 'Shoot client', 'SH' || upper(left(replace(pg_temp.sh('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id) select pg_temp.sh('client'), pg_temp.sh('client_user'), id from public.roles where key = 'client_owner';
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.sh('client'), pg_temp.sh('pm'), 'project_manager');

select pg_temp.sh_login('pm');
insert into sh_ids (key, id)
select 'shooting', public.save_shooting(null, jsonb_build_object(
  'client_id', pg_temp.sh('client'), 'title', 'Studiya syomkasi', 'location_name', 'Studiya',
  'starts_at', (now() + interval '1 day')::text, 'ends_at', (now() + interval '1 day 3 hours')::text,
  'shot_list', jsonb_build_array(jsonb_build_object('title', 'Umumiy plan'), '  ', jsonb_build_object('title', 'Yaqin plan', 'done', true)),
  'crew', jsonb_build_array(jsonb_build_object('user_id', pg_temp.sh('operator'), 'role', 'operator'), jsonb_build_object('user_id', pg_temp.sh('editor'), 'role', 'editor'))
));
select throws_ok($$select public.save_shooting(null, jsonb_build_object('client_id', pg_temp.sh('client'), 'title', 'x', 'starts_at', now()::text, 'ends_at', (now() - interval '1 hour')::text))$$,
  '22023', null, 'end must be after start');
reset role;

select is((select jsonb_array_length(shot_list) from public.shootings where id = pg_temp.sh('shooting')), 2, 'blank shot list items are dropped');
select is((select count(*)::int from public.shooting_members where shooting_id = pg_temp.sh('shooting')), 2, 'crew added');
select is((select count(*)::int from public.shooting_attendance where shooting_id = pg_temp.sh('shooting') and status = 'pending'), 2,
  'each crew member gets a pending attendance row');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.sh('operator') and entity_id = pg_temp.sh('shooting')), 'the operator is notified');

-- Crew ticks the shot list, but cannot edit the shooting
select pg_temp.sh_login('operator');
select lives_ok($$select public.toggle_shot_item(pg_temp.sh('shooting'), 0, true)$$, 'crew ticks a shot');
select throws_ok($$select public.save_shooting(pg_temp.sh('shooting'), jsonb_build_object('title', 'x', 'starts_at', now()::text, 'ends_at', (now() + interval '1 hour')::text))$$,
  'P0002', null, 'crew cannot edit the shooting itself');
-- No self check-in: RLS filters the crew member's own attendance row out of any UPDATE.
select lives_ok($$update public.shooting_attendance set status = 'arrived' where shooting_id = pg_temp.sh('shooting') and user_id = pg_temp.sh('operator')$$,
  'a self check-in attempt is silently filtered by RLS');
reset role;
select is((select (shot_list -> 0 ->> 'done')::boolean from public.shootings where id = pg_temp.sh('shooting')), true, 'shot ticked');
select is((select status::text from public.shooting_attendance where shooting_id = pg_temp.sh('shooting') and user_id = pg_temp.sh('operator')), 'pending',
  'attendance unchanged by the crew');

select pg_temp.sh_login('outsider');
select throws_ok($$select public.toggle_shot_item(pg_temp.sh('shooting'), 1, false)$$, '42501', null, 'unrelated staff cannot tick');
reset role;
select pg_temp.sh_login('client_user');
select ok(exists (select 1 from public.shootings where id = pg_temp.sh('shooting')), 'the client sees their shooting');
select throws_ok($$select public.toggle_shot_item(pg_temp.sh('shooting'), 1, false)$$, '42501', null, 'the client cannot tick the shot list');
reset role;

-- Crew replacement and status progression by the manager
select pg_temp.sh_login('pm');
select lives_ok($$select public.save_shooting(pg_temp.sh('shooting'), jsonb_build_object('title', 'Studiya syomkasi', 'status', 'in_progress',
  'starts_at', (now() + interval '1 day')::text, 'ends_at', (now() + interval '1 day 3 hours')::text,
  'crew', jsonb_build_array(jsonb_build_object('user_id', pg_temp.sh('operator'), 'role', 'operator'))))$$, 'manager updates crew and status');
reset role;
select is((select count(*)::int from public.shooting_members where shooting_id = pg_temp.sh('shooting')), 1, 'removed crew member is gone');
select ok((select actual_started_at is not null from public.shootings where id = pg_temp.sh('shooting')), 'actual start is stamped');

select * from finish();
rollback;
