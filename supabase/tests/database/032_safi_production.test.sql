begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table ge_ids(key text primary key,id uuid not null default gen_random_uuid());
insert into ge_ids(key) values('player'),('other'),('staff'),('client'),('other_client');
grant select on ge_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from ge_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@engagement-tests.local',jsonb_build_object('full_name',key),'{}'
 from ge_ids where key in('player','other','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Engagement Test','GETEST'),(pg_temp.id('other_client'),'Other Engagement Test','GEOTHER');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('other_client'),pg_temp.id('other'),id from public.roles where key='client_owner';
update public.game_engagement_definitions set starts_at=now()-interval '40 days';
create temp table ge_runs(key text primary key,data jsonb);
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into ge_runs values(k,d) on conflict(key) do update set data=excluded.data returning data$$;
create function pg_temp.run(k text) returns jsonb language sql as $$select data from ge_runs where key=k$$;
create function pg_temp.definition(k text) returns uuid language sql as $$select id from public.game_engagement_definitions where game_key='safi-penalty' and code=k limit 1$$;
-- Trusted database fixture: validated shots, including zero-based stored zones.
-- The client has no INSERT grants on sessions/attempts. Non-completed fixtures
-- finish through the real RPC; historical fixtures exercise server-local dates.
create function pg_temp.round(k text,p_mode text,p_hits boolean[],p_zones int[],p_at timestamptz default null) returns jsonb language plpgsql as $$
declare sid uuid:=gen_random_uuid(); cid uuid; response jsonb;
begin
 cid:=case when auth.uid()=pg_temp.id('other') then pg_temp.id('other_client') else pg_temp.id('client') end;
 insert into public.game_sessions(id,user_id,client_id,workspace_id,eligible,game_key,entry_mode,attempt_limit,attempts_used,score,reward_eligible,
 pro_reward_eligible,coin_reward_eligible,status,started_at,finished_at)
 values(sid,auth.uid(),cid,private.client_workspace_id(cid),false,'safi-penalty',p_mode,10,10,0,p_mode<>'practice',false,false,
 case when p_at is null then 'playing' else 'finished' end,coalesce(p_at,now()),p_at);
 for n in 1..10 loop
  insert into public.game_attempts(session_id,n,params,zone,submitted_at,hit,valid,request_id)
   values(sid,n,'{}',p_zones[n]-1,coalesce(p_at,now()),p_hits[n],true,gen_random_uuid());
 end loop;
 if p_at is null then response:=public.game_center_finish(sid);
 else response:=jsonb_build_object('engagement',private.record_game_engagement(sid,true)); end if;
 response:=response||jsonb_build_object('sessionId',sid);
 return pg_temp.keep(k,response);
end $$;
create function pg_temp.goals(n int) returns boolean[] language sql as $$select array_agg(i<=n order by i) from generate_series(1,10)i$$;
create function pg_temp.zones() returns int[] language sql as $$select array[1,5,11,15,8,8,8,8,8,8]$$;

grant execute on function pg_temp.id(text),pg_temp.run(text) to authenticated;
grant select on ge_runs to authenticated;
select pg_temp.login('player');
select is(public.get_game_engagement()->'stats'->>'gamesPlayed','0','new player starts with zero completed games');
select is(public.get_game_engagement()->>'timezone',private.agency_timezone(),'the server chooses the agency timezone');
select is(public.get_game_engagement()->>'dayKey',private.agency_today()::text,'day key is the server date');
select is(jsonb_array_length(public.get_game_engagement()->'stats'->'zones'),15,'complete 3 by 5 shot map');
select is(public.get_game_engagement()->'stats'->'favoriteZone','null'::jsonb,'no invented favorite before play');
select throws_ok($$select public.configure_game_engagement('safi-penalty',100)$$,'42501',null,'client cannot increase issuance cap');
select throws_ok($$select public.save_game_engagement_definition('{"kind":"challenge","code":"hack","title":"Hack","metric":"GOALS_TOTAL","target":1}')$$,'42501',null,'client cannot create a challenge');
select throws_ok($$select public.get_game_engagement_admin()$$,'42501',null,'client cannot read admin analytics');
select pg_temp.login('staff');
select throws_ok($$select public.get_game_engagement()$$,'42501',null,'staff cannot use client Game Center read model');
select pg_temp.login('player');

-- No score cap, no score-based manipulation, no client internal data.
select ok((select bool_and(private.game_center_goal_chance(g,10,9)>0) from generate_series(0,4)g),'all levels can score a perfect round');
select ok((select bool_and(private.game_center_goal_chance(g,5,0)=private.game_center_goal_chance(g,5,8)) from generate_series(0,4)g),'score never changes probabilities');
select ok((select bool_and((private.game_center_level_distribution(g))[11]>0) from generate_series(0,4)g),'exact distribution has a positive perfect-round probability');
select is(public.get_safi_public_config()->>'practiceEnabled','true','practice opens for every client');
select throws_ok($$select public.get_safi_admin()$$,'42501',null,'client cannot read internal tuning');
select throws_ok($$select public.configure_safi('{}')$$,'42501',null,'client cannot change economy');
select throws_ok($$select public.set_safi_identity('name@email.com',true)$$,'22023','GAME_INVALID_NICKNAME','email cannot become a leaderboard identity');
select throws_ok($$select public.set_safi_identity('998901234567',true)$$,'22023','GAME_INVALID_NICKNAME','phone cannot become a leaderboard identity');
select public.set_safi_identity('SafiTester',true);
select is(public.get_safi_locker()->'identity'->>'nickname','SafiTester','safe nickname saved');
select is(jsonb_array_length(public.get_safi_locker()->'items'),11,'cosmetic catalogue supports all slots');
create function pg_temp.item(k text) returns uuid language sql as $$select id from public.safi_cosmetics where code=k$$;
select throws_ok($$select public.equip_safi_cosmetic(pg_temp.item('ice_gloves'),'gloves')$$,'P0403','GAME_COSMETIC_NOT_OWNED','unowned item cannot equip');
select throws_ok($$select public.purchase_safi_cosmetic(pg_temp.item('ice_gloves'),gen_random_uuid())$$,'P0403','COIN_INSUFFICIENT_BALANCE','insufficient funds cannot purchase');
insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(pg_temp.id('player'),50,'ADMIN_BONUS','TEST',gen_random_uuid());
select pg_temp.keep('buy',jsonb_build_object('requestId',gen_random_uuid()));
select public.purchase_safi_cosmetic(pg_temp.item('ice_gloves'),(pg_temp.run('buy')->>'requestId')::uuid);
select is(private.sun_coin_balance(pg_temp.id('player')),35::bigint,'atomic purchase debits exact catalogue price');
select public.purchase_safi_cosmetic(pg_temp.item('ice_gloves'),(pg_temp.run('buy')->>'requestId')::uuid);
select public.purchase_safi_cosmetic(pg_temp.item('ice_gloves'),gen_random_uuid());
select is(private.sun_coin_balance(pg_temp.id('player')),35::bigint,'repeated request and new request for owned item cannot double charge');
select throws_ok($$select public.purchase_safi_cosmetic(pg_temp.item('sunset_gloves'),(pg_temp.run('buy')->>'requestId')::uuid)$$,'22023','GAME_REQUEST_CONFLICT','purchase id cannot be reused for another item');
select public.equip_safi_cosmetic(pg_temp.item('ice_gloves'),'gloves');
select public.purchase_safi_cosmetic(pg_temp.item('classic_gloves'),gen_random_uuid());
select public.equip_safi_cosmetic(pg_temp.item('classic_gloves'),'gloves');
select is((select count(*) from public.safi_equipment where user_id=auth.uid() and slot='gloves'),1::bigint,'one equipped item per slot');
select throws_ok($$select public.equip_safi_cosmetic(pg_temp.item('classic_gloves'),'outfit')$$,'P0403','GAME_COSMETIC_NOT_OWNED','cross-slot equip is refused');
select public.equip_safi_cosmetic(null,'gloves');
select is((select count(*) from public.safi_equipment where user_id=auth.uid()),0::bigint,'unequip restores defaults');
select pg_temp.round('board','practice',pg_temp.goals(4),pg_temp.zones());
select is(public.get_safi_leaderboard('daily')->'entries'->0->>'bestScore','4','leaderboard score derives only from completed validated rounds');
select ok(not (public.get_safi_leaderboard('daily')->'entries'->0 ? 'email'),'leaderboard has no account email');
select ok(not (public.get_safi_leaderboard('daily')->'entries'->0 ? 'userId'),'leaderboard uses separate public identity');
select public.set_safi_identity('SafiTester',false);
select is(jsonb_array_length(public.get_safi_leaderboard('weekly')->'entries'),0,'opt-out removes player from leaderboard');
select pg_temp.login('other');
select is(private.sun_coin_balance(auth.uid()),0::bigint,'other wallet unaffected');
set local role authenticated;
select is((select count(*) from public.safi_inventory),0::bigint,'another player cannot read inventory');
select is((select count(*) from public.safi_runtime_config),0::bigint,'players cannot read private runtime settings');
select throws_ok($$insert into public.safi_inventory(user_id,item_id,request_id) values(auth.uid(),gen_random_uuid(),gen_random_uuid())$$,'42501',null,'client cannot grant inventory');
reset role;
select ok(not has_function_privilege('anon','public.purchase_safi_cosmetic(uuid,uuid)','execute'),'anonymous cannot buy cosmetics');
select ok(not has_function_privilege('authenticated','private.game_center_finish_rewards(uuid)','execute'),'reward helper is private');
select pg_temp.login('staff');
select public.configure_safi('{"enabled":true,"practice_enabled":true,"reward_enabled":true,"leaderboards_enabled":true,"free_interval_hours":48,"attempt_cost":12,"lucky_chance":0.01,"personality":"SHOWMAN","arena":"night"}');
select pg_temp.login('player');
select is(public.get_sun_coin_wallet()->'attempt'->>'cost','12','attempt cost is configurable');
select pg_temp.keep('practice',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
select is(pg_temp.run('practice')->'presentation'->>'arena','night','arena snapshot is config driven');
select is(pg_temp.run('practice')->'presentation'->>'personality','SHOWMAN','personality snapshot is config driven');
select is(private.sun_coin_balance(auth.uid()),35::bigint,'practice creation debits no coins');
-- Exercise the real admission/shot/finish RPCs, not a client score simulation.
update public.game_sessions set status='expired' where id=(pg_temp.run('practice')->>'sessionId')::uuid;
update public.game_reward_campaigns set status='ended' where status='active';
select pg_temp.login('staff');
select pg_temp.keep('reward_campaign',public.create_game_reward_campaign('{"title":"Integrity fixture","status":"active","rules":[{"score":1,"type":"SUN_COIN","amount":3}]}'));
select public.set_safi_campaign_limits((pg_temp.run('reward_campaign')->>'id')::uuid,1,0);
select pg_temp.login('player');
select pg_temp.keep('free_request',jsonb_build_object('id',gen_random_uuid()));
select pg_temp.keep('free_round',public.game_center_start_mode('safi-penalty',(pg_temp.run('free_request')->>'id')::uuid,'free'));
select is(private.sun_coin_balance(auth.uid()),35::bigint,'free reward start debits nothing');
select ok(not (pg_temp.run('free_round') ? 'goalkeeperZone'),'keeper result is never sent before a shot');
select pg_temp.keep('shot_request',jsonb_build_object('id',gen_random_uuid()));
-- Find a random stream whose first shot is a goal. No production function is mocked.
create function pg_temp.force_goal(sid uuid) returns void language plpgsql as $$
declare lvl integer; n integer; chance numeric;
begin
 select reach_snapshot,attempts_used+1 into lvl,n from public.game_sessions where id=sid;
 chance:=private.game_center_goal_chance(lvl,n,0);
 for i in 0..20000 loop
  perform setseed(-1+i*.0001);
  if random()<chance then perform setseed(-1+i*.0001); return; end if;
 end loop;
 raise exception 'No random seed';
end $$;
select pg_temp.force_goal((pg_temp.run('free_round')->>'sessionId')::uuid);
select pg_temp.keep('shot_answer',public.game_center_shoot((pg_temp.run('free_round')->>'sessionId')::uuid,(pg_temp.run('shot_request')->>'id')::uuid,1,1));
select is(public.game_center_shoot((pg_temp.run('free_round')->>'sessionId')::uuid,(pg_temp.run('shot_request')->>'id')::uuid,1,1),pg_temp.run('shot_answer'),'duplicate shot has the same score, keeper and rare visual event');
select throws_ok($$select public.game_center_shoot((pg_temp.run('free_round')->>'sessionId')::uuid,(pg_temp.run('shot_request')->>'id')::uuid,1,2)$$,'22023','GAME_REQUEST_CONFLICT','request id cannot change selected zone');
select throws_ok($$select public.game_center_shoot((pg_temp.run('free_round')->>'sessionId')::uuid,gen_random_uuid(),3,2)$$,'P0403','GAME_ATTEMPT_CLOSED','out of order shot cannot consume an attempt');
select throws_ok($$select public.game_center_finish((pg_temp.run('free_round')->>'sessionId')::uuid)$$,'P0403','GAME_INCOMPLETE','an incomplete round cannot claim');
do $$begin for n in 2..10 loop
 perform pg_temp.force_goal((pg_temp.run('free_round')->>'sessionId')::uuid);
 perform public.game_center_shoot((pg_temp.run('free_round')->>'sessionId')::uuid,gen_random_uuid(),n,n);
end loop; end $$;
select pg_temp.keep('free_finish',public.game_center_finish((pg_temp.run('free_round')->>'sessionId')::uuid));
select is(pg_temp.run('free_finish')->>'score','10','ten real server shots finish with authoritative score');
select is(pg_temp.run('free_finish')->'reward'->>'amount','3','configured reward granted');
select is(public.game_center_finish((pg_temp.run('free_round')->>'sessionId')::uuid),pg_temp.run('free_finish'),'duplicate finish returns the cached engagement and reward');
select is(private.sun_coin_balance(auth.uid()),38::bigint,'duplicate finish cannot repeat a credit');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','GAME_MAX_WINS','max wins blocks entry before debit');
select is(private.sun_coin_balance(auth.uid()),38::bigint,'max win rejection is free');
select is(public.get_sun_coin_wallet()->>'campaignAvailable','false','wallet reflects personal campaign limit');
select pg_temp.login('staff');
select public.set_safi_campaign_limits((pg_temp.run('reward_campaign')->>'id')::uuid,null,48);
select pg_temp.login('player');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','GAME_REWARD_COOLDOWN','reward cooldown blocks entry before debit');
select pg_temp.login('staff');
select public.set_safi_campaign_limits((pg_temp.run('reward_campaign')->>'id')::uuid,null,0);
select pg_temp.login('player');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free')$$,'P0403','GAME_FREE_COOLDOWN','configured free interval is enforced');
select ok((public.get_sun_coin_wallet()->'attempt'->>'nextFreeAt')::timestamptz > now()+interval '47 hours','countdown comes from configured server interval');
select pg_temp.keep('paid_request',jsonb_build_object('id',gen_random_uuid()));
select pg_temp.keep('paid_round',public.game_center_start_mode('safi-penalty',(pg_temp.run('paid_request')->>'id')::uuid,'paid'));
select is(private.sun_coin_balance(auth.uid()),26::bigint,'configured twelve coin fee and session create atomically');
select public.game_center_start_mode('safi-penalty',(pg_temp.run('paid_request')->>'id')::uuid,'paid');
select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid');
select is(private.sun_coin_balance(auth.uid()),26::bigint,'duplicate and fresh ids resume without another fee');
select pg_temp.login('other');
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid')$$,'P0403','COIN_INSUFFICIENT_BALANCE','empty wallet cannot create paid attempt');
select is((select count(*) from public.game_sessions where user_id=auth.uid() and entry_mode='paid'),0::bigint,'failed debit creates no session');
select pg_temp.login('player');
update public.game_sessions set status='expired' where id=(pg_temp.run('paid_round')->>'sessionId')::uuid;
update public.game_sessions set started_at=now()-interval '49 hours' where id=(pg_temp.run('free_round')->>'sessionId')::uuid;
select is(public.get_sun_coin_wallet()->'attempt'->>'freeAvailable','true','server unlocks free attempt after configured interval');
select is((select count(*) from public.game_reward_grants where user_id=auth.uid()),1::bigint,'only one campaign grant exists');
select pg_temp.login('staff');
select throws_ok($$select public.save_safi_cosmetic('{"code":"bad_cosmetic","title":"Bad","slot":"gloves","price":0,"enabled":true,"appearance":{"color":null}}')$$,'22023','GAME_INVALID_CONFIG','null cosmetic attributes cannot break client catalogue');
select public.save_safi_event('{"title":"Boss test","enabled":true,"starts_at":"2026-01-01T00:00:00Z","ends_at":"2099-01-01T00:00:00Z","boss":true,"arena":"ramadan","personality":"SERIOUS"}');
update public.game_sessions set status='expired' where id=(pg_temp.run('practice')->>'sessionId')::uuid;
select pg_temp.login('player');
select pg_temp.keep('boss',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
select is(pg_temp.run('boss')->'presentation'->>'boss','true','boss is triggered by a server event');
select is(pg_temp.run('boss')->'presentation'->>'arena','ramadan','season comes from active event');
select pg_temp.login('staff');
select public.configure_safi('{"enabled":false,"practice_enabled":true,"reward_enabled":true,"leaderboards_enabled":false,"free_interval_hours":48,"attempt_cost":12,"lucky_chance":0,"personality":"CLASSIC","arena":"classic"}');
select pg_temp.login('player');
select is(public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice')->>'sessionId',pg_temp.run('boss')->>'sessionId','disabling new entries does not invalidate an existing round');
update public.game_sessions set status='expired' where id=(pg_temp.run('boss')->>'sessionId')::uuid;
select throws_ok($$select public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice')$$,'P0403','GAME_NOT_AVAILABLE','disabled game blocks a new session');
select is(private.sun_coin_balance(auth.uid()),26::bigint,'refused start never debits balance');
select * from finish();
rollback;
