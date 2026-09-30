begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table sc_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into sc_ids(key) values ('player'),('staff'),('client');
grant select on sc_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from sc_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@coin-tests.local',jsonb_build_object('full_name',key),'{}'
from sc_ids where key in ('player','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Coin Test','SCTEST');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
-- Independent of whatever SUN Coin campaign the database already runs (rolled back at the end).
update public.sun_coin_campaigns set status='ended' where status='active';
update public.game_center_settings set difficulty='easy';

-- One full round: p_goals goals first, the rest caught (the keeper draw is replayed from a fixed seed).
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
create function pg_temp.round(p_mode text,p_goals int) returns jsonb language plpgsql as $$
declare st jsonb; sid uuid;
begin
 st:=public.game_center_start_mode('safi-penalty',gen_random_uuid(),p_mode);
 sid:=(st->>'sessionId')::uuid;
 for n in 1..10 loop
  perform pg_temp.force(sid, n<=p_goals);
  perform public.game_center_shoot(sid,gen_random_uuid(),n,8);
 end loop;
 return public.game_center_finish(sid)||jsonb_build_object('sessionId',sid,'mode',st->>'mode');
end $$;
create function pg_temp.balance() returns bigint language sql as $$select private.sun_coin_balance(pg_temp.id('player'))$$;
create function pg_temp.new_day() returns void language sql as $$
 update public.game_sessions set started_at=started_at-interval '25 hours' where user_id=pg_temp.id('player') and entry_mode='free'$$;
create function pg_temp.bonus(p_amount bigint) returns void language sql as $$
 insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(pg_temp.id('player'),p_amount,'ADMIN_BONUS','TEST',gen_random_uuid())$$;
create temp table sc_run(key text primary key, data jsonb);
create function pg_temp.run(k text) returns jsonb language sql as $$select data from sc_run where key=k$$;
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into sc_run values(k,d) on conflict (key) do update set data=excluded.data returning data$$;

select pg_temp.login('staff');
select pg_temp.keep('base',public.get_sun_coin_admin_dashboard()->'analytics');

-- Access
select pg_temp.login('player');
select throws_ok($$select public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"x","totalPool":5,"options":[{"amount":1}]}')$$,'42501',null,'a client cannot create coin campaigns');
select throws_ok($$select public.get_sun_coin_admin_dashboard()$$,'42501',null,'a client cannot read coin analytics');
set local role authenticated;
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(auth.uid(),100,'ADMIN_BONUS','x',gen_random_uuid())$$,'42501',null,'a client cannot write the ledger');
reset role;

-- 1–2. Admin: 20 SC pool, 5 SC × 2 and 3 SC × 3 (19 SC maximum, 1 SC unallocated)
select pg_temp.login('staff');
select pg_temp.keep('c1',public.create_sun_coin_campaign(jsonb_build_object('gameId','safi-penalty','title','SAFI 20','status','active','totalPool',20,
 'minimumScore',5,'strategy','FIRST_ELIGIBLE','options',jsonb_build_array(jsonb_build_object('amount',5,'quantity',2),jsonb_build_object('amount',3,'quantity',3)))));
create function pg_temp.c1() returns uuid language sql as $$select (pg_temp.run('c1')->>'id')::uuid$$;
select is((pg_temp.run('c1')->>'totalPool')::int,20,'campaign pool is 20 SC');
select is((select jsonb_agg(jsonb_build_array(o->'amount',o->'quantity')) from jsonb_array_elements(pg_temp.run('c1')->'options') o),'[[5,2],[3,3]]'::jsonb,'5 SC × 2 and 3 SC × 3 stored in order');
select throws_ok($$select public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"Second","status":"active","totalPool":20,"options":[{"amount":1}]}')$$,'P0403',null,'one active campaign per game');
select throws_ok($$select public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"Over","status":"draft","totalPool":20,"options":[{"amount":5,"quantity":5}]}')$$,'22023',null,'payouts cannot exceed the pool');
select throws_ok($$select public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"Big","status":"draft","totalPool":4,"options":[{"amount":5}]}')$$,'22023',null,'one payout cannot exceed the pool');

-- 11. Practice: free, unlimited, never pays coins; the old entry point is practice too
select pg_temp.login('player');
select pg_temp.keep('p1',pg_temp.round('practice',10));
select is(pg_temp.run('p1')->>'mode','practice','practice round');
select is((pg_temp.run('p1')->>'coinAmount')::int,0,'practice pays no SUN Coin even at 10/10');
select is((pg_temp.run('p1')->>'boxes')::boolean,false,'practice offers no prize boxes');
select is(pg_temp.balance(),0::bigint,'practice leaves the wallet untouched');
select is(public.game_center_start('safi-penalty',gen_random_uuid())->>'mode','practice','the mode-less entry opens practice only');
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and status='playing'),1,'that practice round is open');

-- 3–7, 12. Daily free Reward Mode attempt: no debit, reward credited through the ledger
select pg_temp.keep('f1',pg_temp.round('free',8));
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and entry_mode='practice' and status='playing'),0,'choosing Reward Mode closes the open practice round');
select is(pg_temp.run('f1')->>'mode','free','daily free attempt');
select is((pg_temp.run('f1')->>'coinAmount')::int,5,'8/10 wins the first eligible reward: 5 SC');
select is(pg_temp.balance(),5::bigint,'free attempt debited nothing; wallet holds the 5 SC reward');
select is((pg_temp.run('f1')->>'coinBalance')::int,5,'finish returns the new balance');
select results_eq($$select type,amount::int,source,game_session_id,campaign_id from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,
 $$select 'GAME_REWARD'::text,5,'SAFI_PENALTY'::text,(pg_temp.run('f1')->>'sessionId')::uuid,pg_temp.c1()$$,'one GAME_REWARD ledger entry with session and campaign');
select is((select reward_id from public.sun_coin_ledger where user_id=pg_temp.id('player')),(select id from public.sun_coin_reward_options where campaign_id=pg_temp.c1() and amount=5),'ledger points at the reward option');
select is((select distributed::int from public.sun_coin_campaigns where id=pg_temp.c1()),5,'pool distributed 5 of 20');
select is((select awarded::int from public.sun_coin_reward_options where campaign_id=pg_temp.c1() and amount=5),1,'5 SC quantity left: 1 of 2');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_FREE_COOLDOWN','one free Reward Mode attempt per 24 hours');

-- 9. No double reward for one session
select is(public.game_center_finish((pg_temp.run('f1')->>'sessionId')::uuid)->>'coinAmount','5','finish is idempotent');
select is((select count(*)::int from public.sun_coin_ledger where game_session_id=(pg_temp.run('f1')->>'sessionId')::uuid),1,'repeated finish writes no second credit');
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,game_session_id,campaign_id,reward_id)
 select pg_temp.id('player'),3,'GAME_REWARD','OTHER',gen_random_uuid(),(pg_temp.run('f1')->>'sessionId')::uuid,pg_temp.c1(),id from public.sun_coin_reward_options where campaign_id=pg_temp.c1() and amount=3$$,
 '23505',null,'a second reward row for the same session is impossible');
select throws_ok($$update public.sun_coin_ledger set amount=500 where user_id=pg_temp.id('player')$$,'42501',null,'ledger rows cannot be edited');
select throws_ok($$delete from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,'42501',null,'ledger rows cannot be deleted');

-- Minimum score is configurable: 4/10 earns nothing
select pg_temp.new_day();
select is((pg_temp.round('free',4)->>'coinAmount')::int,0,'below the minimum score: no SUN Coin');
select is((select distributed::int from public.sun_coin_campaigns where id=pg_temp.c1()),5,'pool unchanged');

-- 14. Paid attempt refused without 10 SC; nothing is started or debited
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','COIN_INSUFFICIENT_BALANCE','10 SC needed for another Reward Mode attempt');
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and entry_mode='paid'),0,'refused purchase opens no round');
select is(pg_temp.balance(),5::bigint,'refused purchase debits nothing');
select is(public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice')->>'mode','practice','practice still opens without coins');

-- 13. Paid attempt: −10 SC GAME_SPEND with the round, in the same transaction
select pg_temp.bonus(20);
select is(pg_temp.balance(),25::bigint,'25 SC after an admin bonus');
select pg_temp.keep('pd1',pg_temp.round('paid',10));
select is(pg_temp.run('pd1')->>'mode','paid','paid Reward Mode attempt');
select results_eq($$select amount::int,source from public.sun_coin_ledger where type='GAME_SPEND' and game_session_id=(pg_temp.run('pd1')->>'sessionId')::uuid$$,
 $$select -10,'SAFI_PENALTY_REWARD_ATTEMPT'::text$$,'GAME_SPEND −10 recorded for the round');
select is((pg_temp.run('pd1')->>'coinAmount')::int,5,'second 5 SC reward');
select is(pg_temp.balance(),20::bigint,'25 − 10 + 5 = 20');
select is((pg_temp.round('paid',10)->>'coinAmount')::int,3,'5 SC quantity exhausted: next eligible is 3 SC');
select is(pg_temp.balance(),13::bigint,'20 − 10 + 3 = 13');
select is((select distributed::int from public.sun_coin_campaigns where id=pg_temp.c1()),13,'pool distributed 13 of 20');

-- 15. Pause: no new Reward Mode rounds, and a round finished while paused earns nothing
select pg_temp.login('staff');
select is(public.set_sun_coin_campaign_status(pg_temp.c1(),'paused')->>'status','paused','admin pauses');
select pg_temp.login('player');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','GAME_REWARD_UNAVAILABLE','no Reward Mode while paused (and no fee taken)');
select is(pg_temp.balance(),13::bigint,'balance unchanged');
select pg_temp.login('staff');
select is(public.set_sun_coin_campaign_status(pg_temp.c1(),'active')->>'status','active','admin resumes');
select pg_temp.login('player');
select pg_temp.keep('s_pause',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid'));
select pg_temp.login('staff');
select public.set_sun_coin_campaign_status(pg_temp.c1(),'paused');
select pg_temp.login('player');
create function pg_temp.finish_all(sid uuid) returns jsonb language plpgsql as $$
begin
 for n in 1..10 loop perform pg_temp.force(sid, true);
  perform public.game_center_shoot(sid,gen_random_uuid(),n,8); end loop;
 return public.game_center_finish(sid);
end $$;
select is((pg_temp.finish_all((pg_temp.run('s_pause')->>'sessionId')::uuid)->>'coinAmount')::int,0,'paused before finishing: no reward');
select is((select distributed::int from public.sun_coin_campaigns where id=pg_temp.c1()),13,'paused pool untouched');

-- 16. End: final, history kept
select pg_temp.login('staff');
select is(public.set_sun_coin_campaign_status(pg_temp.c1(),'ended')->>'status','ended','admin ends the campaign');
select throws_ok($$select public.set_sun_coin_campaign_status(pg_temp.c1(),'active')$$,'P0403',null,'an ended campaign cannot restart');
select pg_temp.login('player');
select pg_temp.new_day();
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_REWARD_UNAVAILABLE','no Reward Mode after the end');
select pg_temp.login('staff');
select is((select c->>'status' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'campaigns') c where (c->>'id')::uuid=pg_temp.c1()),'ended','ended campaign stays in history');
select is((select jsonb_agg(jsonb_build_array(o->'amount',o->'awarded') order by (o->>'sortOrder')::int) from jsonb_array_elements(
 (select c->'options' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'campaigns') c where (c->>'id')::uuid=pg_temp.c1())) o),
 '[[5,2],[3,1]]'::jsonb,'payout breakdown: 5 SC × 2, 3 SC × 1');
select is((select (c->>'totalWinners')::int from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'campaigns') c where (c->>'id')::uuid=pg_temp.c1()),3,'three winners');

-- 8. Pool safety: 3 SC left excludes the 5 SC option; an empty pool closes Reward Mode
select pg_temp.keep('c2',public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"Pool 8","status":"active","totalPool":8,"minimumScore":0,"options":[{"amount":5},{"amount":3}]}'));
select pg_temp.login('player');
select pg_temp.new_day();
select is((pg_temp.round('free',10)->>'coinAmount')::int,5,'5 SC from an 8 SC pool');
select pg_temp.new_day();
select is((pg_temp.round('free',10)->>'coinAmount')::int,3,'3 SC left: 5 SC excluded, 3 SC paid');
select is((select distributed::int from public.sun_coin_campaigns where id=(pg_temp.run('c2')->>'id')::uuid),8,'pool fully used, never exceeded');
select pg_temp.new_day();
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_REWARD_UNAVAILABLE','nothing left to win: Reward Mode closed');

-- WEIGHTED_RANDOM with score ranges: only options matching the score and the pool can be drawn
select pg_temp.login('staff');
select public.set_sun_coin_campaign_status((pg_temp.run('c2')->>'id')::uuid,'ended');
select pg_temp.keep('c3',public.create_sun_coin_campaign('{"gameId":"safi-penalty","title":"Weighted","status":"active","totalPool":100,"minimumScore":0,"strategy":"WEIGHTED_RANDOM",
 "options":[{"amount":1,"weight":50,"minScore":0,"maxScore":4},{"amount":3,"weight":30,"minScore":5,"maxScore":8},{"amount":5,"weight":20,"minScore":9,"maxScore":10}]}'));
select pg_temp.login('player');
select pg_temp.new_day();
select is((pg_temp.round('free',10)->>'coinAmount')::int,5,'10/10 draws only from the 9–10 range');
select pg_temp.new_day();
select is((pg_temp.round('free',6)->>'coinAmount')::int,3,'6/10 draws only from the 5–8 range');
select pg_temp.new_day();
select is((pg_temp.round('free',2)->>'coinAmount')::int,1,'2/10 draws only from the 0–4 range');

-- 17. Analytics (deltas, so existing wallets do not matter)
select pg_temp.login('staff');
select pg_temp.keep('after',public.get_sun_coin_admin_dashboard()->'analytics');
select is((pg_temp.run('after')->>'rewarded')::int-(pg_temp.run('base')->>'rewarded')::int,5+5+3+5+3+5+3+1,'rewarded = every GAME_REWARD');
select is((pg_temp.run('after')->>'spent')::int-(pg_temp.run('base')->>'spent')::int,30,'spent = three paid attempts');
select is((pg_temp.run('after')->>'purchased')::int-(pg_temp.run('base')->>'purchased')::int,0,'nothing purchased');
select is((pg_temp.run('after')->>'circulating')::int-(pg_temp.run('base')->>'circulating')::int,20+30-30,'circulating = bonus + rewards − spending');
select is(pg_temp.balance(),(20+30-30)::bigint,'player wallet matches circulating delta');

select ok(not has_function_privilege('anon','public.game_center_start_mode(text,uuid,text)','execute'),'anonymous cannot start Reward Mode');
select * from finish();
rollback;
