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
update public.game_reward_campaigns set status='ended' where status='active';
update public.game_center_settings set difficulty='easy';

-- One full round: p_goals goals first, the rest caught (the keeper draw is replayed from a fixed seed).
-- Test-only control of the random stream: a seed whose first draw gives the wanted result for this shot.
create function pg_temp.force(sid uuid, p_goal boolean) returns void language plpgsql as $$
declare lvl int; shot int; goals int; chance numeric; r float8;
begin
 select coalesce(reach_snapshot, 0), attempts_used + 1, score into lvl, shot, goals from public.game_sessions where id = sid;
 chance := private.game_center_goal_chance(lvl, shot, goals);
 for i in 0..20000 loop
  perform setseed(-1 + i * 0.0001); r := random();
  if (p_goal and r < chance) or (not p_goal and r >= chance) then perform setseed(-1 + i * 0.0001); return; end if;
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
create function pg_temp.c1() returns uuid language sql as $$select (pg_temp.run('c1')->>'id')::uuid$$;
create function pg_temp.rule(p_score int) returns uuid language sql as $$select id from public.game_reward_rules where campaign_id=pg_temp.c1() and score=p_score$$;

select pg_temp.login('staff');
select pg_temp.keep('base',public.get_sun_coin_admin_dashboard()->'analytics');

-- Access
select pg_temp.login('player');
select throws_ok($$select public.create_game_reward_campaign('{"title":"x","rules":[{"score":7,"type":"SUN_COIN","amount":3}]}')$$,'42501',null,'a client cannot create reward rules');
select throws_ok($$select public.get_sun_coin_admin_dashboard()$$,'42501',null,'a client cannot read coin analytics');
set local role authenticated;
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(auth.uid(),100,'ADMIN_BONUS','x',gen_random_uuid())$$,'42501',null,'a client cannot write the ledger');
reset role;

-- Reward rules: 5+ goals → 5 SC (only two of them), 3+ goals → 2 SC
select pg_temp.login('staff');
select pg_temp.keep('c1',public.create_game_reward_campaign('{"title":"SAFI coins","status":"active","rules":[{"score":5,"type":"SUN_COIN","amount":5,"quantity":2},{"score":3,"type":"SUN_COIN","amount":2}]}'));
select is((select jsonb_agg(jsonb_build_array(r->'score',r->'amount',r->'quantity')) from jsonb_array_elements(pg_temp.run('c1')->'rules') r),'[[3,2,null],[5,5,2]]'::jsonb,'rules stored by score');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Second","status":"active","rules":[{"score":7,"type":"SUN_COIN","amount":1}]}')$$,'P0403','GAME_REWARD_CAMPAIGN_ACTIVE','one active reward campaign per game');

-- Practice: free, unlimited, never rewards; the old entry point is practice too
select pg_temp.login('player');
select pg_temp.keep('p1',pg_temp.round('practice',10));
select is(pg_temp.run('p1')->>'mode','practice','practice round');
select is((pg_temp.run('p1')->>'coinAmount')::int,0,'practice pays no SUN Coin even at 10/10');
select is(pg_temp.run('p1')->'reward','null'::jsonb,'practice has no reward');
select is(pg_temp.balance(),0::bigint,'practice leaves the wallet untouched');
select is(public.game_center_start('safi-penalty',gen_random_uuid())->>'mode','practice','the mode-less entry opens practice only');
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and status='playing'),1,'that practice round is open');

-- Daily free Reward Mode attempt: no debit, the reward goes through the ledger
select pg_temp.keep('f1',pg_temp.round('free',8));
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and entry_mode='practice' and status='playing'),0,'choosing Reward Mode closes the open practice round');
select is(pg_temp.run('f1')->>'mode','free','daily free attempt');
select is(pg_temp.run('f1')->'reward','{"type":"SUN_COIN","amount":5,"endsAt":null}'::jsonb,'8/10 reached the 5+ rule: 5 SC');
select is((pg_temp.run('f1')->>'coinAmount')::int,5,'coin amount for the wallet');
select is(pg_temp.balance(),5::bigint,'free attempt debited nothing; wallet holds the 5 SC reward');
select is((pg_temp.run('f1')->>'coinBalance')::int,5,'finish returns the new balance');
select results_eq($$select type,amount::int,source,game_session_id,reward_rule_id from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,
 $$select 'GAME_REWARD'::text,5,'SAFI_PENALTY'::text,(pg_temp.run('f1')->>'sessionId')::uuid,pg_temp.rule(5)$$,'one GAME_REWARD ledger entry pointing at the rule');
select is((select awarded::int from public.game_reward_rules where id=pg_temp.rule(5)),1,'5 SC rule: 1 of 2 given');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_FREE_COOLDOWN','one free Reward Mode attempt per 24 hours');

-- No double reward for one session
select is(public.game_center_finish((pg_temp.run('f1')->>'sessionId')::uuid)->>'coinAmount','5','finish is idempotent');
select is((select count(*)::int from public.sun_coin_ledger where game_session_id=(pg_temp.run('f1')->>'sessionId')::uuid),1,'repeated finish writes no second credit');
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,game_session_id,reward_rule_id)
 values(pg_temp.id('player'),2,'GAME_REWARD','OTHER',gen_random_uuid(),(pg_temp.run('f1')->>'sessionId')::uuid,pg_temp.rule(3))$$,
 '23505',null,'a second reward row for the same session is impossible');
select throws_ok($$update public.sun_coin_ledger set amount=500 where user_id=pg_temp.id('player')$$,'42501',null,'ledger rows cannot be edited');
select throws_ok($$delete from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,'42501',null,'ledger rows cannot be deleted');

-- Below every rule: nothing
select pg_temp.new_day();
select is((pg_temp.round('free',2)->>'coinAmount')::int,0,'2/10 reaches no rule: no SUN Coin');

-- Paid attempt refused without 10 SC; nothing is started or debited
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','COIN_INSUFFICIENT_BALANCE','10 SC needed for another Reward Mode attempt');
select is((select count(*)::int from public.game_sessions where user_id=pg_temp.id('player') and entry_mode='paid'),0,'refused purchase opens no round');
select is(pg_temp.balance(),5::bigint,'refused purchase debits nothing');
select is(public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice')->>'mode','practice','practice still opens without coins');

-- Paid attempt: −10 SC GAME_SPEND with the round, in the same transaction
select pg_temp.bonus(20);
select is(pg_temp.balance(),25::bigint,'25 SC after an admin bonus');
select pg_temp.keep('pd1',pg_temp.round('paid',10));
select is(pg_temp.run('pd1')->>'mode','paid','paid Reward Mode attempt');
select results_eq($$select amount::int,source from public.sun_coin_ledger where type='GAME_SPEND' and game_session_id=(pg_temp.run('pd1')->>'sessionId')::uuid$$,
 $$select -10,'SAFI_PENALTY_REWARD_ATTEMPT'::text$$,'GAME_SPEND −10 recorded for the round');
select is((pg_temp.run('pd1')->>'coinAmount')::int,5,'second 5 SC reward');
select is(pg_temp.balance(),20::bigint,'25 − 10 + 5 = 20');
select is((pg_temp.round('paid',10)->>'coinAmount')::int,2,'the 5 SC rule is used up: 10/10 falls back to the 3+ rule (2 SC)');
select is(pg_temp.balance(),12::bigint,'20 − 10 + 2 = 12');

-- Pause: no new Reward Mode rounds, and a round finished while paused earns nothing
select pg_temp.login('staff');
select is(public.set_game_reward_campaign_status(pg_temp.c1(),'paused')->>'status','paused','admin pauses');
select pg_temp.login('player');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','GAME_REWARD_UNAVAILABLE','no Reward Mode while paused (and no fee taken)');
select is(pg_temp.balance(),12::bigint,'balance unchanged');
select pg_temp.login('staff');
select is(public.set_game_reward_campaign_status(pg_temp.c1(),'active')->>'status','active','admin resumes');
select pg_temp.login('player');
select pg_temp.keep('s_pause',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid'));
select pg_temp.login('staff');
select public.set_game_reward_campaign_status(pg_temp.c1(),'paused');
select pg_temp.login('player');
create function pg_temp.finish_all(sid uuid) returns jsonb language plpgsql as $$
begin
 for n in 1..10 loop perform pg_temp.force(sid, true);
  perform public.game_center_shoot(sid,gen_random_uuid(),n,8); end loop;
 return public.game_center_finish(sid);
end $$;
select is((pg_temp.finish_all((pg_temp.run('s_pause')->>'sessionId')::uuid)->>'coinAmount')::int,0,'paused before finishing: no reward');
select is((select sum(awarded)::int from public.game_reward_rules where campaign_id=pg_temp.c1()),3,'paused rules untouched');

-- End: final, history kept
select pg_temp.login('staff');
select is(public.set_game_reward_campaign_status(pg_temp.c1(),'ended')->>'status','ended','admin ends the campaign');
select throws_ok($$select public.set_game_reward_campaign_status(pg_temp.c1(),'active')$$,'P0403','GAME_REWARD_INVALID_TRANSITION','an ended campaign cannot restart');
select throws_ok($$select public.update_game_reward_campaign(pg_temp.c1(),'{"title":"x"}')$$,'P0403','GAME_REWARD_CAMPAIGN_CLOSED','an ended campaign cannot be edited');
select pg_temp.login('player');
select pg_temp.new_day();
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_REWARD_UNAVAILABLE','no Reward Mode after the end');
select pg_temp.login('staff');
select is((select c->>'status' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'rewardCampaigns') c where (c->>'id')::uuid=pg_temp.c1()),'ended','ended campaign stays in history');
select is((select jsonb_agg(jsonb_build_array(r->'score',r->'awarded') order by (r->>'score')::int) from jsonb_array_elements(
 (select c->'rules' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'rewardCampaigns') c where (c->>'id')::uuid=pg_temp.c1())) r),
 '[[3,1],[5,2]]'::jsonb,'inventory: 5 SC × 2, 2 SC × 1');
select is((select (c->>'winners')::int from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'rewardCampaigns') c where (c->>'id')::uuid=pg_temp.c1()),3,'three winners');
select is((select (c->>'coinsGiven')::int from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'rewardCampaigns') c where (c->>'id')::uuid=pg_temp.c1()),12,'12 SC given by the campaign');

-- Analytics (deltas, so existing wallets do not matter)
select pg_temp.keep('after',public.get_sun_coin_admin_dashboard()->'analytics');
select is((pg_temp.run('after')->>'rewarded')::int-(pg_temp.run('base')->>'rewarded')::int,5+5+2,'rewarded = every GAME_REWARD');
select is((pg_temp.run('after')->>'spent')::int-(pg_temp.run('base')->>'spent')::int,30,'spent = three paid attempts');
select is((pg_temp.run('after')->>'purchased')::int-(pg_temp.run('base')->>'purchased')::int,0,'nothing purchased');
select is((pg_temp.run('after')->>'circulating')::int-(pg_temp.run('base')->>'circulating')::int,20+12-30,'circulating = bonus + rewards − spending');
select is(pg_temp.balance(),(20+12-30)::bigint,'player wallet matches circulating delta');

select ok(not has_function_privilege('anon','public.game_center_start_mode(text,uuid,text)','execute'),'anonymous cannot start Reward Mode');
select * from finish();
rollback;
