-- Additive SAFI production configuration. Existing sessions, wallet ledger and auth remain authoritative.
create table public.safi_runtime_config (
 game_key text primary key references public.game_center_settings(game_key),
 enabled boolean not null default true, practice_enabled boolean not null default true,
 reward_enabled boolean not null default true, leaderboards_enabled boolean not null default true,
 free_interval_hours integer not null default 24 check(free_interval_hours between 1 and 8760),
 attempt_cost integer not null default 10 check(attempt_cost between 1 and 100000),
 lucky_chance numeric not null default 0.015 check(lucky_chance between 0 and 0.1),
 personality text not null default 'CLASSIC' check(personality in ('CLASSIC','SHOWMAN','SERIOUS')),
 arena text not null default 'classic' check(arena in ('classic','night','summer','new_year','ramadan','campaign')),
 updated_at timestamptz not null default now()
);
insert into public.safi_runtime_config(game_key) values('safi-penalty');
alter table public.safi_runtime_config enable row level security;
revoke all on public.safi_runtime_config from public,anon,authenticated;
grant select on public.safi_runtime_config to authenticated;
create policy "game managers read runtime config" on public.safi_runtime_config for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));

create table public.safi_events (
 id uuid primary key default gen_random_uuid(), title text not null check(char_length(title) between 1 and 100),
 enabled boolean not null default false, starts_at timestamptz not null, ends_at timestamptz not null,
 boss boolean not null default true, arena text not null default 'night' check(arena in ('classic','night','summer','new_year','ramadan','campaign')),
 personality text not null default 'SHOWMAN' check(personality in ('CLASSIC','SHOWMAN','SERIOUS')),
 check(ends_at>starts_at)
);
alter table public.safi_events enable row level security;
revoke all on public.safi_events from public,anon,authenticated;
grant select on public.safi_events to authenticated;
create policy "game managers read events" on public.safi_events for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));

alter table public.game_sessions add column presentation_snapshot jsonb not null default '{}';
alter table public.game_reward_campaigns add column max_wins_per_user integer check(max_wins_per_user between 1 and 10000),
 add column win_cooldown_hours integer not null default 0 check(win_cooldown_hours between 0 and 8760);

create function private.safi_snapshot() returns trigger language plpgsql set search_path='' as $$
declare c public.safi_runtime_config; e public.safi_events;
begin
 if new.game_key='safi-penalty' then
  select * into c from public.safi_runtime_config where game_key=new.game_key;
  select * into e from public.safi_events where enabled and starts_at<=now() and ends_at>now() order by starts_at desc,id limit 1;
  new.presentation_snapshot:=jsonb_build_object('personality',coalesce(e.personality,c.personality,'CLASSIC'),
   'arena',coalesce(e.arena,c.arena,'classic'),'boss',coalesce(e.boss,false),'eventTitle',e.title);
 end if;
 return new;
end $$;
create trigger game_sessions_06_safi_presentation before insert on public.game_sessions for each row execute function private.safi_snapshot();

-- All scores remain possible at every level. Neither current score nor reward thresholds affect a draw.
create or replace function private.game_center_level(p_level integer, out base numeric, out top integer)
language sql immutable set search_path='' as $$
 select (case p_level when 0 then 0.76 when 1 then 0.61 when 2 then 0.50 when 3 then 0.38 else 0.28 end)::numeric,10;
$$;
create or replace function private.game_center_goal_chance(p_level integer,p_shot integer,p_goals integer) returns numeric
language sql immutable set search_path='' as $$
 select greatest(0.05,least(0.95,l.base*(1.04-0.009*(greatest(1,least(coalesce(p_shot,1),10))-1))))
 from private.game_center_level(coalesce(p_level,0))l;
$$;
-- Preserve rare probabilities in the manager read model; four-decimal rounding hid possible 10/10 results.
create or replace function private.game_center_levels_json() returns jsonb language sql stable set search_path='' as $$
 select jsonb_agg(jsonb_build_object('key',k.key,'index',k.idx,'top',l.top,
 'average',round((select sum((i-1)*x.d[i]) from generate_subscripts(x.d,1)i),2),
 'distribution',(select jsonb_agg(x.d[i] order by i) from generate_subscripts(x.d,1)i)) order by k.idx)
 from(values('easy',0),('normal',1),('hard',2),('very_hard',3),('extreme',4))k(key,idx)
 cross join lateral private.game_center_level(k.idx)l
 cross join lateral(select private.game_center_level_distribution(k.idx)d)x;
$$;
create or replace function private.game_center_judge(p_level integer,p_zone integer,p_shot integer,p_goals integer,out goal boolean,out keeper integer)
language plpgsql volatile set search_path='' as $$
begin
 goal:=random()<private.game_center_goal_chance(p_level,p_shot,p_goals);
 if not goal then keeper:=p_zone;
 else select z into keeper from generate_series(1,15)z where z<>p_zone order by random() limit 1;
 end if;
end $$;


create or replace function private.center_session_json(s public.game_sessions) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('sessionId', s.id, 'gameId', s.game_key, 'attempts', s.attempt_limit,
  'score', s.score, 'attemptsUsed', s.attempts_used, 'rewardEligible', s.reward_eligible, 'rewardReason', s.reward_reason,
  'expiresAt', s.expires_at, 'mode', s.entry_mode, 'coinBalance', private.sun_coin_balance(s.user_id), 'presentation', s.presentation_snapshot);
$$;

create or replace function public.game_center_start_mode(p_game_key text, p_request uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare client uuid; s public.game_sessions; c public.game_reward_campaigns; last_free timestamptz; cfg public.safi_runtime_config;
begin
 client := private.require_game_client();
 if p_game_key is distinct from 'safi-penalty' or p_request is null then raise exception 'GAME_NOT_AVAILABLE' using errcode = '22023'; end if;
 if p_mode is null or p_mode not in ('practice', 'free', 'paid') then raise exception 'GAME_INVALID_MODE' using errcode = '22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 731));
 select * into s from public.game_sessions where user_id = auth.uid() and start_request = p_request;
 if found then
  if s.game_key <> p_game_key or (s.entry_mode <> p_mode and s.entry_mode <> 'legacy') then raise exception 'GAME_REQUEST_CONFLICT' using errcode = '22023'; end if;
  return private.center_session_json(s);
 end if;
 -- A reconnect or mode button cannot erase an active reward round or debit a second fee. A practice round
 -- carries nothing, so choosing Reward Mode closes it (inside this transaction: a refused start keeps it).
 select * into s from public.game_sessions where user_id = auth.uid() and game_key = p_game_key and status = 'playing' and expires_at > now()
  order by started_at desc limit 1;
 if found then
  if s.entry_mode = 'practice' and p_mode <> 'practice' then
   update public.game_sessions set status = 'expired', finished_at = clock_timestamp() where id = s.id;
  else
   return private.center_session_json(s);
  end if;
 end if;
 select * into cfg from public.safi_runtime_config where game_key=p_game_key;
 if not cfg.enabled then raise exception 'GAME_NOT_AVAILABLE' using errcode='P0403'; end if;
 if p_mode='practice' and not cfg.practice_enabled then raise exception 'GAME_PRACTICE_DISABLED' using errcode='P0403'; end if;
 if p_mode<>'practice' and not cfg.reward_enabled then raise exception 'GAME_REWARD_DISABLED' using errcode='P0403'; end if;
 if p_mode <> 'practice' then
  c := private.game_reward_live_campaign(p_game_key);
  if c.id is null then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode = 'P0403'; end if;
  if c.max_wins_per_user is not null and (select count(*) from public.game_reward_grants where user_id=auth.uid() and campaign_id=c.id)>=c.max_wins_per_user then raise exception 'GAME_MAX_WINS' using errcode='P0403'; end if;
  if c.win_cooldown_hours>0 and exists(select 1 from public.game_reward_grants where user_id=auth.uid() and campaign_id=c.id and created_at>now()-make_interval(hours=>c.win_cooldown_hours)) then raise exception 'GAME_REWARD_COOLDOWN' using errcode='P0403'; end if;
  if p_mode = 'free' then
   select max(started_at) into last_free from public.game_sessions where user_id = auth.uid() and game_key = p_game_key and entry_mode = 'free';
   if last_free + make_interval(hours=>cfg.free_interval_hours) > now() then raise exception 'GAME_FREE_COOLDOWN' using errcode = 'P0403'; end if;
  elsif private.sun_coin_balance(auth.uid()) < cfg.attempt_cost then raise exception 'COIN_INSUFFICIENT_BALANCE' using errcode = 'P0403'; end if;
 end if;
 insert into public.game_sessions(campaign_id, user_id, client_id, workspace_id, eligible, guaranteed, game_key, start_request,
  attempt_limit, target_snapshot, reward_eligible, reward_reason, entry_mode, pro_reward_eligible, coin_campaign_id, coin_reward_eligible, reward_campaign_id)
 values (null, auth.uid(), client, private.client_workspace_id(client), false, false, p_game_key, p_request, 10, 10,
  p_mode <> 'practice', case when p_mode = 'practice' then 'PRACTICE' end, p_mode, false, null, false, c.id) returning * into s;
 if p_mode = 'paid' then
  insert into public.sun_coin_ledger(user_id, amount, type, source, reference_id, game_session_id, metadata)
  values (auth.uid(), -cfg.attempt_cost, 'GAME_SPEND', 'SAFI_PENALTY_REWARD_ATTEMPT', s.id, s.id, jsonb_build_object('gameId', p_game_key, 'gameSessionId', s.id, 'requestId', p_request));
 end if;
 return private.center_session_json(s);
end $$;

create or replace function public.get_sun_coin_wallet(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare last_free timestamptz; active public.game_sessions; c public.game_reward_campaigns; cfg public.safi_runtime_config;
begin
 perform private.require_game_client();
 select max(started_at) into last_free from public.game_sessions where user_id = auth.uid() and game_key = 'safi-penalty' and entry_mode = 'free';
 select * into active from public.game_sessions where user_id = auth.uid() and game_key = 'safi-penalty' and status = 'playing' and expires_at > now()
  order by started_at desc limit 1;
 select * into cfg from public.safi_runtime_config where game_key='safi-penalty';
 c := private.game_reward_live_campaign('safi-penalty');
 return jsonb_build_object('balance', private.sun_coin_balance(auth.uid()), 'serverNow', clock_timestamp(),
  'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'userId', l.user_id, 'amount', l.amount, 'type', l.type,
    'source', l.source, 'referenceId', l.reference_id, 'createdAt', l.created_at, 'metadata', l.metadata) order by l.created_at desc)
   from (select * from public.sun_coin_ledger where user_id = auth.uid() order by created_at desc, id desc limit greatest(1, least(coalesce(p_limit, 30), 100))) l), '[]'::jsonb),
  'attempt', jsonb_build_object('gameId', 'safi-penalty', 'freeAvailable', last_free is null or last_free + make_interval(hours=>cfg.free_interval_hours) <= now(),
   'nextFreeAt', case when last_free + make_interval(hours=>cfg.free_interval_hours) > now() then last_free + make_interval(hours=>cfg.free_interval_hours) end, 'cost', cfg.attempt_cost,
   'activeSession', case when active.id is not null then private.center_session_json(active) end),
  'campaignAvailable', c.id is not null and cfg.enabled and cfg.reward_enabled
   and (c.max_wins_per_user is null or (select count(*) from public.game_reward_grants where user_id=auth.uid() and campaign_id=c.id)<c.max_wins_per_user)
   and (c.win_cooldown_hours=0 or not exists(select 1 from public.game_reward_grants where user_id=auth.uid() and campaign_id=c.id and created_at>now()-make_interval(hours=>c.win_cooldown_hours))),
  'rewardKinds', coalesce((select jsonb_agg(distinct r.reward_type) from public.game_reward_rules r
   where r.campaign_id = c.id and r.enabled and (r.quantity is null or r.awarded < r.quantity)), '[]'::jsonb),
  -- Kept empty for app builds that still read these keys.
  'campaign', null, 'proCampaign', null,
  'pendingPurchase', (select private.sun_coin_request_json(q) from public.sun_coin_purchase_requests q where q.user_id = auth.uid() and q.status = 'pending'));
end $$;

create or replace function public.game_center_shoot(p_session uuid, p_request uuid, p_n integer, p_zone integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.game_sessions; v_a public.game_attempts; v_keeper int; v_goal boolean; v_response jsonb; v_level integer;
begin
 perform private.require_game_client();
 if p_zone is null or p_zone not between 1 and 15 or p_request is null or p_n is null then
   raise exception 'GAME_INVALID_SHOT' using errcode = '22023'; end if;
 select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() and game_key = 'safi-penalty' for update;
 if not found or not (v_s.client_id = any(private.member_client_ids())) then
   raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 select * into v_a from public.game_attempts where session_id = p_session and request_id = p_request;
 if found then
   if v_a.n <> p_n or v_a.zone <> p_zone - 1 then raise exception 'GAME_REQUEST_CONFLICT' using errcode = '22023'; end if;
   return v_a.response;
 end if;
 if v_s.status <> 'playing' or v_s.expires_at <= now() then raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 if v_s.attempts_used >= v_s.attempt_limit then raise exception 'GAME_NO_ATTEMPTS_LEFT' using errcode = 'P0403'; end if;
 if p_n <> v_s.attempts_used + 1 then raise exception 'GAME_ATTEMPT_CLOSED' using errcode = 'P0403'; end if;
 -- Judged only after the player's zone is committed to this transaction; nothing predictive is ever returned.
 v_level := coalesce(v_s.reach_snapshot, 0);
 select j.goal, j.keeper into v_goal, v_keeper from private.game_center_judge(v_level, p_zone, p_n, v_s.score) j;
 v_response := jsonb_build_object('attemptId', p_request, 'sessionId', p_session, 'attempt', p_n,
   'selectedZone', p_zone, 'goalkeeperZone', v_keeper, 'result', case when v_goal then 'GOAL' else 'CATCH' end,
   'score', v_s.score + case when v_goal then 1 else 0 end, 'attempts', v_s.attempt_limit,
   'visualEvent',case when random()<(select lucky_chance from public.safi_runtime_config where game_key=v_s.game_key) then 'LUCKY_EGG' else null end);
 insert into public.game_attempts(session_id, n, params, zone, submitted_at, hit, valid, request_id, response)
 values(p_session, p_n, jsonb_build_object('keeper', v_keeper - 1, 'level', v_level, 'goalChance', private.game_center_goal_chance(v_level, p_n, v_s.score)),
   p_zone - 1, clock_timestamp(), v_goal, true, p_request, v_response);
 update public.game_sessions set attempts_used = p_n, score = (v_response->>'score')::int where id = p_session;
 return v_response;
end $$;

create or replace function private.game_center_finish_rewards(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions; c public.game_reward_campaigns; r public.game_reward_rules; sub public.workspace_subscriptions;
 v_score int; v_reward jsonb; v_coins int := 0; response jsonb;
begin
 perform private.require_game_client();
 -- Lock order user → session → campaign → rule → ledger, as in every other reward path.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 731));
 select * into s from public.game_sessions where id = p_session and user_id = auth.uid() and game_key = 'safi-penalty' for update;
 if not found or not (s.client_id = any(private.member_client_ids())) then raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 if s.finish_response is not null then return s.finish_response; end if;
 if s.status <> 'playing' or s.expires_at <= now() then raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 if s.attempts_used <> s.attempt_limit then raise exception 'GAME_INCOMPLETE' using errcode = 'P0403'; end if;
 select count(*) filter (where hit and valid) into v_score from public.game_attempts where session_id = p_session;
 if s.entry_mode in ('free', 'paid') and s.reward_eligible and s.reward_campaign_id is not null then
  select * into c from public.game_reward_campaigns where id = s.reward_campaign_id for update;
  if c.status = 'active' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
   and (c.max_wins_per_user is null or (select count(*) from public.game_reward_grants where campaign_id=c.id and user_id=s.user_id)<c.max_wins_per_user)
   and (c.win_cooldown_hours=0 or not exists(select 1 from public.game_reward_grants where campaign_id=c.id and user_id=s.user_id and created_at>now()-make_interval(hours=>c.win_cooldown_hours))) then
   select * into r from public.game_reward_rules where campaign_id = c.id and enabled and score <= v_score
    and (quantity is null or awarded < quantity) order by score desc limit 1 for update;
   if r.id is not null then
    update public.game_reward_rules set awarded = awarded + 1 where id = r.id;
    if r.reward_type = 'SUN_COIN' then
     v_coins := r.amount;
     insert into public.sun_coin_ledger(user_id, amount, type, source, reference_id, game_session_id, reward_rule_id, metadata)
     values (s.user_id, r.amount, 'GAME_REWARD', 'SAFI_PENALTY', s.id, s.id, r.id,
      jsonb_build_object('gameId', s.game_key, 'gameSessionId', s.id, 'score', v_score));
    else
     sub := private.extend_workspace_plan(s.workspace_id, 'pro', r.amount, 'game', 'SAFI Penalty: ' || c.title);
     perform private.notify(array[s.user_id], 'game.reward', r.amount || ' kunlik SUN MEDIA Pro yutdingiz!',
      'SAFI Penalty: ' || to_char(sub.ends_at at time zone private.agency_timezone(), 'DD.MM.YYYY') || ' gacha amal qiladi.',
      jsonb_build_object('route', '/account'), 'game_sessions', s.id, s.client_id, 'normal', true);
    end if;
    insert into public.game_reward_grants(session_id, user_id, campaign_id, rule_id, score, reward_type, amount, subscription_id, ends_at)
    values (s.id, s.user_id, c.id, r.id, v_score, r.reward_type, r.amount, sub.id, sub.ends_at);
    v_reward := jsonb_build_object('type', r.reward_type, 'amount', r.amount, 'endsAt', sub.ends_at);
   end if;
  end if;
 end if;
 response := jsonb_build_object('score', v_score, 'attempts', s.attempt_limit, 'boxes', false, 'flagged', false,
  'reward', v_reward, 'coinAmount', v_coins, 'coinBalance', private.sun_coin_balance(s.user_id));
 update public.game_sessions set status = 'finished', score = v_score, finished_at = clock_timestamp(), won = v_reward is not null,
  finish_response = response where id = p_session;
 return response;
end $$;

create or replace function public.get_game_engagement(p_game_key text default 'safi-penalty') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare st public.game_player_stats; v_day date:=private.agency_today(); challenges jsonb; achievements jsonb; zones jsonb;
begin
 perform private.require_game_client();
 if p_game_key is distinct from 'safi-penalty' then raise exception 'GAME_NOT_AVAILABLE' using errcode='22023'; end if;
 select * into st from public.game_player_stats where user_id=auth.uid() and game_key=p_game_key;
 select jsonb_agg(jsonb_build_object('zone',z,'shots',coalesce(st.zone_shots[z],0),'goals',coalesce(st.zone_goals[z],0),
 'saves',coalesce(st.zone_shots[z]-st.zone_goals[z],0)) order by z) into zones from generate_series(1,15) z;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'description',d.description,'metric',d.metric,
 'target',d.target,'progress',coalesce(p.progress,0),'completed',p.completed_at is not null,'rewardCoins',d.reward_coins,
 'coinsAwarded',coalesce(p.coins_awarded,0),'dayKey',v_day) order by d.created_at,d.code),'[]'::jsonb) into challenges
 from public.game_engagement_definitions d left join public.game_engagement_progress p on p.definition_id=d.id and p.user_id=auth.uid() and p.period_date=v_day
 where d.game_key=p_game_key and d.kind='challenge' and d.enabled and d.starts_at<=now() and (d.ends_at is null or d.ends_at>now());
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'description',d.description,
 'target',d.target,'progress',coalesce(p.progress,0),'unlocked',p.completed_at is not null,'unlockedAt',p.completed_at,
 'rewardCoins',d.reward_coins,'coinsAwarded',coalesce(p.coins_awarded,0)) order by d.created_at,d.code),'[]'::jsonb) into achievements
 from public.game_engagement_definitions d left join public.game_engagement_progress p on p.definition_id=d.id and p.user_id=auth.uid() and p.period_date=date '1970-01-01'
 where d.game_key=p_game_key and d.kind='achievement' and ((d.enabled and d.starts_at<=now() and (d.ends_at is null or d.ends_at>now())) or p.completed_at is not null);
 return jsonb_build_object('serverNow',now(),'dayKey',v_day,'timezone',private.agency_timezone(),
 'stats',jsonb_build_object('gamesPlayed',coalesce(st.games_played,0),'goals',coalesce(st.goals,0),'savesFaced',coalesce(st.saves_faced,0),
 'shots',coalesce(st.shots,0),'personalBest',coalesce(st.personal_best,0),'longestCombo',coalesce(st.longest_combo,0),
 'practiceRounds',(select count(*) from public.game_round_stats where user_id=auth.uid() and game_key=p_game_key and mode='practice'),
 'rewardRounds',(select count(*) from public.game_round_stats where user_id=auth.uid() and game_key=p_game_key and mode in ('free','paid')),
 'averageScore',(select round(avg(score),2) from public.game_round_stats where user_id=auth.uid() and game_key=p_game_key),
 'recentPerformance',coalesce((select jsonb_agg(jsonb_build_object('score',r.score,'mode',r.mode,'completedAt',r.completed_at) order by r.completed_at desc) from (select score,mode,completed_at from public.game_round_stats where user_id=auth.uid() and game_key=p_game_key order by completed_at desc limit 10)r),'[]'::jsonb),
 'favoriteZone',(select z from generate_series(1,15) z where st.zone_shots[z]>0 order by st.zone_shots[z] desc,z limit 1),'zones',zones),
 'streak',jsonb_build_object('current',case when st.last_played_date>=v_day-1 then st.current_streak else 0 end,
 'longest',coalesce(st.longest_streak,0),'lastPlayedDate',st.last_played_date),'challenges',challenges,'achievements',achievements);
end $$;

alter table public.game_engagement_definitions drop constraint game_engagement_definitions_metric_check;
alter table public.game_engagement_definitions add constraint game_engagement_definitions_metric_check check(metric in ('GOALS_TOTAL','ROUND_GOALS','GOAL_COMBO','CORNER_GOALS','DISTINCT_ZONES','GOAL_AFTER_SAVES','PRACTICE_ROUNDS','SHOTS_TOTAL','SAVES_TOTAL','COMPLETED_ROUNDS','ALL_CORNERS','STREAK_DAYS','LUCKY_EGGS'));


create or replace function private.game_engagement_metric(p_user uuid,d public.game_engagement_definitions,p_day date) returns bigint
language plpgsql stable set search_path='' as $$
declare result bigint; next_day date; k date;
begin
 if d.metric='LUCKY_EGGS' then
  return (select count(*) from public.game_attempts a join public.game_round_stats r on r.session_id=a.session_id
   where r.user_id=p_user and r.game_key=d.game_key and a.valid and a.response->>'visualEvent'='LUCKY_EGG'
   and (d.kind='achievement' or r.day_key=p_day) and (d.reward_coins=0 or r.mode in ('free','paid')));
 end if;
 if d.metric='STREAK_DAYS' then
  result:=0; next_day:=p_day;
  for k in select distinct day_key from public.game_round_stats where user_id=p_user and game_key=d.game_key
   and (d.reward_coins=0 or mode in ('free','paid')) and day_key<=p_day order by day_key desc loop
   if k=next_day then result:=result+1; next_day:=next_day-1; else exit; end if;
  end loop;
  return result;
 end if;
 select case d.metric
  when 'GOALS_TOTAL' then coalesce(sum(score),0)
  when 'ROUND_GOALS' then coalesce(max(score),0)
  when 'GOAL_COMBO' then coalesce(max(longest_combo),0)
  when 'CORNER_GOALS' then coalesce(sum(corner_goals),0)
  when 'DISTINCT_ZONES' then bit_count(coalesce(bit_or(goal_zone_mask),0)::bit(15))
  when 'GOAL_AFTER_SAVES' then coalesce(sum(goals_after_saves),0)
  when 'PRACTICE_ROUNDS' then count(*) filter(where mode='practice')
  when 'SHOTS_TOTAL' then coalesce(sum(shots),0)
  when 'SAVES_TOTAL' then coalesce(sum(saves),0)
  when 'COMPLETED_ROUNDS' then count(*)
  when 'ALL_CORNERS' then bit_count(coalesce(bit_or(corner_mask),0)::bit(4))
  else 0 end into result
 from public.game_round_stats where user_id=p_user and game_key=d.game_key
  and (d.kind='achievement' or day_key=p_day) and (d.reward_coins=0 or mode in ('free','paid'))
  and ((d.kind='achievement' and d.reward_coins=0) or completed_at>=d.starts_at);
 return result;
end $$;

insert into public.game_engagement_definitions(game_key,kind,code,title,description,metric,target) values('safi-penalty','achievement','lucky_egg','Lucky Egg','Oltin tuxum bilan raundni yakunlang.','LUCKY_EGGS',1);

-- Presentation and cosmetic inventory never enter the shot judge or its probability.
create table public.safi_cosmetics (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[a-z][a-z0-9_]{1,63}$'),
 title text not null check(char_length(title) between 1 and 100),
 slot text not null check(slot in ('gloves','outfit','arena','trail','goal_effect','nameplate','badge')),
 price integer not null default 0 check(price between 0 and 100000), enabled boolean not null default true,
 appearance jsonb not null default '{}', check(jsonb_typeof(appearance)='object')
);
-- Cosmetic debits carry their own audited item reference; round debits still require a session.
alter table public.sun_coin_ledger add column cosmetic_item_id uuid references public.safi_cosmetics(id);
alter table public.sun_coin_ledger drop constraint sun_coin_ledger_check2;
alter table public.sun_coin_ledger add constraint sun_coin_ledger_spend_reference check(type<>'GAME_SPEND'
 or (game_session_id is not null and cosmetic_item_id is null)
 or (source='GAME_COSMETIC' and game_session_id is null and cosmetic_item_id is not null));

create table public.safi_inventory (
 user_id uuid not null references public.profiles(id), item_id uuid not null references public.safi_cosmetics(id),
 purchased_at timestamptz not null default now(), request_id uuid not null,
 primary key(user_id,item_id), unique(user_id,request_id)
);
create table public.safi_equipment (
 user_id uuid not null references public.profiles(id), slot text not null, item_id uuid not null references public.safi_cosmetics(id),
 primary key(user_id,slot), foreign key(user_id,item_id) references public.safi_inventory(user_id,item_id)
);
create table public.safi_player_identity (
 user_id uuid primary key references public.profiles(id), nickname text not null check(char_length(nickname) between 2 and 24),
 public_id uuid not null unique default gen_random_uuid(), listed boolean not null default false
);
alter table public.safi_cosmetics enable row level security;
alter table public.safi_inventory enable row level security;
alter table public.safi_equipment enable row level security;
alter table public.safi_player_identity enable row level security;
revoke all on public.safi_cosmetics,public.safi_inventory,public.safi_equipment,public.safi_player_identity from public,anon,authenticated;
grant select on public.safi_cosmetics,public.safi_inventory,public.safi_equipment,public.safi_player_identity to authenticated;
create policy "clients read available cosmetics" on public.safi_cosmetics for select to authenticated using(enabled);
create policy "players read own inventory" on public.safi_inventory for select to authenticated using(user_id=(select auth.uid()));
create policy "players read own equipment" on public.safi_equipment for select to authenticated using(user_id=(select auth.uid()));
create policy "players read own leaderboard identity" on public.safi_player_identity for select to authenticated using(user_id=(select auth.uid()));

insert into public.safi_cosmetics(code,title,slot,price,appearance) values
 ('classic_gloves','SAFI Classic','gloves',0,'{"color":"#70BC22"}'),
 ('ice_gloves','Ice Grip','gloves',15,'{"color":"#72C8DF"}'),
 ('sunset_gloves','Sunset Grip','gloves',15,'{"color":"#EF9B47"}'),
 ('classic_kit','SAFI Classic','outfit',0,'{"color":"#70BC22"}'),
 ('midnight_kit','Midnight Kit','outfit',20,'{"color":"#52658B"}'),
 ('night_stadium','Night Stadium','arena',20,'{"arena":"night"}'),
 ('summer_stadium','Summer Arena','arena',20,'{"arena":"summer"}'),
 ('gold_trail','Golden Trail','trail',10,'{"color":"#F5C75E"}'),
 ('ice_goal','Ice Spark','goal_effect',10,'{"color":"#72C8DF"}'),
 ('gold_nameplate','Gold Nameplate','nameplate',10,'{"color":"#F5C75E"}'),
 ('star_badge','Star Badge','badge',10,'{"symbol":"star","color":"#F5C75E"}');

create function public.get_safi_locker() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_game_client();
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'title',c.title,'slot',c.slot,
  'price',c.price,'appearance',c.appearance,'owned',i.item_id is not null,'equipped',e.item_id is not null) order by c.slot,c.price,c.code)
  from public.safi_cosmetics c left join public.safi_inventory i on i.item_id=c.id and i.user_id=auth.uid()
  left join public.safi_equipment e on e.item_id=c.id and e.user_id=auth.uid() where c.enabled or i.item_id is not null),'[]'::jsonb),
  'balance',private.sun_coin_balance(auth.uid()),'identity',(select jsonb_build_object('nickname',nickname,'listed',listed) from public.safi_player_identity where user_id=auth.uid()));
end $$;
create function public.purchase_safi_cosmetic(p_item uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.safi_cosmetics; i public.safi_inventory;
begin
 perform private.require_game_client();
 if p_request is null then raise exception 'GAME_INVALID_SHOT' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
 select * into i from public.safi_inventory where user_id=auth.uid() and request_id=p_request;
 if found and i.item_id<>p_item then raise exception 'GAME_REQUEST_CONFLICT' using errcode='22023'; end if;
 if exists(select 1 from public.safi_inventory where user_id=auth.uid() and item_id=p_item) then return public.get_safi_locker(); end if;
 select * into c from public.safi_cosmetics where id=p_item and enabled for share;
 if not found then raise exception 'GAME_COSMETIC_UNAVAILABLE' using errcode='P0403'; end if;
 if private.sun_coin_balance(auth.uid())<c.price then raise exception 'COIN_INSUFFICIENT_BALANCE' using errcode='P0403'; end if;
 insert into public.safi_inventory(user_id,item_id,request_id) values(auth.uid(),c.id,p_request);
 if c.price>0 then
  insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,cosmetic_item_id,metadata)
  values(auth.uid(),-c.price,'GAME_SPEND','GAME_COSMETIC',p_request,c.id,jsonb_build_object('gameId','safi-penalty','itemId',c.id));
 end if;
 return public.get_safi_locker();
end $$;
create function public.equip_safi_cosmetic(p_item uuid,p_slot text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.safi_cosmetics;
begin
 perform private.require_game_client();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
 if p_slot is null or p_slot not in ('gloves','outfit','arena','trail','goal_effect','nameplate','badge') then raise exception 'GAME_COSMETIC_UNAVAILABLE' using errcode='22023'; end if;
 if p_item is null then delete from public.safi_equipment where user_id=auth.uid() and slot=p_slot;
 else
  select * into c from public.safi_cosmetics where id=p_item and slot=p_slot and enabled;
  if not found or not exists(select 1 from public.safi_inventory where user_id=auth.uid() and item_id=p_item) then
   raise exception 'GAME_COSMETIC_NOT_OWNED' using errcode='P0403'; end if;
  insert into public.safi_equipment(user_id,slot,item_id) values(auth.uid(),p_slot,p_item)
   on conflict(user_id,slot) do update set item_id=excluded.item_id;
 end if;
 return public.get_safi_locker();
end $$;
create function public.set_safi_identity(p_nickname text,p_listed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_game_client();
 -- Nicknames are deliberately separate from account name/email/phone. No links or phone-like numbers.
 if p_nickname is null or p_listed is null or char_length(trim(p_nickname)) not between 2 and 24
  or p_nickname !~ '^[[:alpha:][:digit:] _-]+$' or p_nickname ~ '[0-9]{4}' then
  raise exception 'GAME_INVALID_NICKNAME' using errcode='22023'; end if;
 insert into public.safi_player_identity(user_id,nickname,listed) values(auth.uid(),trim(p_nickname),p_listed)
  on conflict(user_id) do update set nickname=excluded.nickname,listed=excluded.listed;
 return public.get_safi_locker();
end $$;
create function public.get_safi_leaderboard(p_period text default 'daily') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date; c public.safi_runtime_config;
begin
 perform private.require_game_client();
 if p_period is null or p_period not in ('daily','weekly') then raise exception 'GAME_INVALID_PERIOD' using errcode='22023'; end if;
 select * into c from public.safi_runtime_config where game_key='safi-penalty';
 first_day:=case when p_period='daily' then private.agency_today() else date_trunc('week',private.agency_today()::timestamp)::date end;
 return jsonb_build_object('period',p_period,'dayKey',private.agency_today(),'enabled',c.leaderboards_enabled,
 'entries',case when not c.leaderboards_enabled then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
 'rank',x.ranking,'playerId',x.public_id,'nickname',x.nickname,'avatar',null,'bestScore',x.best,'goals',x.goals,'rounds',x.rounds,'isMe',x.user_id=auth.uid()) order by x.ranking)
 from(select row_number() over(order by max(r.score) desc,sum(r.score) desc,count(*) desc,i.public_id)ranking,
 i.public_id,i.nickname,i.user_id,max(r.score)best,sum(r.score)goals,count(*)rounds
 from public.game_round_stats r join public.safi_player_identity i on i.user_id=r.user_id and i.listed
 where r.game_key='safi-penalty' and r.day_key between first_day and private.agency_today()
 group by i.public_id,i.nickname,i.user_id order by best desc,goals desc,rounds desc,i.public_id limit 50)x),'[]'::jsonb) end);
end $$;

create function public.get_safi_public_config() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_game_client();
 return (select jsonb_build_object('enabled',enabled,'practiceEnabled',practice_enabled,'rewardEnabled',reward_enabled,'leaderboardsEnabled',leaderboards_enabled)
  from public.safi_runtime_config where game_key='safi-penalty');
end $$;
create function public.get_safi_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 return jsonb_build_object('config',(select to_jsonb(c) from public.safi_runtime_config c where game_key='safi-penalty'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at desc) from public.safi_events e),'[]'::jsonb),
 'cosmetics',coalesce((select jsonb_agg(to_jsonb(c) order by c.slot,c.code) from public.safi_cosmetics c),'[]'::jsonb),
 'campaignLimits',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'maxWins',max_wins_per_user,'cooldownHours',win_cooldown_hours)) from public.game_reward_campaigns),'[]'::jsonb),
 'analytics',jsonb_build_object(
 'scoreDistribution',(select jsonb_agg(jsonb_build_object('score',g,'rounds',(select count(*) from public.game_round_stats where score=g))) from generate_series(0,10)g),
 'zoneHeatmap',(select jsonb_agg(jsonb_build_object('zone',z,'shots',coalesce((select sum(zone_shots[z]) from public.game_round_stats),0),'goals',coalesce((select sum(zone_goals[z]) from public.game_round_stats),0))) from generate_series(1,15)z),
 'returningPlayers',(select count(*) from(select user_id from public.game_round_stats group by user_id having count(distinct day_key)>1)x),
 'retentionDay1',(select round(100.0*count(*) filter(where exists(select 1 from public.game_round_stats r where r.user_id=x.user_id and r.day_key=x.first_day+1))/nullif(count(*),0),2) from(select user_id,min(day_key)first_day from public.game_round_stats group by user_id having min(day_key)<private.agency_today())x),
 'mostPopularCosmetic',(select jsonb_build_object('title',c.title,'purchases',count(*)) from public.safi_inventory i join public.safi_cosmetics c on c.id=i.item_id group by c.id,c.title order by count(*) desc,c.id limit 1),
 'campaignDistributed',(select count(*) from public.game_reward_grants),
 'remainingRewardPool',(select coalesce(jsonb_agg(jsonb_build_object('campaignId',c.id,'title',c.title,'rules',(select jsonb_agg(jsonb_build_object('type',r.reward_type,'amount',r.amount,'remaining',case when r.quantity is null then null else r.quantity-r.awarded end)) from public.game_reward_rules r where campaign_id=c.id and enabled))),'[]'::jsonb) from public.game_reward_campaigns c where c.status='active')));
end $$;
create function public.configure_safi(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'GAME_INVALID_CONFIG' using errcode='22023'; end if;
 update public.safi_runtime_config set enabled=(p_config->>'enabled')::boolean,practice_enabled=(p_config->>'practice_enabled')::boolean,
  reward_enabled=(p_config->>'reward_enabled')::boolean,leaderboards_enabled=(p_config->>'leaderboards_enabled')::boolean,
  free_interval_hours=(p_config->>'free_interval_hours')::integer,attempt_cost=(p_config->>'attempt_cost')::integer,
  lucky_chance=(p_config->>'lucky_chance')::numeric,personality=p_config->>'personality',arena=p_config->>'arena',updated_at=clock_timestamp()
  where game_key='safi-penalty';
 return public.get_safi_admin();
 exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'GAME_INVALID_CONFIG' using errcode='22023';
end $$;
create function public.save_safi_event(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=coalesce((p_config->>'id')::uuid,gen_random_uuid());
begin
 perform private.require_coin_manager();
 insert into public.safi_events(id,title,enabled,starts_at,ends_at,boss,arena,personality)
 values(eid,p_config->>'title',(p_config->>'enabled')::boolean,(p_config->>'starts_at')::timestamptz,(p_config->>'ends_at')::timestamptz,
 (p_config->>'boss')::boolean,p_config->>'arena',p_config->>'personality')
 on conflict(id) do update set title=excluded.title,enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
 boss=excluded.boss,arena=excluded.arena,personality=excluded.personality;
 return public.get_safi_admin();
end $$;
create function public.save_safi_cosmetic(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid:=coalesce((p_config->>'id')::uuid,gen_random_uuid()); a jsonb:=p_config->'appearance';
begin
 perform private.require_coin_manager();
 if p_config->>'code' is null or p_config->>'code' !~ '^[a-z][a-z0-9_]{1,63}$'
  or a is null or jsonb_typeof(a)<>'object' or a-'color'-'arena'-'symbol'<>'{}'::jsonb
  or (a ? 'color' and (jsonb_typeof(a->'color') is distinct from 'string' or a->>'color' !~ '^#[0-9A-Fa-f]{6}$'))
  or (a ? 'arena' and (jsonb_typeof(a->'arena') is distinct from 'string' or a->>'arena' not in ('classic','night','summer','new_year','ramadan','campaign')))
  or (a ? 'symbol' and (jsonb_typeof(a->'symbol') is distinct from 'string' or a->>'symbol' not in ('star','shield','egg'))) then raise exception 'GAME_INVALID_CONFIG' using errcode='22023'; end if;
 insert into public.safi_cosmetics(id,code,title,slot,price,enabled,appearance)
 values(cid,p_config->>'code',p_config->>'title',p_config->>'slot',(p_config->>'price')::integer,(p_config->>'enabled')::boolean,a)
 on conflict(id) do update set title=excluded.title,price=excluded.price,enabled=excluded.enabled,appearance=excluded.appearance;
 return public.get_safi_admin();
end $$;
create function public.set_safi_campaign_limits(p_campaign uuid,p_max_wins integer,p_cooldown_hours integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 update public.game_reward_campaigns set max_wins_per_user=p_max_wins,win_cooldown_hours=p_cooldown_hours where id=p_campaign;
 if not found then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode='22023'; end if;
 return public.get_safi_admin();
end $$;

revoke all on function private.safi_snapshot() from public,anon,authenticated;
revoke all on function public.get_safi_locker(),public.purchase_safi_cosmetic(uuid,uuid),public.equip_safi_cosmetic(uuid,text),
 public.set_safi_identity(text,boolean),public.get_safi_leaderboard(text),public.get_safi_public_config(),public.get_safi_admin(),public.configure_safi(jsonb),
 public.save_safi_event(jsonb),public.save_safi_cosmetic(jsonb),public.set_safi_campaign_limits(uuid,integer,integer) from public,anon;
grant execute on function public.get_safi_locker(),public.purchase_safi_cosmetic(uuid,uuid),public.equip_safi_cosmetic(uuid,text),
 public.set_safi_identity(text,boolean),public.get_safi_leaderboard(text),public.get_safi_public_config(),public.get_safi_admin(),public.configure_safi(jsonb),
 public.save_safi_event(jsonb),public.save_safi_cosmetic(jsonb),public.set_safi_campaign_limits(uuid,integer,integer) to authenticated;

-- Enrich the cached finish from server aggregates, including restored rounds.
create or replace function public.game_center_finish(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare response jsonb; events jsonb;
begin
 response:=private.game_center_finish_rewards(p_session);
 if response ? 'engagement' then return response; end if;
 events:=private.record_game_engagement(p_session,true);
 events:=events||jsonb_build_object('personalBest',(select personal_best from public.game_player_stats where user_id=auth.uid() and game_key='safi-penalty'),
  'longestCombo',(select longest_combo from public.game_round_stats where session_id=p_session));
 response:=response||jsonb_build_object('engagement',events,'coinBalance',private.sun_coin_balance(auth.uid()));
 update public.game_sessions set finish_response=response where id=p_session and user_id=auth.uid();
 return response;
end $$;

create or replace function public.get_game_engagement_admin(p_game_key text default 'safi-penalty') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 if p_game_key is distinct from 'safi-penalty' then raise exception 'GAME_NOT_AVAILABLE' using errcode='22023'; end if;
 return jsonb_build_object('gameId',p_game_key,'dailyCoinCap',(select daily_coin_cap from public.game_engagement_settings where game_key=p_game_key),
 'definitions',coalesce((select jsonb_agg(private.game_engagement_definition_json(d) order by d.kind,d.created_at,d.code) from public.game_engagement_definitions d where game_key=p_game_key),'[]'::jsonb),
 'analytics',jsonb_build_object('gamesPlayed',(select count(*) from public.game_round_stats where game_key=p_game_key),
 'dailyActivePlayers',(select count(distinct user_id) from public.game_round_stats where game_key=p_game_key and day_key=private.agency_today()),
 'practiceRounds',(select count(*) from public.game_round_stats where game_key=p_game_key and mode='practice'),
 'rewardRounds',(select count(*) from public.game_round_stats where game_key=p_game_key and mode in ('free','paid')),
 'averageScore',(select round(avg(score),2) from public.game_round_stats where game_key=p_game_key),
 'activeStreaks',(select count(*) from public.game_player_stats where game_key=p_game_key and last_played_date>=private.agency_today()-1),
 'longestStreak',(select coalesce(max(longest_streak),0) from public.game_player_stats where game_key=p_game_key),
 'challengeCompletions',(select count(*) from public.game_engagement_progress p join public.game_engagement_definitions d on d.id=p.definition_id where d.game_key=p_game_key and d.kind='challenge' and p.completed_at is not null),
 'achievementUnlocks',(select count(*) from public.game_engagement_progress p join public.game_engagement_definitions d on d.id=p.definition_id where d.game_key=p_game_key and d.kind='achievement' and p.completed_at is not null),
 'coinsAwarded',(select coalesce(sum(coins_awarded),0) from public.game_engagement_daily_budget where game_key=p_game_key),
 'coinsSpent',(select -coalesce(sum(amount),0) from public.sun_coin_ledger where type='GAME_SPEND' and metadata->>'gameId'=p_game_key)));
end $$;

create index safi_inventory_item_idx on public.safi_inventory(item_id);
create index safi_equipment_item_idx on public.safi_equipment(item_id);
create index sun_coin_ledger_cosmetic_idx on public.sun_coin_ledger(cosmetic_item_id) where cosmetic_item_id is not null;
create index game_reward_grants_user_campaign_idx on public.game_reward_grants(user_id,campaign_id,created_at desc);
create index game_round_stats_leaderboard_idx on public.game_round_stats(game_key,day_key,user_id);
