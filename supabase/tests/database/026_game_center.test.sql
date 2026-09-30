begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table gc_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into gc_ids(key) values ('player'),('other'),('staff'),('client'),('other_client'),('campaign'),('start'),('shot');
grant select on gc_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from gc_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@center-tests.local',jsonb_build_object('full_name',key),'{}'
from gc_ids where key in ('player','other','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Center Test','GCTEST'),(pg_temp.id('other_client'),'Other Center','GCOTHER');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('other_client'),pg_temp.id('other'),id from public.roles where key='client_owner';
-- Independent of whatever SUN Coin campaign the database already runs (rolled back at the end).
update public.sun_coin_campaigns set status='ended' where status='active';
update public.game_center_settings set difficulty='easy';
select pg_temp.login('staff');
select throws_ok($$select public.game_center_start('safi-penalty',gen_random_uuid())$$,'42501',null,'employees cannot start');
select pg_temp.login('player');
-- Actual Free entitlements, not only a mock flag.
update public.workspace_subscriptions set status='cancelled' where source='internal';
select is(public.get_my_entitlements()->'plan'->>'key','free','fixture really is Free');
create temp table gc_run as select public.game_center_start('safi-penalty',pg_temp.id('start')) as data;
grant select on gc_run to authenticated;
create function pg_temp.sid() returns uuid language sql stable as $$select (data->>'sessionId')::uuid from gc_run$$;
grant execute on function pg_temp.sid() to authenticated;
select is((select (data->>'attempts')::int from gc_run),10,'ten attempts');
select is((select data->>'rewardReason' from gc_run),'PRACTICE','the mode-less entry starts practice');
select ok(not (select (data->>'rewardEligible')::boolean from gc_run),'practice is not reward eligible');
select ok(not (select data ?| array['keeper','goalkeeperZone','eligible','guaranteed'] from gc_run),'no keeper or reward draw leaks');
select is(public.game_center_start('safi-penalty',pg_temp.id('start'))->>'sessionId',pg_temp.sid()::text,'start retry is idempotent');
select is(public.game_center_start('safi-penalty',gen_random_uuid())->>'sessionId',pg_temp.sid()::text,'reconnect resumes unfinished round');
select throws_ok($$select public.game_center_finish(pg_temp.sid())$$,'P0403',null,'cannot finish before ten shots');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),1,0)$$,'22023',null,'zone 0 rejected');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),1,16)$$,'22023',null,'zone 16 rejected');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),1,null)$$,'22023',null,'null zone rejected');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),null,1,1)$$,'22023',null,'null request rejected');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),2,1)$$,'P0403',null,'cannot skip attempt numbers');
-- Deterministic DB random stream is test-only; production has no override RPC.
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
select pg_temp.force(pg_temp.sid(), false);
create temp table gc_catch as select public.game_center_shoot(pg_temp.sid(),pg_temp.id('shot'),1,8) as data;
select is((select data->>'result' from gc_catch),'CATCH','the keeper saves');
select is((select (data->>'goalkeeperZone')::int from gc_catch),8,'a save lands on the ball''s zone');
select is((select (data->>'score')::int from gc_catch),0,'CATCH scores zero');
select is(public.game_center_shoot(pg_temp.sid(),pg_temp.id('shot'),1,8),(select data from gc_catch),'same request returns exact response');
select is((select count(*)::int from public.game_attempts where session_id=pg_temp.sid()),1,'retry writes one attempt');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),pg_temp.id('shot'),1,9)$$,'22023',null,'cannot change zone on retry');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),1,1)$$,'P0403',null,'duplicate attempt with fresh key rejected');
select throws_ok($$select public.game_next_attempt(pg_temp.sid())$$,'P0403',null,'legacy start endpoint cannot mutate v2 session');
select throws_ok($$select public.game_finish(pg_temp.sid())$$,'P0403',null,'legacy finish endpoint cannot bypass v2 rules');
select pg_temp.login('other');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),2,1)$$,'P0403',null,'another player cannot shoot');
select throws_ok($$select public.game_center_finish(pg_temp.sid())$$,'P0403',null,'another player cannot finish');
select pg_temp.login('player');
create function pg_temp.goal(sid uuid,n int) returns jsonb language plpgsql as $$
begin perform pg_temp.force(sid, true);
return public.game_center_shoot(sid,gen_random_uuid(),n,8);end$$;
select is(pg_temp.goal(pg_temp.sid(),2)->>'result','GOAL','a goal when the keeper misses');
select is((select score::int from public.game_sessions where id=pg_temp.sid()),1,'GOAL adds one server point');
select lives_ok($$select pg_temp.goal(pg_temp.sid(),n) from generate_series(3,10)n$$,'remaining eight shots');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),11,1)$$,'P0403',null,'no eleventh attempt');
select is((public.game_center_finish(pg_temp.sid())->>'score')::int,9,'final score is recomputed from records');
select is(public.game_center_finish(pg_temp.sid())->>'boxes','false','practice never offers boxes');
select is(public.game_center_finish(pg_temp.sid())->>'score','9','finish response is idempotent');
select throws_ok($$select public.game_center_claim(pg_temp.sid(),0)$$,'P0403',null,'practice cannot claim');
select throws_ok($$select public.game_center_shoot(pg_temp.sid(),gen_random_uuid(),10,1)$$,'P0403',null,'finished round cannot be reused');
set local role authenticated;
select is((select count(*)::int from public.game_sessions where id=pg_temp.sid()),0,'private reward draw cannot be read from table');
select is((select count(*)::int from public.game_attempts where session_id=pg_temp.sid()),0,'attempt table stays private');
select throws_ok($$update public.game_sessions set score=99 where id=pg_temp.sid()$$,'42501',null,'client cannot forge score');
reset role;
-- Restore agency fixture, then campaign rewards use the existing subscription extension.
update public.workspace_subscriptions set status='active' where source='internal';
insert into public.game_campaigns(id,client_id,template,title,attempts,target_score,reward_days,win_mode,cooldown_minutes,max_wins_per_user)
values(pg_temp.id('campaign'),pg_temp.id('client'),'penalty','SAFI Test',10,7,3,'skill',60,1);
select private.extend_workspace_plan(private.client_workspace_id(pg_temp.id('client')),'pro',7,'manual','Test fixture');
create temp table gc_expiry as select ends_at from public.workspace_subscriptions where workspace_id=private.client_workspace_id(pg_temp.id('client')) and status='active' order by ends_at desc limit 1;
select is(public.get_my_entitlements()->'plan'->>'key','pro','fixture really is Pro');
update gc_run set data=public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free');
select is((select data->>'rewardEligible' from gc_run),'true','existing Pro can play the daily free Reward Mode attempt');
select lives_ok($$select pg_temp.goal(pg_temp.sid(),n) from generate_series(1,10)n$$,'full reward round');
select is(public.game_center_finish(pg_temp.sid())->>'boxes','true','eligible result offers boxes');
select throws_ok($$select public.game_center_claim(pg_temp.sid(),null)$$,'22023',null,'null box rejected');
select is(public.game_center_claim(pg_temp.sid(),1)->>'won','true','server grants reward');
select is((select ends_at from public.workspace_subscriptions where workspace_id=private.client_workspace_id(pg_temp.id('client')) and status='active' order by ends_at desc limit 1),(select ends_at+interval '3 days' from gc_expiry),'reward extends existing Pro by exactly three days');
select is(public.game_center_claim(pg_temp.sid(),2)->>'box','1','second claim returns original box');
select is((select count(*)::int from public.game_rewards where session_id=pg_temp.sid()),1,'reward granted once');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_REWARD_UNAVAILABLE','after the maximum reward, Reward Mode closes without charging');
update gc_run set data=public.game_center_start('safi-penalty',gen_random_uuid());
select is((select data->>'mode' from gc_run),'practice','replay works after maximum rewards');
select lives_ok($$select pg_temp.goal(pg_temp.sid(),n) from generate_series(1,10)n$$,'practice replay after reward');
select is(public.game_center_finish(pg_temp.sid())->>'boxes','false','practice never offers boxes');
update public.game_campaigns set max_wins_per_user=10 where id=pg_temp.id('campaign');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_FREE_COOLDOWN','one free Reward Mode attempt per 24 hours');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','COIN_INSUFFICIENT_BALANCE','the next Reward Mode attempt costs 10 SC');
update public.game_campaigns set max_rewards_total=1 where id=pg_temp.id('campaign');
update public.game_sessions set started_at=started_at-interval '25 hours' where user_id=pg_temp.id('player') and entry_mode='free';
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_REWARD_UNAVAILABLE','a sold-out Pro campaign closes Reward Mode');
update gc_run set data=public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice');
select is((select data->>'mode' from gc_run),'practice','practice stays open when nothing can be won');
select ok(not has_function_privilege('anon','public.game_center_shoot(uuid,uuid,integer,integer)','execute'),'anonymous RPC execution revoked');
select * from finish();
rollback;
