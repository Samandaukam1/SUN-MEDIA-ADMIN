-- Game Center Phase 1: completed-round progress, daily challenges, badges and streaks.
-- Gameplay and campaign payouts remain in the existing finish routine. Engagement
-- uses only its persisted, server-validated results. Default engagement issuance = 0.
create table public.game_engagement_settings (
 game_key text primary key check(game_key ~ '^[a-z][a-z0-9-]{1,63}$'),
 daily_coin_cap integer not null default 0 check(daily_coin_cap between 0 and 100000),
 updated_at timestamptz not null default now()
);
insert into public.game_engagement_settings(game_key) values('safi-penalty');
create table public.game_player_stats (
 user_id uuid not null references public.profiles(id), game_key text not null,
 games_played bigint not null default 0, goals bigint not null default 0, saves_faced bigint not null default 0,
 shots bigint not null default 0, personal_best smallint not null default 0, longest_combo smallint not null default 0,
 zone_shots bigint[] not null default array_fill(0::bigint,array[15]),
 zone_goals bigint[] not null default array_fill(0::bigint,array[15]),
 current_streak integer not null default 0, longest_streak integer not null default 0,
 last_played_date date, updated_at timestamptz not null default now(),
 primary key(user_id,game_key)
);
create table public.game_round_stats (
 session_id uuid primary key, user_id uuid not null references public.profiles(id), game_key text not null,
 mode text not null, completed_at timestamptz not null, day_key date not null,
 score smallint not null, shots smallint not null, saves smallint not null, longest_combo smallint not null,
 corner_goals smallint not null, goal_zone_mask integer not null, corner_mask integer not null,
 goals_after_saves smallint not null,
 zone_shots bigint[] not null, zone_goals bigint[] not null,
 events jsonb not null default '{}'
);
create index game_round_stats_player_day_idx on public.game_round_stats(user_id,game_key,day_key);
create index game_round_stats_game_day_idx on public.game_round_stats(game_key,day_key);
create table public.game_engagement_definitions (
 id uuid primary key default gen_random_uuid(), game_key text not null references public.game_engagement_settings(game_key),
 kind text not null check(kind in ('challenge','achievement')),
 code text not null check(code ~ '^[a-z][a-z0-9_]{1,63}$'),
 title text not null check(char_length(title) between 1 and 100),
 description text not null default '' check(char_length(description)<=300),
 metric text not null check(metric in ('GOALS_TOTAL','ROUND_GOALS','GOAL_COMBO','CORNER_GOALS','DISTINCT_ZONES','GOAL_AFTER_SAVES','PRACTICE_ROUNDS','SHOTS_TOTAL','SAVES_TOTAL','COMPLETED_ROUNDS','ALL_CORNERS','STREAK_DAYS')),
 target integer not null check(target between 1 and 100000),
 reward_coins integer not null default 0 check(reward_coins between 0 and 1000),
 daily_reward_limit integer not null default 0 check(daily_reward_limit between 0 and 10000),
 enabled boolean not null default true, starts_at timestamptz not null default now(), ends_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(game_key,kind,code),
 check(ends_at is null or ends_at>starts_at),
 check(reward_coins=0 or (daily_reward_limit>0 and metric<>'PRACTICE_ROUNDS')),
 check(metric not in ('ROUND_GOALS','GOAL_COMBO') or target<=10),
 check(metric<>'DISTINCT_ZONES' or target<=15), check(metric<>'ALL_CORNERS' or target<=4)
);
create table public.game_engagement_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 definition_id uuid not null references public.game_engagement_definitions(id),
 period_date date not null, -- local day for challenges; 1970-01-01 for lifetime achievements
 progress bigint not null default 0 check(progress>=0),
 completed_at timestamptz, coins_awarded integer not null default 0 check(coins_awarded>=0),
 session_id uuid, updated_at timestamptz not null default now(),
 unique(user_id,definition_id,period_date)
);
create index game_engagement_progress_definition_idx on public.game_engagement_progress(definition_id,period_date);
create table public.game_engagement_daily_budget (
 game_key text not null references public.game_engagement_settings(game_key), day_key date not null,
 coins_awarded integer not null default 0 check(coins_awarded>=0), primary key(game_key,day_key)
);
create table public.game_engagement_daily_awards (
 definition_id uuid not null references public.game_engagement_definitions(id), day_key date not null,
 winners integer not null default 0 check(winners>=0), primary key(definition_id,day_key)
);

alter table public.game_engagement_settings enable row level security;
alter table public.game_player_stats enable row level security;
alter table public.game_round_stats enable row level security;
alter table public.game_engagement_definitions enable row level security;
alter table public.game_engagement_progress enable row level security;
alter table public.game_engagement_daily_budget enable row level security;
alter table public.game_engagement_daily_awards enable row level security;
revoke all on public.game_engagement_settings,public.game_player_stats,public.game_round_stats,public.game_engagement_definitions,
 public.game_engagement_progress,public.game_engagement_daily_budget,public.game_engagement_daily_awards from anon,authenticated;
grant select on public.game_engagement_settings,public.game_player_stats,public.game_round_stats,public.game_engagement_definitions,
 public.game_engagement_progress,public.game_engagement_daily_budget,public.game_engagement_daily_awards to authenticated;
create policy "managers read engagement settings" on public.game_engagement_settings for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "players read own game stats" on public.game_player_stats for select to authenticated using(user_id=(select auth.uid()));
create policy "players read own round stats" on public.game_round_stats for select to authenticated using(user_id=(select auth.uid()));
create policy "managers read engagement definitions" on public.game_engagement_definitions for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "players read own engagement progress" on public.game_engagement_progress for select to authenticated using(user_id=(select auth.uid()));
create policy "managers read engagement budgets" on public.game_engagement_daily_budget for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "managers read engagement awards" on public.game_engagement_daily_awards for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));

create function private.game_engagement_definition_json(d public.game_engagement_definitions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',d.id,'gameId',d.game_key,'kind',d.kind,'code',d.code,'title',d.title,'description',d.description,
 'metric',d.metric,'target',d.target,'rewardCoins',d.reward_coins,'dailyRewardLimit',d.daily_reward_limit,
 'enabled',d.enabled,'startsAt',d.starts_at,'endsAt',d.ends_at);
$$;
create function public.configure_game_engagement(p_game_key text,p_daily_coin_cap integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 if p_game_key is distinct from 'safi-penalty' or p_daily_coin_cap is null or p_daily_coin_cap not between 0 and 100000 then
 raise exception 'GAME_ENGAGEMENT_INVALID_CONFIG' using errcode='22023'; end if;
 update public.game_engagement_settings set daily_coin_cap=p_daily_coin_cap,updated_at=clock_timestamp() where game_key=p_game_key;
 return jsonb_build_object('gameId',p_game_key,'dailyCoinCap',p_daily_coin_cap);
end $$;
create function public.save_game_engagement_definition(p_config jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.game_engagement_definitions; old_d public.game_engagement_definitions; v_id uuid;
begin
 perform private.require_coin_manager();
 if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'GAME_ENGAGEMENT_INVALID_CONFIG' using errcode='22023'; end if;
 begin
  v_id:=(p_config->>'id')::uuid;
  if v_id is not null then
   select * into old_d from public.game_engagement_definitions where id=v_id for update;
   if not found then raise check_violation; end if;
   d:=old_d;
   if (p_config ? 'gameId' and p_config->>'gameId' is distinct from d.game_key)
    or (p_config ? 'kind' and p_config->>'kind' is distinct from d.kind)
    or (p_config ? 'code' and p_config->>'code' is distinct from d.code) then raise check_violation; end if;
  else
   d.id:=gen_random_uuid(); d.game_key:=coalesce(p_config->>'gameId','safi-penalty');
   d.kind:=p_config->>'kind'; d.code:=p_config->>'code'; d.description:=''; d.reward_coins:=0; d.daily_reward_limit:=0;
   d.enabled:=true; d.starts_at:=clock_timestamp();
  end if;
  if p_config ? 'title' then d.title:=trim(p_config->>'title'); end if;
  if p_config ? 'description' then d.description:=p_config->>'description'; end if;
  if p_config ? 'metric' then d.metric:=p_config->>'metric'; end if;
  if p_config ? 'target' then d.target:=(p_config->>'target')::integer; end if;
  if p_config ? 'rewardCoins' then d.reward_coins:=(p_config->>'rewardCoins')::integer; end if;
  if p_config ? 'dailyRewardLimit' then d.daily_reward_limit:=(p_config->>'dailyRewardLimit')::integer; end if;
  if p_config ? 'enabled' then d.enabled:=(p_config->>'enabled')::boolean; end if;
  if p_config ? 'startsAt' then d.starts_at:=(p_config->>'startsAt')::timestamptz; end if;
  if p_config ? 'endsAt' then d.ends_at:=(p_config->>'endsAt')::timestamptz; end if;
  if v_id is not null and (old_d.metric,old_d.target,old_d.reward_coins) is distinct from (d.metric,d.target,d.reward_coins)
   and exists(select 1 from public.game_engagement_progress where definition_id=v_id) then
   raise exception 'GAME_ENGAGEMENT_DEFINITION_IN_USE' using errcode='P0403'; end if;
  insert into public.game_engagement_definitions(id,game_key,kind,code,title,description,metric,target,reward_coins,daily_reward_limit,enabled,starts_at,ends_at)
  values(d.id,d.game_key,d.kind,d.code,d.title,d.description,d.metric,d.target,d.reward_coins,d.daily_reward_limit,d.enabled,d.starts_at,d.ends_at)
  on conflict(id) do update set title=excluded.title,description=excluded.description,metric=excluded.metric,target=excluded.target,
   reward_coins=excluded.reward_coins,daily_reward_limit=excluded.daily_reward_limit,enabled=excluded.enabled,
   starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=clock_timestamp() returning * into d;
 exception when check_violation or not_null_violation or foreign_key_violation or unique_violation or invalid_text_representation
  or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
  raise exception 'GAME_ENGAGEMENT_INVALID_CONFIG' using errcode='22023';
 end;
 return private.game_engagement_definition_json(d);
end $$;

-- All metrics are derived from validated completed rounds, never a client-supplied counter.
create function private.game_engagement_metric(p_user uuid,d public.game_engagement_definitions,p_day date) returns bigint
language plpgsql stable set search_path='' as $$
declare result bigint; next_day date; k date;
begin
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

-- Global daily issuance and definition inventory are locked together. Ledger credit
-- remains in the same finish transaction; a retry cannot complete or credit twice.
create function private.game_engagement_award(p public.game_engagement_progress,d public.game_engagement_definitions,p_day date,p_session uuid) returns integer
language plpgsql set search_path='' as $$
declare cap integer; spent integer; winners integer;
begin
 if d.reward_coins=0 then return 0; end if;
 select daily_coin_cap into cap from public.game_engagement_settings where game_key=d.game_key for update;
 if cap<d.reward_coins then return 0; end if;
 insert into public.game_engagement_daily_budget(game_key,day_key) values(d.game_key,p_day) on conflict do nothing;
 select coins_awarded into spent from public.game_engagement_daily_budget where game_key=d.game_key and day_key=p_day for update;
 insert into public.game_engagement_daily_awards(definition_id,day_key) values(d.id,p_day) on conflict do nothing;
 select a.winners into winners from public.game_engagement_daily_awards a where definition_id=d.id and day_key=p_day for update;
 if spent+d.reward_coins>cap or winners>=d.daily_reward_limit then return 0; end if;
 insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,game_session_id,metadata)
 values(p.user_id,d.reward_coins,'PROMO',case when d.kind='challenge' then 'GAME_CHALLENGE' else 'GAME_ACHIEVEMENT' end,p.id,p_session,
 jsonb_build_object('gameId',d.game_key,'definitionId',d.id,'dayKey',p_day,'gameSessionId',p_session));
 update public.game_engagement_daily_budget set coins_awarded=coins_awarded+d.reward_coins where game_key=d.game_key and day_key=p_day;
 update public.game_engagement_daily_awards set winners=game_engagement_daily_awards.winners+1 where definition_id=d.id and day_key=p_day;
 return d.reward_coins;
end $$;

create function private.record_game_engagement(p_session uuid,p_allow_rewards boolean default true) returns jsonb
language plpgsql set search_path='' as $$
declare s public.game_sessions; a public.game_attempts; st public.game_player_stats; r public.game_round_stats;
 d public.game_engagement_definitions; p public.game_engagement_progress; v_day date; v_period date; v_progress bigint;
 v_run int:=0; v_saves int:=0; v_previous_best int; v_issued int; v_total_coins int:=0;
 v_unlocks jsonb:='[]'::jsonb; v_challenges jsonb:='[]'::jsonb; v_events jsonb; v_i int;
begin
 select events into v_events from public.game_round_stats where session_id=p_session;
 if found then return v_events; end if;
 select * into s from public.game_sessions where id=p_session and status='finished' and game_key='safi-penalty';
 if not found or s.attempts_used<>s.attempt_limit or s.attempt_limit<>10 then return '{}'::jsonb; end if;
 perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,731));
 -- The second check is needed if another finish call waited for this user's lock.
 select events into v_events from public.game_round_stats where session_id=p_session;
 if found then return v_events; end if;
 if (select count(*) from public.game_attempts where session_id=s.id and valid and submitted_at is not null)<>s.attempt_limit then return '{}'::jsonb; end if;
 v_day:=(coalesce(s.finished_at,s.started_at) at time zone private.agency_timezone())::date;
 r.session_id:=s.id; r.user_id:=s.user_id; r.game_key:=s.game_key; r.mode:=s.entry_mode;
 r.completed_at:=coalesce(s.finished_at,s.started_at); r.day_key:=v_day;
 r.score:=0; r.shots:=0; r.saves:=0; r.longest_combo:=0; r.corner_goals:=0; r.goal_zone_mask:=0; r.corner_mask:=0; r.goals_after_saves:=0;
 r.zone_shots:=array_fill(0::bigint,array[15]); r.zone_goals:=array_fill(0::bigint,array[15]);
 for a in select * from public.game_attempts where session_id=s.id order by n loop
  if a.zone not between 0 and 14 then return '{}'::jsonb; end if;
  v_i:=a.zone+1; r.shots:=r.shots+1; r.zone_shots[v_i]:=r.zone_shots[v_i]+1;
  if a.hit then
   r.score:=r.score+1; r.zone_goals[v_i]:=r.zone_goals[v_i]+1; r.goal_zone_mask:=r.goal_zone_mask | (1<<a.zone);
   v_run:=v_run+1; r.longest_combo:=greatest(r.longest_combo,v_run);
   if v_saves>=3 then r.goals_after_saves:=r.goals_after_saves+1; end if;
   v_saves:=0;
   if v_i in (1,5,11,15) then
    r.corner_goals:=r.corner_goals+1; r.corner_mask:=r.corner_mask | (case v_i when 1 then 1 when 5 then 2 when 11 then 4 else 8 end);
   end if;
  else r.saves:=r.saves+1; v_run:=0; v_saves:=v_saves+1;
  end if;
 end loop;
 insert into public.game_round_stats(session_id,user_id,game_key,mode,completed_at,day_key,score,shots,saves,longest_combo,
 corner_goals,goal_zone_mask,corner_mask,goals_after_saves,zone_shots,zone_goals)
 values(r.session_id,r.user_id,r.game_key,r.mode,r.completed_at,r.day_key,r.score,r.shots,r.saves,r.longest_combo,
 r.corner_goals,r.goal_zone_mask,r.corner_mask,r.goals_after_saves,r.zone_shots,r.zone_goals);
 insert into public.game_player_stats(user_id,game_key) values(s.user_id,s.game_key) on conflict do nothing;
 select * into st from public.game_player_stats where user_id=s.user_id and game_key=s.game_key for update;
 v_previous_best:=st.personal_best;
 for zone_index in 1..15 loop st.zone_shots[zone_index]:=st.zone_shots[zone_index]+r.zone_shots[zone_index]; st.zone_goals[zone_index]:=st.zone_goals[zone_index]+r.zone_goals[zone_index]; end loop;
 if st.last_played_date is null or v_day>st.last_played_date then
  st.current_streak:=case when st.last_played_date=v_day-1 then st.current_streak+1 else 1 end;
  st.last_played_date:=v_day; st.longest_streak:=greatest(st.longest_streak,st.current_streak);
 end if;
 update public.game_player_stats set games_played=games_played+1,goals=goals+r.score,saves_faced=saves_faced+r.saves,
 shots=shots+r.shots,personal_best=greatest(personal_best,r.score),longest_combo=greatest(longest_combo,r.longest_combo),
 zone_shots=st.zone_shots,zone_goals=st.zone_goals,current_streak=st.current_streak,longest_streak=st.longest_streak,
 last_played_date=st.last_played_date,updated_at=clock_timestamp() where user_id=s.user_id and game_key=s.game_key;
 for d in select * from public.game_engagement_definitions where game_key=s.game_key and enabled
  and starts_at<=r.completed_at and (ends_at is null or ends_at>r.completed_at) order by id for share loop
  if d.reward_coins>0 and (not p_allow_rewards or not s.reward_eligible or s.entry_mode not in ('free','paid')) then continue; end if;
  if not p_allow_rewards and d.kind='challenge' then continue; end if;
  v_period:=case when d.kind='challenge' then v_day else date '1970-01-01' end;
  insert into public.game_engagement_progress(user_id,definition_id,period_date) values(s.user_id,d.id,v_period) on conflict do nothing;
  select * into p from public.game_engagement_progress where user_id=s.user_id and definition_id=d.id and period_date=v_period for update;
  if p.completed_at is not null then continue; end if;
  v_progress:=least(d.target,private.game_engagement_metric(s.user_id,d,v_day));
  v_issued:=0;
  if v_progress>=d.target then
   p.completed_at:=r.completed_at;
   if p_allow_rewards then v_issued:=private.game_engagement_award(p,d,v_day,s.id); end if;
   if d.kind='achievement' then v_unlocks:=v_unlocks||jsonb_build_array(jsonb_build_object('id',d.id,'code',d.code,'title',d.title));
   else v_challenges:=v_challenges||jsonb_build_array(jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'coinsAwarded',v_issued)); end if;
  end if;
  update public.game_engagement_progress set progress=v_progress,completed_at=p.completed_at,coins_awarded=v_issued,
   session_id=s.id,updated_at=clock_timestamp() where id=p.id;
  v_total_coins:=v_total_coins+v_issued;
 end loop;
 v_events:=jsonb_build_object('newPersonalBest',r.score>v_previous_best,'unlockedAchievements',v_unlocks,
 'completedChallenges',v_challenges,'coinAmount',v_total_coins,'streak',st.current_streak);
 update public.game_round_stats set events=v_events where session_id=s.id;
 return v_events;
end $$;

-- No change to the existing game judging/reward implementation. The wrapper runs
-- engagement in the same transaction and caches its response with the round.
alter function public.game_center_finish(uuid) rename to game_center_finish_rewards;
alter function public.game_center_finish_rewards(uuid) set schema private;
create function public.game_center_finish(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare response jsonb; events jsonb;
begin
 response:=private.game_center_finish_rewards(p_session);
 if response ? 'engagement' then return response; end if;
 events:=private.record_game_engagement(p_session,true);
 response:=response||jsonb_build_object('engagement',events,'coinBalance',private.sun_coin_balance(auth.uid()));
 update public.game_sessions set finish_response=response where id=p_session and user_id=auth.uid();
 return response;
end $$;

-- Seed templates are editable; all badges/progress have zero coin value by default.
insert into public.game_engagement_definitions(game_key,kind,code,title,description,metric,target) values
 ('safi-penalty','challenge','five_goals','5 ta gol uring','Bugun yakunlangan raundlarda 5 ta gol uring.','GOALS_TOTAL',5),
 ('safi-penalty','challenge','two_combo','Ketma-ket 2 gol','Bir raundda ketma-ket ikki marta gol uring.','GOAL_COMBO',2),
 ('safi-penalty','challenge','practice_three','Uch raund mashq','Mashq rejimida 3 ta raundni yakunlang.','PRACTICE_ROUNDS',3),
 ('safi-penalty','achievement','first_goal','Birinchi gol','Birinchi golingizni uring.','GOALS_TOTAL',1),
 ('safi-penalty','achievement','sharpshooter','Aniq nishon','Bir raundda kamida 5 ta gol uring.','ROUND_GOALS',5),
 ('safi-penalty','achievement','perfect','Mukammal raund','Bir raundda 10 ta gol uring.','ROUND_GOALS',10),
 ('safi-penalty','achievement','corner_master','Burchaklar ustasi','To‘rtta burchak zonasiga gol uring.','ALL_CORNERS',4),
 ('safi-penalty','achievement','hundred_shots','100 zarba','Yakunlangan raundlarda 100 ta zarba bering.','SHOTS_TOTAL',100),
 ('safi-penalty','achievement','hundred_goals','100 gol','Yakunlangan raundlarda 100 ta gol uring.','GOALS_TOTAL',100),
 ('safi-penalty','achievement','combo_master','Combo ustasi','Ketma-ket 4 ta gol uring.','GOAL_COMBO',4),
 ('safi-penalty','achievement','veteran','Tajribali o‘yinchi','50 ta raundni yakunlang.','COMPLETED_ROUNDS',50),
 ('safi-penalty','achievement','three_day_streak','Uch kunlik seriya','Ketma-ket 3 kun kamida bitta raundni yakunlang.','STREAK_DAYS',3),
 ('safi-penalty','achievement','seven_day_streak','Haftalik seriya','Ketma-ket 7 kun o‘ynang.','STREAK_DAYS',7),
 ('safi-penalty','achievement','thirty_day_streak','30 kunlik seriya','Ketma-ket 30 kun o‘ynang.','STREAK_DAYS',30);

create function public.get_game_engagement(p_game_key text default 'safi-penalty') returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 'favoriteZone',(select z from generate_series(1,15) z where st.zone_shots[z]>0 order by st.zone_shots[z] desc,z limit 1),'zones',zones),
 'streak',jsonb_build_object('current',case when st.last_played_date>=v_day-1 then st.current_streak else 0 end,
 'longest',coalesce(st.longest_streak,0),'lastPlayedDate',st.last_played_date),'challenges',challenges,'achievements',achievements);
end $$;
create function public.get_game_engagement_admin(p_game_key text default 'safi-penalty') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 if p_game_key is distinct from 'safi-penalty' then raise exception 'GAME_NOT_AVAILABLE' using errcode='22023'; end if;
 return jsonb_build_object('gameId',p_game_key,'dailyCoinCap',(select daily_coin_cap from public.game_engagement_settings where game_key=p_game_key),
 'definitions',coalesce((select jsonb_agg(private.game_engagement_definition_json(d) order by d.kind,d.created_at,d.code) from public.game_engagement_definitions d where game_key=p_game_key),'[]'::jsonb),
 'analytics',jsonb_build_object('gamesPlayed',(select count(*) from public.game_round_stats where game_key=p_game_key),
 'dailyActivePlayers',(select count(distinct user_id) from public.game_round_stats where game_key=p_game_key and day_key=private.agency_today()),
 'practiceRounds',(select count(*) from public.game_round_stats where game_key=p_game_key and mode='practice'),
 'rewardRounds',(select count(*) from public.game_round_stats where game_key=p_game_key and mode in ('free','paid')),
 'averageScore',(select coalesce(round(avg(score),2),0) from public.game_round_stats where game_key=p_game_key),
 'activeStreaks',(select count(*) from public.game_player_stats where game_key=p_game_key and last_played_date>=private.agency_today()-1),
 'longestStreak',(select coalesce(max(longest_streak),0) from public.game_player_stats where game_key=p_game_key),
 'challengeCompletions',(select count(*) from public.game_engagement_progress p join public.game_engagement_definitions d on d.id=p.definition_id where d.game_key=p_game_key and d.kind='challenge' and p.completed_at is not null),
 'achievementUnlocks',(select count(*) from public.game_engagement_progress p join public.game_engagement_definitions d on d.id=p.definition_id where d.game_key=p_game_key and d.kind='achievement' and p.completed_at is not null),
 'coinsAwarded',(select coalesce(sum(coins_awarded),0) from public.game_engagement_daily_budget where game_key=p_game_key),
 'coinsSpent',(select -coalesce(sum(amount),0) from public.sun_coin_ledger where type='GAME_SPEND' and metadata->>'gameId'=p_game_key)));
end $$;

-- Import only already completed, validated rounds. No retrospective SUN Coin,
-- daily challenge issuance, notifications, or changes to gameplay history.
do $$declare sid uuid; begin
 for sid in select id from public.game_sessions where game_key='safi-penalty' and status='finished' order by coalesce(finished_at,started_at),id loop
  perform private.record_game_engagement(sid,false);
 end loop;
end $$;

revoke all on function private.game_engagement_definition_json(public.game_engagement_definitions),
 private.game_engagement_metric(uuid,public.game_engagement_definitions,date),
 private.game_engagement_award(public.game_engagement_progress,public.game_engagement_definitions,date,uuid),
 private.record_game_engagement(uuid,boolean),private.game_center_finish_rewards(uuid) from public,anon,authenticated;
revoke all on function public.configure_game_engagement(text,integer),public.save_game_engagement_definition(jsonb),
 public.get_game_engagement(text),public.get_game_engagement_admin(text),public.game_center_finish(uuid) from public,anon;
grant execute on function public.configure_game_engagement(text,integer),public.save_game_engagement_definition(jsonb),
 public.get_game_engagement(text),public.get_game_engagement_admin(text),public.game_center_finish(uuid) to authenticated;
