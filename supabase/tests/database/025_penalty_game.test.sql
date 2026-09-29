-- SAFI penalty: the goalkeeper's zone is decided by the server and never revealed before the shot; the server
-- judges goal / save, rejects impossible timing, and the old tap API cannot be used for it. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table pn_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on pn_ids to authenticated;
insert into pn_ids (key) values ('player'), ('client'), ('camp');
create function pg_temp.p(p_key text) returns uuid language sql stable as $$ select id from pn_ids where key = p_key $$;
grant execute on function pg_temp.p(text) to authenticated;
create function pg_temp.as_player() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.p('player'), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.keeper(p_session uuid, p_n int) returns int language sql stable as $$
  select (params ->> 'keeper')::int from public.game_attempts where session_id = p_session and n = p_n $$;
create function pg_temp.age(p_session uuid, p_n int) returns void language sql as $$
  update public.game_attempts set started_at = clock_timestamp() - interval '1 second' where session_id = p_session and n = p_n $$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values (pg_temp.p('player'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'penalty.player@game-tests.local', '{"full_name": "Player"}', '{}');
insert into public.clients (id, name, code) values (pg_temp.p('client'), 'Penalty Test', 'PNTEST');
insert into public.client_members (client_id, user_id, role_id) select pg_temp.p('client'), pg_temp.p('player'), id from public.roles where key = 'client_owner';
insert into public.game_campaigns (id, client_id, template, title, attempts, target_score, difficulty, reward_days, win_mode, cooldown_minutes)
values (pg_temp.p('camp'), pg_temp.p('client'), 'penalty', 'SAFI Penalti', 3, 2, 'easy', 3, 'skill', 0);

select pg_temp.as_player();
create temp table pn_run as select (public.game_start(pg_temp.p('camp')) ->> 'session_id')::uuid as sid;

-- Attempt 1: the goalkeeper's zone stays hidden; an instant shot is not humanly possible.
select ok(not ((public.game_next_attempt((select sid from pn_run)) -> 'params') ? 'keeper'), 'the app never receives the goalkeeper''s zone');
select is((public.game_shoot((select sid from pn_run), 1::smallint, 0::smallint) ->> 'valid')::boolean, false, 'a shot faster than a human is invalid');

-- Attempt 2: shooting where the goalkeeper dives is saved (easy = exact zone).
select public.game_next_attempt((select sid from pn_run));
select pg_temp.age((select sid from pn_run), 2);
select is((public.game_shoot((select sid from pn_run), 2::smallint, pg_temp.keeper((select sid from pn_run), 2)::smallint) ->> 'goal')::boolean, false,
  'the goalkeeper saves a shot into its zone');

-- Attempt 3: any other zone is a goal, and the goalkeeper's zone is revealed only now.
select public.game_next_attempt((select sid from pn_run));
select pg_temp.age((select sid from pn_run), 3);
select is((public.game_shoot((select sid from pn_run), 3::smallint, ((pg_temp.keeper((select sid from pn_run), 3) + 7) % 15)::smallint) ->> 'goal')::boolean, true,
  'a shot away from the goalkeeper scores');
select throws_ok($$select public.game_shoot((select sid from pn_run), 3::smallint, 1::smallint)$$, 'P0403', null, 'one shot per attempt');
select throws_ok($$select public.game_submit_attempt((select sid from pn_run), 3::smallint, 900)$$, 'P0403', null, 'the tap API is closed for penalties');
select is((public.game_finish((select sid from pn_run)) ->> 'score')::int, 1, 'the score is what the server judged');

-- Reach by difficulty
select ok(private.penalty_saved(7, 8, 1) and not private.penalty_saved(7, 12, 1), 'normal: the same row, one column either side');
select ok(private.penalty_saved(7, 13, 2) and not private.penalty_saved(7, 9, 2), 'hard: one row and one column around');

-- The player cannot peek at stored attempts.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.p('player'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.game_attempts), 0, 'players cannot read attempts (and the goalkeeper''s zones)');
reset role;

select * from finish();
rollback;
