-- Client games: the server judges every tap, rejects impossible timing and bot-perfect play, fixes the outcome at
-- the start, grants a reward once and only to client users. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table gm_ids (key text primary key, id uuid not null default gen_random_uuid());
insert into gm_ids (key) values ('admin'), ('player'), ('other'), ('client'), ('client2'), ('camp'), ('camp_prob');
create function pg_temp.g(p_key text) returns uuid language sql stable as $$ select id from gm_ids where key = p_key $$;
grant select on gm_ids to authenticated;
grant execute on function pg_temp.g(text) to authenticated;
-- Acts as the player through the (security definer) game functions; the tests stay postgres to steer the clock.
create function pg_temp.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.g(p_key), 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@game-tests.local',
       jsonb_build_object('full_name', key), '{}'
from gm_ids where key in ('admin', 'player', 'other');
insert into public.user_roles (user_id, role_id) select pg_temp.g('admin'), id from public.roles where key = 'admin';
insert into public.employees (user_id) values (pg_temp.g('admin'));
insert into public.clients (id, name, code) values (pg_temp.g('client'), 'Game Test', 'GMTEST'), (pg_temp.g('client2'), 'Game Other', 'GMOTH');
insert into public.client_members (client_id, user_id, role_id) select pg_temp.g('client'), pg_temp.g('player'), id from public.roles where key = 'client_owner';
insert into public.client_members (client_id, user_id, role_id) select pg_temp.g('client2'), pg_temp.g('other'), id from public.roles where key = 'client_owner';
insert into public.game_campaigns (id, client_id, template, title, attempts, target_score, difficulty, reward_days, win_mode, win_probability, cooldown_minutes)
values (pg_temp.g('camp'), pg_temp.g('client'), 'catch', 'Test Challenge', 5, 5, 'normal', 3, 'first_play_guaranteed', 0, 60),
       (pg_temp.g('camp_prob'), pg_temp.g('client'), 'catch', 'Zero chance', 3, 3, 'easy', 7, 'probability', 0, 0);

-- Plays the next attempt: ages it 20.5 s on the server clock and taps at a time that hits / misses as asked.
-- precision: 'human' (hit, not dead-centre), 'perfect' (bot-like), 'miss'.
create function pg_temp.play(p_session uuid, p_precision text) returns boolean language plpgsql as $$
declare
  v_n smallint;
  v_tap integer;
  v_params jsonb;
  v_r jsonb;
begin
  v_n := (public.game_next_attempt(p_session) ->> 'n')::smallint;
  update public.game_attempts set started_at = clock_timestamp() - interval '20500 milliseconds' where session_id = p_session and n = v_n;
  select params into v_params from public.game_attempts where session_id = p_session and n = v_n;
  select t into v_tap from generate_series(15600, 19900, 2) t, lateral private.game_judge('catch', v_params, t) j
  where case p_precision when 'miss' then not j.hit when 'perfect' then j.hit and j.error_ratio < 0.05 else j.hit and j.error_ratio between 0.3 and 0.9 end
  limit 1;
  if v_tap is null then
    return null;
  end if;
  v_r := public.game_submit_attempt(p_session, v_n, v_tap);
  return (v_r ->> 'hit')::boolean;
end $$;

-- Physics sanity
select is((select hit from private.game_judge('pour', '{"tf": 2, "k": 1, "w": 0.05, "c": 0.7, "ab": 0, "pb": 1, "fb": 0}', 1400)), true, 'pour: stopping at the band hits');
select is((select hit from private.game_judge('pour', '{"tf": 2, "k": 1, "w": 0.05, "c": 0.7, "ab": 0, "pb": 1, "fb": 0}', 1000)), false, 'pour: too early misses');
select is((select hit from private.game_judge('pour', '{"tf": 2, "k": 1, "w": 0.05, "c": 0.7, "ab": 0, "pb": 1, "fb": 0}', 3000)), false, 'pour: overflow misses');

-- Who may play
select pg_temp.as_user('admin');
select is(public.get_my_games(), '[]'::jsonb, 'staff have no games');
select throws_ok($$select public.game_start(pg_temp.g('camp'))$$, '42501', null, 'staff cannot play');
select pg_temp.as_user('other');
select throws_ok($$select public.game_start(pg_temp.g('camp'))$$, 'P0403', null, 'another client''s campaign is closed');
select pg_temp.as_user('player');
select is(jsonb_array_length(public.get_my_games()), 2, 'the client sees its campaigns');
select ok((public.get_my_games() -> 0 ->> 'rules_text') is not null, 'with the real winning rule');

-- Guaranteed first game, played with misses: completing it wins; the prize is granted once.
create temp table gm_run as select (public.game_start(pg_temp.g('camp')) ->> 'session_id')::uuid as sid;
select ok(pg_temp.play((select sid from gm_run), 'miss') = false, 'a miss is judged a miss');
select ok(pg_temp.play((select sid from gm_run), 'human') = true, 'a good tap is judged a hit');
select lives_ok($$select pg_temp.play((select sid from gm_run), 'miss') from generate_series(1, 3)$$, 'the rest of the game');
select throws_ok($$select public.game_next_attempt((select sid from gm_run))$$, 'P0403', null, 'no attempt beyond the limit');
select is(public.game_finish((select sid from gm_run)) ->> 'boxes', 'true', 'a guaranteed game shows the boxes');
select is(public.game_open_box((select sid from gm_run), 1::smallint) ->> 'won', 'true', 'and the opened box holds the prize');
select is((public.game_open_box((select sid from gm_run), 2::smallint) ->> 'repeat')::boolean, true, 'a second box opens nothing new');
select is((select count(*)::int from public.game_rewards where session_id = (select sid from gm_run)), 1, 'one reward per session');
select is(private.workspace_own_plan(private.client_workspace_id(pg_temp.g('client'))), 'pro', 'the reward is the client''s own Pro');
select throws_ok($$select public.game_start(pg_temp.g('camp'))$$, 'P0403', null, 'cooldown and max wins apply');

-- Tampering: no direct writes, and taps that the server clock contradicts are refused.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.g('player'), 'role', 'authenticated')::text, true);
select throws_ok($$update public.game_sessions set score = 10$$, '42501', null, 'the app cannot write a score');
select throws_ok($$insert into public.game_rewards (session_id, campaign_id, user_id, workspace_id, plan_key, days) values (gen_random_uuid(), pg_temp.g('camp'), pg_temp.g('player'), private.client_workspace_id(pg_temp.g('client')), 'pro', 30)$$,
  '42501', null, 'nor a reward');
reset role;

select pg_temp.as_user('player');
create temp table gm_prob as select (public.game_start(pg_temp.g('camp_prob')) ->> 'session_id')::uuid as sid;
select is((public.game_submit_attempt((select sid from gm_prob), ((public.game_next_attempt((select sid from gm_prob)) ->> 'n')::smallint), 5000) ->> 'valid')::boolean,
  false, 'a tap later than the server clock allows is invalid');
select is((public.game_submit_attempt((select sid from gm_prob), ((public.game_next_attempt((select sid from gm_prob)) ->> 'n')::smallint), 19000) ->> 'hit')::boolean,
  false, 'a second impossible tap scores nothing');
select lives_ok($$select pg_temp.play((select sid from gm_prob), 'perfect')$$, 'one more tap');
select is(public.game_finish((select sid from gm_prob)) ->> 'flagged', 'true', 'repeated impossible timing flags the session (no prize)');

-- A zero-chance campaign: the target can be reached, the box stays empty (and was decided at the start).
update public.game_campaigns set cooldown_minutes = 0, max_sessions_per_day = 10 where id = pg_temp.g('camp_prob');
create temp table gm_zero as select (public.game_start(pg_temp.g('camp_prob')) ->> 'session_id')::uuid as sid;
select ok((select not eligible from public.game_sessions where id = (select sid from gm_zero)), 'the outcome is fixed when the game starts');
select lives_ok($$select pg_temp.play((select sid from gm_zero), 'human') from generate_series(1, 3)$$, 'three honest hits');
select is(public.game_finish((select sid from gm_zero)) ->> 'boxes', 'true', 'reaching the target gives a prize opportunity');
select is(public.game_open_box((select sid from gm_zero), 0::smallint) ->> 'won', 'false', 'but a 0% campaign never pays');

select * from finish();
rollback;
