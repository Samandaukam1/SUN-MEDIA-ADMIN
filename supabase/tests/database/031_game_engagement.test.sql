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

-- Daily progress, all 4 corners, a 4-goal combo; result rows are authoritative.
select pg_temp.round('first','practice',pg_temp.goals(4),pg_temp.zones());
select is(public.get_game_engagement()->'stats'->>'personalBest','4','personal best counts valid shot outcomes');
select is(public.get_game_engagement()->'stats'->>'longestCombo','4','longest combo derives from shot ordering');
select is(public.get_game_engagement()->'stats'->>'goals','4','four goals');
select is(public.get_game_engagement()->'stats'->>'savesFaced','6','six saves');
select is(public.get_game_engagement()->'stats'->>'favoriteZone','8','favorite zone uses attempted shots');
select is((select c->>'progress' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='five_goals'),'4','daily goals progress includes practice');
select is((select a->>'unlocked' from jsonb_array_elements(public.get_game_engagement()->'achievements')a where a->>'code'='corner_master'),'true','four distinct corners unlock the badge');
select is((select a->>'unlocked' from jsonb_array_elements(public.get_game_engagement()->'achievements')a where a->>'code'='combo_master'),'true','four consecutive goals unlock the combo badge');
select is(pg_temp.run('first')->'engagement'->>'newPersonalBest','true','finish announces personal best');
select is(pg_temp.run('first')->'engagement'->>'coinAmount','0','default badges and practice mint no coins');
select is(private.sun_coin_balance(pg_temp.id('player')),0::bigint,'wallet is unchanged');
select is(public.get_game_engagement()->'streak'->>'current','1','one completed-game activity day');
select is(public.game_center_finish((pg_temp.run('first')->>'sessionId')::uuid),pg_temp.run('first')-'sessionId','finish replay returns identical engagement');
select is(public.get_game_engagement()->'stats'->>'gamesPlayed','1','finish replay cannot inflate statistics');
select is((select count(*)::int from public.game_engagement_progress where user_id=pg_temp.id('player') and definition_id=pg_temp.definition('first_goal')),1,'first-goal achievement unlocked once');

select pg_temp.round('second','practice',pg_temp.goals(2),pg_temp.zones());
select is(public.get_game_engagement()->'stats'->>'personalBest','4','lower score preserves personal best');
select is(public.get_game_engagement()->'streak'->>'current','1','multiple rounds today do not multiply streak');
select is((select c->>'progress' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='five_goals'),'5','progress is capped at configured target');
select is((select c->>'completed' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='five_goals'),'true','daily challenge completes across rounds');
select is(jsonb_array_length(pg_temp.run('second')->'engagement'->'unlockedAchievements'),0,'previous badges do not re-announce');
select pg_temp.round('combo_reset','practice',array[true,true,false,true,true,true,false,false,false,false],pg_temp.zones());
select is((select longest_combo::int from public.game_round_stats where session_id=(pg_temp.run('combo_reset')->>'sessionId')::uuid),3,'a save resets the combo');
select is((select c->>'completed' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='practice_three'),'true','three completed practice rounds satisfy template');
select is(public.get_game_engagement()->'stats'->>'personalBest','5','new best persists across rounds');

-- Per-user visibility: no names, emails, phone numbers or other-player statistics.
select pg_temp.login('other');
select is(public.get_game_engagement()->'stats'->>'gamesPlayed','0','another player starts independently');
set local role authenticated;
select is((select count(*)::int from public.game_player_stats where user_id=pg_temp.id('player')),0,'RLS hides other player stats');
select is((select count(*)::int from public.game_engagement_progress where user_id=pg_temp.id('player')),0,'RLS hides other player progress');
select is((select count(*)::int from public.game_round_stats where user_id=pg_temp.id('player')),0,'RLS hides other player round history');
select throws_ok($$select private.record_game_engagement((pg_temp.run('first')->>'sessionId')::uuid,true)$$,'42501',null,'client cannot forge progress or awards');
select throws_ok($$update public.game_player_stats set personal_best=10 where user_id=auth.uid()$$,'42501',null,'client cannot edit personal best');
reset role;
select ok(not (public.get_game_engagement()::text ~* 'email|phone|fullName|clientName'),'read model contains no private account identity');

-- A server-local midnight boundary, consecutive days, gap reset, longest history.
select pg_temp.round('yesterday','practice',pg_temp.goals(3),pg_temp.zones(),(private.agency_today()-1)::timestamp at time zone private.agency_timezone());
select is((select c->>'progress' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='five_goals'),'0','yesterday progress resets in today read model');
select pg_temp.round('today','practice',pg_temp.goals(2),pg_temp.zones(),private.agency_today()::timestamp at time zone private.agency_timezone()+interval '30 minutes');
select is((select day_key from public.game_round_stats where session_id=(pg_temp.run('today')->>'sessionId')::uuid),private.agency_today(),'local day handles prior UTC calendar date');
select is(public.get_game_engagement()->'streak'->>'current','2','consecutive completed-game days increment streak');
select is((select c->>'progress' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='five_goals'),'2','today challenge starts its own progress');
select pg_temp.round('after_gap','practice',pg_temp.goals(1),pg_temp.zones(),(private.agency_today()+2)::timestamp at time zone private.agency_timezone());
select is((select current_streak from public.game_player_stats where user_id=pg_temp.id('other')),1,'missed activity day resets current streak');
select is((select longest_streak from public.game_player_stats where user_id=pg_temp.id('other')),2,'longest streak remains after gap');

-- Admin configuration, daily global budget and per-definition award cap.
select pg_temp.login('staff');
select is(public.configure_game_engagement('safi-penalty',2)->>'dailyCoinCap','2','admin configures 2 SC total daily engagement budget');
select throws_ok($$select public.configure_game_engagement('safi-penalty',-1)$$,'22023',null,'negative daily budget rejected');
select throws_ok($$select public.save_game_engagement_definition('{"kind":"challenge","code":"paid_practice","title":"No","metric":"PRACTICE_ROUNDS","target":1,"rewardCoins":1,"dailyRewardLimit":1}')$$,'22023',null,'practice-specific template cannot mint SC');
select pg_temp.keep('coin_def',public.save_game_engagement_definition(jsonb_build_object('kind','challenge','code','reward_goal','title','One reward goal','metric','GOALS_TOTAL','target',1,'rewardCoins',2,'dailyRewardLimit',1,'startsAt',now()-interval '1 day')));
select pg_temp.keep('other_coin_def',public.save_game_engagement_definition(jsonb_build_object('kind','achievement','code','reward_badge','title','Reward badge','metric','COMPLETED_ROUNDS','target',1,'rewardCoins',2,'dailyRewardLimit',10,'startsAt',now()-interval '1 day')));
select pg_temp.login('player');
select pg_temp.round('practice_coin','practice',pg_temp.goals(10),pg_temp.zones());
select is(pg_temp.run('practice_coin')->'engagement'->>'coinAmount','0','coin-configured challenge does not reward practice');
select is((select c->>'progress' from jsonb_array_elements(public.get_game_engagement()->'challenges')c where c->>'code'='reward_goal'),'0','coin challenge progress counts Reward Mode only');
select pg_temp.round('reward_coin','free',pg_temp.goals(1),pg_temp.zones());
select is(pg_temp.run('reward_coin')->'engagement'->>'coinAmount','2','reward activity issues at most global daily 2 SC');
select is(private.sun_coin_balance(pg_temp.id('player')),2::bigint,'challenge or achievement credit reaches shared wallet');
select is((select count(*)::int from public.sun_coin_ledger where user_id=pg_temp.id('player') and source in('GAME_CHALLENGE','GAME_ACHIEVEMENT')),1,'one engagement ledger credit');
select is((select coins_awarded from public.game_engagement_daily_budget where game_key='safi-penalty' and day_key=private.agency_today()),2,'atomic daily budget records the credit');
select is(public.game_center_finish((pg_temp.run('reward_coin')->>'sessionId')::uuid),pg_temp.run('reward_coin')-'sessionId','reward replay is identical');
select is(private.sun_coin_balance(pg_temp.id('player')),2::bigint,'reward replay cannot mint twice');
select pg_temp.login('other');
select pg_temp.round('other_reward','free',pg_temp.goals(4),pg_temp.zones());
select is(private.sun_coin_balance(pg_temp.id('other')),0::bigint,'global budget prevents a second user from overspending');
select is(pg_temp.run('other_reward')->'engagement'->>'coinAmount','0','completion still works when global reward allocation is exhausted');
select pg_temp.login('staff');
select throws_ok($$select public.save_game_engagement_definition(jsonb_build_object('id',(pg_temp.run('coin_def')->>'id')::uuid,'target',2))$$,'P0403','GAME_ENGAGEMENT_DEFINITION_IN_USE','progress-bearing target cannot be rewritten');
select is(public.save_game_engagement_definition(jsonb_build_object('id',(pg_temp.run('coin_def')->>'id')::uuid,'enabled',false))->>'enabled','false','admin can disable future challenge availability');
select is(public.get_game_engagement_admin()->'analytics'->>'coinsAwarded','2','analytics report issued engagement coins');
select ok((public.get_game_engagement_admin()->'analytics'->>'gamesPlayed')::int>=10,'analytics include completed rounds');
select ok(not has_function_privilege('anon','public.get_game_engagement(text)','execute'),'anonymous cannot read Game Center profile');
select ok(not has_function_privilege('authenticated','private.game_center_finish_rewards(uuid)','execute'),'client cannot bypass engagement wrapper');
select * from finish();
rollback;
