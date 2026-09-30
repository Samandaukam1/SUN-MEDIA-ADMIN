begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table gcc_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into gcc_ids(key) values ('player'),('staff'),('client'),('gift');
grant select on gcc_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from gcc_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@control-tests.local',jsonb_build_object('full_name','Control '||key),'{}'
from gcc_ids where key in ('player','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Control Client','GCCTEST');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
update public.game_center_settings set difficulty='easy';
create temp table gcc_run(key text primary key, data jsonb);
grant select on gcc_run to authenticated;
create function pg_temp.run(k text) returns jsonb language sql as $$select data from gcc_run where key=k$$;
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into gcc_run values(k,d) on conflict (key) do update set data=excluded.data returning data$$;
-- Test-only control of the random stream: a seed whose first draw gives the wanted result at the round's level.
create function pg_temp.force(sid uuid, p_goal boolean) returns void language plpgsql as $$
declare lvl int; chance numeric; r float8;
begin
 select coalesce(reach_snapshot, 0) into lvl from public.game_sessions where id = sid;
 chance := private.game_center_save_chance(lvl);
 for i in 0..20000 loop
  perform setseed(-1 + i * 0.0001); r := random();
  if (p_goal and r >= chance) or (not p_goal and r < chance) then perform setseed(-1 + i * 0.0001); return; end if;
 end loop;
 raise exception 'no seed found';
end $$;

-- Level: readable by everyone, changed only by coin managers
select pg_temp.login('player');
select is((select difficulty from public.game_center_settings where game_key='safi-penalty'),'easy','players can read the level (honest odds)');
select throws_ok($$select public.set_game_center_difficulty('safi-penalty','extreme')$$,'42501',null,'a client cannot change the level');
set local role authenticated;
select throws_ok($$update public.game_center_settings set difficulty='extreme'$$,'42501',null,'no direct writes to the level');
reset role;

-- The level is snapshotted per round; saves land on the ball, goals send the keeper clearly the wrong way
select pg_temp.keep('easy',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
create function pg_temp.sid(k text) returns uuid language sql as $$select (pg_temp.run(k)->>'sessionId')::uuid$$;
select is((select reach_snapshot::int from public.game_sessions where id=pg_temp.sid('easy')),0,'an easy round snapshots level 0');
select pg_temp.force(pg_temp.sid('easy'), false);
select pg_temp.keep('save',public.game_center_shoot(pg_temp.sid('easy'),gen_random_uuid(),1,7));
select is(pg_temp.run('save')->>'result','CATCH','forced save');
select is((pg_temp.run('save')->>'goalkeeperZone')::int,7,'a save dives onto the ball');
select pg_temp.force(pg_temp.sid('easy'), true);
select pg_temp.keep('goal',public.game_center_shoot(pg_temp.sid('easy'),gen_random_uuid(),2,7));
select is(pg_temp.run('goal')->>'result','GOAL','forced goal');
select ok(abs(((pg_temp.run('goal')->>'goalkeeperZone')::int-1)%5 - 1) > 1 or abs(((pg_temp.run('goal')->>'goalkeeperZone')::int-1)/5 - 1) > 1,
 'a goal sends the keeper outside the 3 × 3 around the ball');
select is((select (params->>'saveChance')::numeric from public.game_attempts where session_id=pg_temp.sid('easy') and n=1),0.45,'the judged save chance is recorded');

select pg_temp.login('staff');
select is(public.set_game_center_difficulty('safi-penalty','extreme')->>'difficulty','extreme','manager sets the level to extreme');
select throws_ok($$select public.set_game_center_difficulty('safi-penalty','impossible')$$,'22023','GAME_INVALID_LEVEL','unknown level refused');
select throws_ok($$select public.set_game_center_difficulty('no-such-game','hard')$$,'22023','GAME_NOT_AVAILABLE','unknown game refused');
select pg_temp.login('player');
select pg_temp.force(pg_temp.sid('easy'), true);
select is(public.game_center_shoot(pg_temp.sid('easy'),gen_random_uuid(),3,7)->>'result','GOAL','a running round keeps the level it started with');
update public.game_sessions set status='expired' where id=pg_temp.sid('easy');
select pg_temp.keep('extreme',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
select is((select reach_snapshot::int from public.game_sessions where id=pg_temp.sid('extreme')),3,'a new round snapshots level 3');

-- Balance: 10,000 judged shots per level (random zones), goal rates in the target bands, animation-consistent dives
create temp table gcc_sim as
-- (The zone depends on the row, so every row really calls the judge — a constant call would be run only once.)
select lvl, 1 + (i * 7 + lvl) % 15 as z, j.goal, j.keeper
from generate_series(0, 3) lvl, generate_series(1, 10000) i,
     lateral private.game_center_judge(lvl, 1 + (i * 7 + lvl) % 15) j;
select results_eq($$select lvl, count(*)::int from gcc_sim group by lvl order by lvl$$, $$values (0,10000),(1,10000),(2,10000),(3,10000)$$, '10,000 shots per level');
select ok((select avg(goal::int) from gcc_sim where lvl=0) between 0.50 and 0.60, 'EASY: 50–60 % goals');
select ok((select avg(goal::int) from gcc_sim where lvl=1) between 0.30 and 0.40, 'NORMAL: 30–40 % goals');
select ok((select avg(goal::int) from gcc_sim where lvl=2) between 0.10 and 0.15, 'HARD: 10–15 % goals');
select ok((select avg(goal::int) from gcc_sim where lvl=3) between 0.004 and 0.018, 'EXTREME: about 1 % goals');
select is((select count(*)::int from gcc_sim where not goal and keeper <> z),0,'every save dives onto the ball');
select is((select count(*)::int from gcc_sim where goal and abs((keeper-1)%5-(z-1)%5)<=1 and abs((keeper-1)/5-(z-1)/5)<=1),0,'every goal dive is clearly wrong');
-- EXTREME rounds of 10: mostly 0/10, rarely 1/10, 7/10 practically impossible
create temp table gcc_rounds as
select r, sum(goal::int) goals from generate_series(1, 2000) r, generate_series(1, 10) n,
 lateral private.game_center_judge(3, 1 + (r * 10 + n) % 15) j group by r;
select ok((select avg((goals = 0)::int) from gcc_rounds) > 0.85, 'EXTREME: most 10-shot rounds end 0/10');
select ok((select max(goals) from gcc_rounds) <= 3, 'EXTREME: no round anywhere near 7/10');

-- Gifts: coin managers only, once per request, to client users only
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),10)$$,'42501',null,'a client cannot gift coins');
select throws_ok($$select public.search_sun_coin_recipients('Control')$$,'42501',null,'a client cannot list recipients');
select pg_temp.login('staff');
select is((select r->>'clientName' from jsonb_array_elements(public.search_sun_coin_recipients('control client')) r where (r->>'userId')::uuid=pg_temp.id('player')),'Control Client','search finds the player by client name');
select ok(not exists(select 1 from jsonb_array_elements(public.search_sun_coin_recipients('control')) r where (r->>'userId')::uuid=pg_temp.id('staff')),'staff are not recipients');
select is((public.grant_sun_coin_bonus(pg_temp.id('player'),25,'Yaxshi o‘yin uchun',pg_temp.id('gift'))->>'balance')::int,25,'gift credited: 25 SC');
select is((public.grant_sun_coin_bonus(pg_temp.id('player'),25,'Yaxshi o‘yin uchun',pg_temp.id('gift'))->>'duplicate')::boolean,true,'the same request cannot pay twice');
select is(private.sun_coin_balance(pg_temp.id('player')),25::bigint,'still 25 SC');
select results_eq($$select type,source,amount::int,metadata->>'note' from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,
 $$select 'ADMIN_BONUS'::text,'ADMIN_GIFT'::text,25,'Yaxshi o‘yin uchun'::text$$,'ledger: ADMIN_BONUS with the note');
select ok(exists(select 1 from public.notifications where user_id=pg_temp.id('player') and type='sun_coin.gift'),'the player is notified');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),0)$$,'22023','COIN_INVALID_AMOUNT','zero refused');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),100001)$$,'22023','COIN_INVALID_AMOUNT','over the per-gift cap refused');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('staff'),10)$$,'22023','COIN_INVALID_RECIPIENT','staff cannot receive gifts');
select ok((public.get_sun_coin_admin_dashboard()->'analytics'->>'gifted')::int>=25,'gifts appear in the analytics');
select is((select s->>'difficulty' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'settings') s where s->>'gameId'='safi-penalty'),'extreme','dashboard carries the level');
select ok(not has_function_privilege('anon','public.grant_sun_coin_bonus(uuid,bigint,text,uuid)','execute'),'anonymous cannot gift');
select * from finish();
rollback;
