begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table rr_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into rr_ids(key) values ('player'),('staff'),('client');
grant select on rr_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from rr_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@rules-tests.local',jsonb_build_object('full_name',key),'{}'
from rr_ids where key in ('player','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Rules Client','RRTEST');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
-- Independent of whatever the database already runs (rolled back at the end).
update public.sun_coin_campaigns set status='ended' where status='active';
update public.game_reward_campaigns set status='ended' where status='active';
update public.game_center_settings set difficulty='easy';

create temp table rr_run(key text primary key, data jsonb);
grant select on rr_run to authenticated;
create function pg_temp.run(k text) returns jsonb language sql as $$select data from rr_run where key=k$$;
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into rr_run values(k,d) on conflict (key) do update set data=excluded.data returning data$$;
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
-- A paid Reward Mode round with p_goals goals (first shots), finished. Every answer the app gets is kept for the leak check.
create function pg_temp.round(p_goals int) returns jsonb language plpgsql as $$
declare st jsonb; sid uuid; shot jsonb; fin jsonb;
begin
 insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(pg_temp.id('player'),10,'ADMIN_BONUS','TEST',gen_random_uuid());
 st := public.game_center_start_mode('safi-penalty',gen_random_uuid(),'paid');
 insert into rr_payloads values ('start', st);
 sid := (st->>'sessionId')::uuid;
 for n in 1..10 loop
  perform pg_temp.force(sid, n<=p_goals);
  shot := public.game_center_shoot(sid,gen_random_uuid(),n,1 + (n*4)%15);
  insert into rr_payloads values ('shoot', shot);
 end loop;
 fin := public.game_center_finish(sid);
 insert into rr_payloads values ('finish', fin);
 return fin || jsonb_build_object('sessionId', sid);
end $$;
create temp table rr_payloads(kind text, data jsonb);
create function pg_temp.pro_end() returns timestamptz language sql as $$
 select max(ends_at) from public.workspace_subscriptions where workspace_id=private.client_workspace_id(pg_temp.id('client')) and plan_key='pro' and status='active'$$;
create function pg_temp.rule(p_score int) returns uuid language sql as $$
 select id from public.game_reward_rules where campaign_id=(pg_temp.run('camp')->>'id')::uuid and score=p_score$$;

-- ————— Reward rules are configuration, not code
select pg_temp.login('player');
select throws_ok($$select public.create_game_reward_campaign('{"title":"x","rules":[{"score":7,"type":"SUN_COIN","amount":3}]}')$$,'42501',null,'a client cannot create rules');
select throws_ok($$select public.set_game_reward_campaign_status(gen_random_uuid(),'active')$$,'42501',null,'a client cannot switch campaigns');
select throws_ok($$select public.update_game_reward_campaign(gen_random_uuid(),'{}')$$,'42501',null,'a client cannot edit rules');
select throws_ok($$select public.set_game_center_difficulty('safi-penalty','easy')$$,'42501',null,'a client cannot change the level');

select pg_temp.login('staff');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Bad","rules":[{"score":11,"type":"SUN_COIN","amount":3}]}')$$,'22023','GAME_INVALID_REWARD_RULES','score above 10 refused');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Bad","rules":[{"score":8,"type":"CASH","amount":3}]}')$$,'22023','GAME_INVALID_REWARD_RULES','unknown reward type refused');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Bad","rules":[{"score":9,"type":"PRO_DAYS","amount":400}]}')$$,'22023','GAME_INVALID_REWARD_RULES','Pro longer than a year refused');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Bad","rules":[]}')$$,'22023','GAME_INVALID_REWARD_RULES','a campaign needs a rule');
select throws_ok($$select public.create_game_reward_campaign('{"title":"Bad","endsAt":"2020-01-01T00:00:00Z","rules":[{"score":7,"type":"SUN_COIN","amount":3}]}')$$,'22023','GAME_INVALID_REWARD_RULES','end before start refused');
select pg_temp.keep('camp',public.create_game_reward_campaign('{"title":"SAFI kuz","status":"active","rules":[
 {"score":7,"type":"SUN_COIN","amount":3},{"score":8,"type":"SUN_COIN","amount":5},
 {"score":9,"type":"PRO_DAYS","amount":7},{"score":10,"type":"PRO_DAYS","amount":30}]}'));
select is((select jsonb_agg(jsonb_build_array(r->'score',r->'type',r->'amount',r->'enabled')) from jsonb_array_elements(pg_temp.run('camp')->'rules') r),
 '[[7,"SUN_COIN",3,true],[8,"SUN_COIN",5,true],[9,"PRO_DAYS",7,true],[10,"PRO_DAYS",30,true]]'::jsonb,'the four rules as configured');
select is((pg_temp.run('camp')->>'live')::boolean,true,'the campaign is live');

-- ————— Each score gets exactly the configured reward
select pg_temp.login('player');
select pg_temp.keep('s6',pg_temp.round(6));
select is(pg_temp.run('s6')->'reward','null'::jsonb,'6 goals: below every rule, no reward');
select pg_temp.keep('s7',pg_temp.round(7));
select is(pg_temp.run('s7')->'reward'->>'type','SUN_COIN','7 goals: SUN Coin');
select is((pg_temp.run('s7')->'reward'->>'amount')::int,3,'7 goals → configured 3 SC');
select is((select amount::int from public.sun_coin_ledger where game_session_id=(pg_temp.run('s7')->>'sessionId')::uuid and type='GAME_REWARD'),3,'3 SC written to the ledger');
select pg_temp.keep('s8',pg_temp.round(8));
select is(pg_temp.run('s8')->'reward'->>'type','SUN_COIN','8 goals: SUN Coin');
select is((pg_temp.run('s8')->'reward'->>'amount')::int,5,'8 goals → configured 5 SC');
select pg_temp.keep('pro_before',jsonb_build_object('at',coalesce(pg_temp.pro_end(),now())));
select pg_temp.keep('s9',pg_temp.round(9));
select is(pg_temp.run('s9')->'reward'->>'type','PRO_DAYS','9 goals: Pro');
select is((pg_temp.run('s9')->'reward'->>'amount')::int,7,'9 goals → configured 7 days of Pro');
select ok(abs(extract(epoch from pg_temp.pro_end() - ((pg_temp.run('pro_before')->>'at')::timestamptz + interval '7 days'))) < 5,'Pro now runs 7 days longer');
select is((pg_temp.run('s9')->'reward'->>'endsAt')::timestamptz,pg_temp.pro_end(),'the answer carries the new Pro end date');
select is((pg_temp.run('s9')->>'coinAmount')::int,0,'no SUN Coin with a Pro reward');
select pg_temp.keep('s10',pg_temp.round(10));
select is(pg_temp.run('s10')->'reward'->>'type','PRO_DAYS','10 goals: Pro');
select is((pg_temp.run('s10')->'reward'->>'amount')::int,30,'10 goals → configured 30 days of Pro');
select is((select count(*)::int from public.game_reward_grants where user_id=pg_temp.id('player')),4,'four rounds rewarded, one reward each');
select results_eq($$select score::int, reward_type, amount from public.game_reward_grants where user_id=pg_temp.id('player') order by score$$,
 $$values (7,'SUN_COIN'::text,3),(8,'SUN_COIN',5),(9,'PRO_DAYS',7),(10,'PRO_DAYS',30)$$,'grant history matches the rules');

-- ————— A switched-off rule is never given; the admin's changes apply without an app update
select pg_temp.login('staff');
select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"rules":[{"score":9,"type":"PRO_DAYS","amount":7,"enabled":false},{"score":10,"type":"PRO_DAYS","amount":30,"enabled":false}]}');
select pg_temp.login('player');
select pg_temp.keep('off9',pg_temp.round(9));
select is(pg_temp.run('off9')->'reward','{"type":"SUN_COIN","amount":5,"endsAt":null}'::jsonb,'Pro rules off: 9 goals earn the best rule still on (8 → 5 SC), never Pro');
select pg_temp.keep('off10',pg_temp.round(10));
select is(pg_temp.run('off10')->'reward'->>'type','SUN_COIN','Pro rules off: 10 goals are not given Pro');
select is((select awarded::int from public.game_reward_rules where id=pg_temp.rule(9)),1,'the switched-off 9 rule was not used again');
select pg_temp.login('staff');
select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"title":"SAFI kuz 2","rules":[{"score":7,"type":"SUN_COIN","amount":4},{"score":10,"type":"PRO_DAYS","amount":14,"quantity":2,"enabled":true}]}');
select pg_temp.login('player');
select is((pg_temp.round(7)->'reward'->>'amount')::int,4,'7 → 4 SC right after the admin changed the amount');
select is(pg_temp.round(10)->'reward'->>'amount','14','10 → 14 days after the admin switched it back on with a new duration');
select throws_ok($$select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"rules":[{"score":7,"remove":true}]}')$$,'42501',null,'a player still cannot edit');
select pg_temp.login('staff');
select throws_ok($$select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"rules":[{"score":7,"remove":true}]}')$$,'P0403','GAME_REWARD_RULE_IN_USE','a rule someone has won stays (switch it off instead)');
select throws_ok($$select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"rules":[{"score":10,"type":"PRO_DAYS","amount":14,"quantity":0}]}')$$,'22023','GAME_INVALID_REWARD_RULES','quantity must be at least 1');
select throws_ok($$select public.update_game_reward_campaign((pg_temp.run('camp')->>'id')::uuid,'{"rules":[{"score":7,"type":"SUN_COIN","amount":4,"quantity":1}]}')$$,'22023','GAME_INVALID_REWARD_RULES','quantity cannot go below what was already given');
-- Only 7 and 8 on (another campaign): 9 and 10 stay inactive
select public.set_game_reward_campaign_status((pg_temp.run('camp')->>'id')::uuid,'ended');
select pg_temp.keep('camp2',public.create_game_reward_campaign('{"title":"Faqat coin","status":"active","rules":[
 {"score":7,"type":"SUN_COIN","amount":3},{"score":8,"type":"SUN_COIN","amount":5},
 {"score":9,"type":"PRO_DAYS","amount":7,"enabled":false},{"score":10,"type":"PRO_DAYS","amount":30,"enabled":false}]}'));
select pg_temp.login('player');
select pg_temp.keep('c2_10',pg_temp.round(10));
select is(pg_temp.run('c2_10')->'reward','{"type":"SUN_COIN","amount":5,"endsAt":null}'::jsonb,'inactive 10 rule: 10/10 gets the 8-goal SUN Coin');
select is((select count(*)::int from public.game_reward_grants g join public.game_reward_rules r on r.id=g.rule_id where g.campaign_id=(pg_temp.run('camp2')->>'id')::uuid and not r.enabled),0,'no grant ever comes from a switched-off rule');
select pg_temp.login('staff');
select is((select jsonb_agg((r->>'score')::int order by (r->>'score')::int) from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'rewardCampaigns'->0->'rules') r
 where (r->>'enabled')::boolean),'[7,8]'::jsonb,'the admin view shows which rules are on');

-- ————— The client can neither forge a score nor a reward
select pg_temp.login('player');
select is((select count(*)::int from pg_proc where proname='game_center_finish' and pronamespace='public'::regnamespace and pronargs=1),1,'finish takes only the round id: score and reward are the server''s');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'game_center_%'
 and exists (select 1 from unnest(p.proargnames) a where a ~* '(score|reward|amount|type|level|goal)')),0,'no game RPC accepts a score, reward, amount, type or level');
select pg_temp.keep('open',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
set local role authenticated;
select throws_ok($$update public.game_sessions set score=10 where id=(select (data->>'sessionId')::uuid from rr_run where key='open')$$,'42501',null,'a client cannot write its score');
select throws_ok($$insert into public.game_attempts(session_id,n,params,hit,valid) values((select (data->>'sessionId')::uuid from rr_run where key='open'),1,'{}',true,true)$$,'42501',null,'a client cannot invent goals');
select throws_ok($$insert into public.game_reward_grants(session_id,user_id,campaign_id,rule_id,score,reward_type,amount) select gen_random_uuid(),auth.uid(),campaign_id,id,10,'PRO_DAYS',365 from public.game_reward_rules limit 1$$,'42501',null,'a client cannot grant itself a reward');
select throws_ok($$update public.game_reward_rules set amount=1000000$$,'42501',null,'a client cannot change a rule');
select is((select count(*)::int from public.game_reward_rules),0,'a client cannot read the rules');
select is((select count(*)::int from public.game_reward_campaigns),0,'a client cannot read the campaigns');
select is((select count(*)::int from public.game_center_settings),0,'a client cannot read the level');
reset role;
select throws_ok($$select public.game_center_claim((pg_temp.run('s10')->>'sessionId')::uuid,0)$$,'P0403',null,'no prize box to claim: the reward was already decided');

-- ————— Nothing the app receives describes the level, the top result or the rules
insert into rr_payloads select 'wallet', public.get_sun_coin_wallet();
create function pg_temp.keys(j jsonb) returns setof text language sql as $$
 with recursive walk(v) as (select j union all
  select e.value from walk, lateral (select value from jsonb_each(case when jsonb_typeof(walk.v)='object' then walk.v else '{}' end)
   union all select value from jsonb_array_elements(case when jsonb_typeof(walk.v)='array' then walk.v else '[]' end)) e)
 select k from walk, lateral jsonb_object_keys(case when jsonb_typeof(walk.v)='object' then walk.v else '{}' end) k $$;
select is((select count(*)::int from rr_payloads where kind='finish'), 10, 'ten rewarded-mode rounds captured');
select is((select count(*)::int from rr_payloads), 10 * 12 + 1, 'every start, shot and finish, and the wallet');
select ok(exists(select 1 from rr_payloads, lateral pg_temp.keys(data) k where k = 'endsAt') and exists(select 1 from rr_payloads, lateral pg_temp.keys(data) k where k = 'freeAvailable'),
 'the key walker reaches nested objects');
select is((select coalesce(jsonb_agg(distinct k), '[]') from rr_payloads, lateral pg_temp.keys(data) k
 where k ~* '(level|difficult|reach|top|cap|max|limit|target|chance|rule|minscore|maxscore|options|campaignid|strategy|pool|remaining|quantity)'),
 '[]'::jsonb,'no payload names a level, limit, chance, rule or campaign setting');
select is((select public.get_sun_coin_wallet()->'rewardKinds'),'["SUN_COIN"]'::jsonb,'the wallet only says what kind of prize exists');
select ok((select public.get_sun_coin_wallet()->'campaign') = 'null'::jsonb and (select public.get_sun_coin_wallet()->'proCampaign') = 'null'::jsonb,'no campaign details for the app');

-- ————— Hidden balance: 10,000 judged rounds per level
select pg_temp.login('staff');
create temp table rr_sim(lvl int, r int, goals int, first_goal boolean, last_goal boolean, bad_dives int);
do $$
declare g int; j record; firstg boolean; lastg boolean; bad int;
begin
 for lvl in 0..4 loop
  for r in 1..10000 loop
   g := 0; bad := 0;
   for n in 1..10 loop
    select * into j from private.game_center_judge(lvl, 1 + (r * 7 + n * 3) % 15, n, g);
    if n = 1 then firstg := j.goal; end if;
    if n = 10 then lastg := j.goal; end if;
    -- A save dives onto the ball; a goal sends the keeper clearly the wrong way.
    if (not j.goal and j.keeper <> 1 + (r * 7 + n * 3) % 15) or (j.goal and abs((j.keeper - 1) % 5 - ((r * 7 + n * 3) % 15) % 5) <= 1
        and abs((j.keeper - 1) / 5 - ((r * 7 + n * 3) % 15) / 5) <= 1) then bad := bad + 1; end if;
    if j.goal then g := g + 1; end if;
   end loop;
   insert into rr_sim values (lvl, r, g, firstg, lastg, bad);
  end loop;
 end loop;
end $$;
create temp table rr_expect as
select (l->>'index')::int lvl, (l->>'top')::int top, (l->>'average')::numeric avg_goals, (l->'distribution'->>((l->>'top')::int))::numeric p_top, l->'distribution' dist
from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'levels') l;
select results_eq($$select lvl, count(*)::int from rr_sim group by lvl order by lvl$$, $$values (0,10000),(1,10000),(2,10000),(3,10000),(4,10000)$$, '10,000 rounds per level');
select results_eq($$select lvl, max(goals) from rr_sim group by lvl order by lvl$$, $$values (0,10),(1,9),(2,8),(3,7),(4,6)$$,
 'top results: EASY 10 · NORMAL 9 · HARD 8 · VERY HARD 7 · EXTREME 6 — reached, never passed');
select results_eq($$select lvl, top from rr_expect order by lvl$$, $$values (0,10),(1,9),(2,8),(3,7),(4,6)$$, 'the admin view states the same top results');
select ok(bool_and(abs(s.p - e.p_top) < 0.015), 'how often the top result happens matches the admin view (±1.5 %)')
 from (select lvl, avg((goals = (select top from rr_expect x where x.lvl = rr_sim.lvl))::int) p from rr_sim group by lvl) s join rr_expect e using (lvl);
select ok(bool_and(s.p between 0.025 and 0.075), 'the top result is a very good round: 2.5–7.5 % of rounds on every level')
 from (select lvl, avg((goals = (select top from rr_expect x where x.lvl = rr_sim.lvl))::int) p from rr_sim group by lvl) s;
select ok(bool_and(abs(s.m - e.avg_goals) < 0.2), 'average goals match the admin view (±0.2)')
 from (select lvl, avg(goals) m from rr_sim group by lvl) s join rr_expect e using (lvl);
select ok((select bool_and(m < prev) from (select m, lag(m) over (order by lvl) prev from (select lvl, avg(goals) m from rr_sim group by lvl) a) b where prev is not null),
 'each level is harder than the one before');
select ok((select sum(abs(s.p - (e.dist->>s.goals)::numeric)) / 2 from (select lvl, goals, count(*) / 10000.0 p from rr_sim group by lvl, goals) s join rr_expect e using (lvl)) < 0.1,
 'the whole score distribution matches the admin view (total variation < 2 % per level)');
select ok((select avg(first_goal::int) - avg(last_goal::int) from rr_sim where lvl = 0) > 0.1, 'the keeper sharpens during the round: the first shot scores more often than the last');
select is((select sum(bad_dives)::int from rr_sim), 0, 'every save dives onto the ball, every goal sends the keeper the wrong way');
-- Not a wall: on HARD, rounds with 7 goals are common and 8 still happens — the top result is rare, not blocked early.
select ok((select avg((goals = 7)::int) from rr_sim where lvl = 2) > 0.08 and (select avg((goals = 8)::int) from rr_sim where lvl = 2) > 0.02, 'HARD: 7/10 is common, 8/10 happens');

select ok(not has_function_privilege('anon','public.create_game_reward_campaign(jsonb)','execute'),'anonymous cannot create rules');
select * from finish();
rollback;
