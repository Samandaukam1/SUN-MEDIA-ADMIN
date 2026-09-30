-- SAFI Penalty: hidden difficulty balance and admin reward rules.
--
-- Levels are internal (players never see a level, a limit or a rule): easy · normal · hard · very_hard · extreme.
-- Each shot is judged on the server after the player's zone is committed. A level has a goal chance for the first
-- shot that the keeper wears down during the round (it reads the player better, −2.4 % of the base per shot), holds
-- on a little harder one goal before the level's top result, and a hidden top result — 10 / 9 / 8 / 7 / 6 — beyond
-- which it saves everything. Tuned so the top result is a very good round (≈ 6 / 5 / 5 / 4 / 3 % of rounds) and the
-- average steps down ≈ 7.7 / 6.2 / 5.0 / 3.9 / 2.8 goals; managers see the exact distribution in the admin.
--
-- Reward rules: SUN MEDIA sets rewards per score — SUN Coin or days of Pro — each with an on/off switch and an
-- optional quantity, grouped in dated campaigns (one active per game). When a Reward Mode round ends, the server
-- grants the best switched-on rule the score reached that is still in stock (SUN Coin through the ledger, Pro through
-- the subscription extension), once per round. Rules are read when the round ends, so changes need no app update.
-- They replace, for SAFI, the SUN Coin pool campaigns and the Pro prize boxes; both stay as history.

-- ————————————————————————————————————————————————————————————————— Levels
alter table public.game_center_settings drop constraint game_center_settings_difficulty_check;
alter table public.game_center_settings add constraint game_center_settings_difficulty_check
 check (difficulty in ('easy', 'normal', 'hard', 'very_hard', 'extreme'));
-- The level is internal configuration now: only Game Center managers read it.
drop policy "everyone signed in reads game levels" on public.game_center_settings;
create policy "coin managers read game levels" on public.game_center_settings for select to authenticated
 using ((select private.is_staff()) and (select private.has_permission('promo.manage')));

-- Level index: 0 easy · 1 normal · 2 hard · 3 very hard · 4 extreme (extreme used to be 3).
alter table public.game_sessions drop constraint game_sessions_reach_snapshot_check;
update public.game_sessions set reach_snapshot = 4 where reach_snapshot = 3;
alter table public.game_sessions add constraint game_sessions_reach_snapshot_check check (reach_snapshot between 0 and 4);

create or replace function private.game_center_reach(p_game_key text) returns smallint language sql stable set search_path = '' as $$
 select coalesce((select case difficulty when 'easy' then 0 when 'normal' then 1 when 'hard' then 2 when 'very_hard' then 3 else 4 end
  from public.game_center_settings where game_key = p_game_key), 0)::smallint;
$$;

-- A level's hidden profile: the goal chance at the first shot and the top result of a round.
create function private.game_center_level(p_level integer, out base numeric, out top integer)
language sql immutable set search_path = '' as $$
 select (case p_level when 0 then 0.76 when 1 then 0.61 when 2 then 0.50 when 3 then 0.38 else 0.28 end)::numeric,
        case p_level when 0 then 10 when 1 then 9 when 2 then 8 when 3 then 7 else 6 end;
$$;

-- The chance that shot p_shot (1…10) is a goal when the player already has p_goals.
create function private.game_center_goal_chance(p_level integer, p_shot integer, p_goals integer) returns numeric
language sql immutable set search_path = '' as $$
 select (case when p_goals >= l.top then 0
   else least(0.95, l.base * (1.12 - 0.024 * (greatest(1, least(coalesce(p_shot, 1), 10)) - 1))
     * case when p_goals = l.top - 1 then 0.85 else 1 end) end)::numeric
 from private.game_center_level(coalesce(p_level, 0)) l;
$$;

-- Exact outcome of a 10-shot round at a level: the probability of 0…10 goals (for the admin's balance view).
create function private.game_center_level_distribution(p_level integer) returns numeric[]
language plpgsql immutable set search_path = '' as $$
declare d numeric[] := array[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; nd numeric[]; p numeric;
begin
 for n in 1..10 loop
  nd := array_fill(0::numeric, array[11]);
  for g in 0..10 loop
   if d[g + 1] > 0 then
    p := private.game_center_goal_chance(p_level, n, g);
    if g < 10 then nd[g + 2] := nd[g + 2] + d[g + 1] * p; end if;
    nd[g + 1] := nd[g + 1] + d[g + 1] * (1 - p);
   end if;
  end loop;
  d := nd;
 end loop;
 return d;
end $$;

create function private.game_center_levels_json() returns jsonb language sql stable set search_path = '' as $$
 select jsonb_agg(jsonb_build_object('key', k.key, 'index', k.idx, 'top', l.top,
   'average', round((select sum((i - 1) * x.d[i]) from generate_subscripts(x.d, 1) i), 2),
   'distribution', (select jsonb_agg(round(x.d[i], 4) order by i) from generate_subscripts(x.d, 1) i)) order by k.idx)
 from (values ('easy', 0), ('normal', 1), ('hard', 2), ('very_hard', 3), ('extreme', 4)) k(key, idx)
 cross join lateral private.game_center_level(k.idx) l
 cross join lateral (select private.game_center_level_distribution(k.idx) as d) x;
$$;

-- One judged shot: goal or save, and the zone the keeper dives to (a save lands on the ball, a goal sends the keeper
-- clearly the wrong way — outside the 3 × 3 neighbourhood of the shot).
drop function private.game_center_judge(integer, integer);
drop function private.game_center_save_chance(integer);
create function private.game_center_judge(p_level integer, p_zone integer, p_shot integer, p_goals integer, out goal boolean, out keeper integer)
language plpgsql volatile set search_path = '' as $$
begin
 goal := random() < private.game_center_goal_chance(p_level, p_shot, p_goals);
 if not goal then
  keeper := p_zone;
 else
  select z into keeper from generate_series(1, 15) z
  where abs((z - 1) % 5 - (p_zone - 1) % 5) > 1 or abs((z - 1) / 5 - (p_zone - 1) / 5) > 1
  order by random() limit 1;
 end if;
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
   'score', v_s.score + case when v_goal then 1 else 0 end, 'attempts', v_s.attempt_limit);
 insert into public.game_attempts(session_id, n, params, zone, submitted_at, hit, valid, request_id, response)
 values(p_session, p_n, jsonb_build_object('keeper', v_keeper - 1, 'level', v_level, 'goalChance', private.game_center_goal_chance(v_level, p_n, v_s.score)),
   p_zone - 1, clock_timestamp(), v_goal, true, p_request, v_response);
 update public.game_sessions set attempts_used = p_n, score = (v_response->>'score')::int where id = p_session;
 return v_response;
end $$;

create or replace function public.set_game_center_difficulty(p_game_key text, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.game_center_settings;
begin
 perform private.require_coin_manager();
 if p_difficulty is null or p_difficulty not in ('easy', 'normal', 'hard', 'very_hard', 'extreme') then
  raise exception 'GAME_INVALID_LEVEL' using errcode = '22023'; end if;
 update public.game_center_settings set difficulty = p_difficulty, updated_by = auth.uid(), updated_at = now()
 where game_key = p_game_key returning * into s;
 if not found then raise exception 'GAME_NOT_AVAILABLE' using errcode = '22023'; end if;
 return jsonb_build_object('gameId', s.game_key, 'difficulty', s.difficulty, 'updatedAt', s.updated_at);
end $$;

-- ————————————————————————————————————————————————————————————————— Reward rules
create table public.game_reward_campaigns (
 id uuid primary key default gen_random_uuid(),
 game_key text not null check (game_key ~ '^[a-z][a-z0-9-]{1,63}$'),
 title text not null check (char_length(title) between 1 and 100),
 status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ends_at is null or ends_at > starts_at)
);
create unique index game_reward_one_active_idx on public.game_reward_campaigns(game_key) where status = 'active';
create index game_reward_campaigns_created_idx on public.game_reward_campaigns(created_at desc);

-- One rule per score in a campaign: reaching `score` goals earns `amount` SUN Coin or `amount` days of Pro.
create table public.game_reward_rules (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.game_reward_campaigns(id),
 score smallint not null check (score between 1 and 10),
 reward_type text not null check (reward_type in ('SUN_COIN', 'PRO_DAYS')),
 amount integer not null check (amount between 1 and 1000000),
 quantity integer check (quantity between 1 and 1000000),
 awarded integer not null default 0 check (awarded >= 0 and (quantity is null or awarded <= quantity)),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (campaign_id, score),
 check (reward_type <> 'PRO_DAYS' or amount <= 365)
);

-- What each Reward Mode round was given (at most one reward per round).
create table public.game_reward_grants (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null unique, -- audit reference; deliberately survives session retention
 user_id uuid not null references public.profiles(id),
 campaign_id uuid not null references public.game_reward_campaigns(id),
 rule_id uuid not null references public.game_reward_rules(id),
 score smallint not null,
 reward_type text not null check (reward_type in ('SUN_COIN', 'PRO_DAYS')),
 amount integer not null,
 subscription_id uuid references public.workspace_subscriptions(id) on delete set null,
 ends_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index game_reward_grants_campaign_idx on public.game_reward_grants(campaign_id);
create index game_reward_grants_rule_idx on public.game_reward_grants(rule_id);
create index game_reward_grants_user_idx on public.game_reward_grants(user_id, created_at desc);

create trigger game_reward_campaigns_updated_at before update on public.game_reward_campaigns
 for each row execute function private.set_updated_at();
create trigger game_reward_rules_updated_at before update on public.game_reward_rules
 for each row execute function private.set_updated_at();

alter table public.game_reward_campaigns enable row level security;
alter table public.game_reward_rules enable row level security;
alter table public.game_reward_grants enable row level security;
revoke all on public.game_reward_campaigns, public.game_reward_rules, public.game_reward_grants from anon, authenticated;
grant select on public.game_reward_campaigns, public.game_reward_rules, public.game_reward_grants to authenticated;
create policy "coin managers read reward campaigns" on public.game_reward_campaigns for select to authenticated
 using ((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "coin managers read reward rules" on public.game_reward_rules for select to authenticated
 using ((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "coin managers read reward grants" on public.game_reward_grants for select to authenticated
 using ((select private.is_staff()) and (select private.has_permission('promo.manage')));

-- SUN Coin rewards from a rule are GAME_REWARD ledger rows pointing at the rule.
alter table public.sun_coin_ledger add column reward_rule_id uuid references public.game_reward_rules(id);
create index sun_coin_ledger_rule_idx on public.sun_coin_ledger(reward_rule_id) where reward_rule_id is not null;
do $$
declare c text;
begin
 for c in select conname from pg_constraint where conrelid = 'public.sun_coin_ledger'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%GAME_REWARD%' and pg_get_constraintdef(oid) like '%reward_id%' loop
  execute format('alter table public.sun_coin_ledger drop constraint %I', c);
 end loop;
end $$;
alter table public.sun_coin_ledger add constraint sun_coin_ledger_game_reward_check check (type <> 'GAME_REWARD'
 or (game_session_id is not null and ((campaign_id is not null and reward_id is not null) or reward_rule_id is not null)));

-- A round remembers the reward campaign it was started under.
alter table public.game_sessions add column reward_campaign_id uuid references public.game_reward_campaigns(id);
create index game_sessions_reward_campaign_idx on public.game_sessions(reward_campaign_id) where reward_campaign_id is not null;

create function private.game_reward_campaign_json(c public.game_reward_campaigns) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id', c.id, 'gameId', c.game_key, 'title', c.title, 'status', c.status,
  'startsAt', c.starts_at, 'endsAt', c.ends_at, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
  'live', c.status = 'active' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now()),
  'winners', (select count(*) from public.game_reward_grants g where g.campaign_id = c.id),
  'coinsGiven', (select coalesce(sum(g.amount), 0) from public.game_reward_grants g where g.campaign_id = c.id and g.reward_type = 'SUN_COIN'),
  'proDaysGiven', (select coalesce(sum(g.amount), 0) from public.game_reward_grants g where g.campaign_id = c.id and g.reward_type = 'PRO_DAYS'),
  'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'score', r.score, 'type', r.reward_type, 'amount', r.amount,
     'quantity', r.quantity, 'awarded', r.awarded, 'remaining', case when r.quantity is not null then r.quantity - r.awarded end,
     'enabled', r.enabled) order by r.score)
   from public.game_reward_rules r where r.campaign_id = c.id), '[]'::jsonb));
$$;

-- The campaign a new Reward Mode round plays for: active, in its dates, with a switched-on rule still in stock.
create function private.game_reward_live_campaign(p_game_key text) returns public.game_reward_campaigns
language sql stable set search_path = '' as $$
 select c.* from public.game_reward_campaigns c
 where c.game_key = p_game_key and c.status = 'active' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
  and exists (select 1 from public.game_reward_rules r where r.campaign_id = c.id and r.enabled and (r.quantity is null or r.awarded < r.quantity))
 limit 1;
$$;

-- Add or change rules by score: [{"score": 7, "type": "SUN_COIN", "amount": 3, "quantity": 100, "enabled": true}, …];
-- {"score": 9, "remove": true} drops a rule nobody has won yet.
create function private.game_reward_put_rules(p_campaign uuid, p_rules jsonb) returns void language plpgsql set search_path = '' as $$
declare o jsonb; v_score smallint;
begin
 if p_rules is null then return; end if;
 if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 10 then raise check_violation; end if;
 for o in select value from jsonb_array_elements(p_rules) loop
  if jsonb_typeof(o) <> 'object' then raise check_violation; end if;
  v_score := (o->>'score')::smallint;
  if v_score is null then raise not_null_violation; end if;
  if coalesce((o->>'remove')::boolean, false) then
   if exists (select 1 from public.game_reward_rules where campaign_id = p_campaign and score = v_score and awarded > 0) then
    raise exception 'GAME_REWARD_RULE_IN_USE' using errcode = 'P0403'; end if;
   delete from public.game_reward_rules where campaign_id = p_campaign and score = v_score;
  else
   insert into public.game_reward_rules(campaign_id, score, reward_type, amount, quantity, enabled)
   values (p_campaign, v_score, o->>'type', (o->>'amount')::int, (o->>'quantity')::int, coalesce((o->>'enabled')::boolean, true))
   on conflict (campaign_id, score) do update set reward_type = excluded.reward_type, amount = excluded.amount,
    quantity = excluded.quantity, enabled = excluded.enabled;
  end if;
 end loop;
end $$;

create function public.create_game_reward_campaign(p_config jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.game_reward_campaigns;
begin
 perform private.require_coin_manager();
 if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config->'rules') is distinct from 'array'
  or jsonb_array_length(p_config->'rules') not between 1 and 10 or coalesce(p_config->>'status', 'draft') not in ('draft', 'active')
  or coalesce(p_config->>'gameId', 'safi-penalty') <> 'safi-penalty' then
  raise exception 'GAME_INVALID_REWARD_RULES' using errcode = '22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('safi-penalty', 733));
 if p_config->>'status' = 'active' and exists (select 1 from public.game_reward_campaigns where game_key = 'safi-penalty' and status = 'active') then
  raise exception 'GAME_REWARD_CAMPAIGN_ACTIVE' using errcode = 'P0403'; end if;
 begin
  insert into public.game_reward_campaigns(game_key, title, status, starts_at, ends_at, created_by)
  values ('safi-penalty', trim(p_config->>'title'), coalesce(p_config->>'status', 'draft'),
   coalesce((p_config->>'startsAt')::timestamptz, now()), (p_config->>'endsAt')::timestamptz, auth.uid()) returning * into c;
  perform private.game_reward_put_rules(c.id, p_config->'rules');
 exception when check_violation or not_null_violation or unique_violation or invalid_text_representation or numeric_value_out_of_range
  or invalid_datetime_format or datetime_field_overflow or string_data_right_truncation then
  raise exception 'GAME_INVALID_REWARD_RULES' using errcode = '22023';
 end;
 return private.game_reward_campaign_json(c);
end $$;

-- Change a campaign's name, dates or rules (not once it has ended). Takes effect for rounds that end afterwards.
create function public.update_game_reward_campaign(p_campaign uuid, p_config jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.game_reward_campaigns;
begin
 perform private.require_coin_manager();
 if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'GAME_INVALID_REWARD_RULES' using errcode = '22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('safi-penalty', 733));
 select * into c from public.game_reward_campaigns where id = p_campaign for update;
 if not found or c.status = 'ended' then raise exception 'GAME_REWARD_CAMPAIGN_CLOSED' using errcode = 'P0403'; end if;
 begin
  update public.game_reward_campaigns set
   title = case when p_config ? 'title' then trim(p_config->>'title') else title end,
   starts_at = case when p_config ? 'startsAt' then coalesce((p_config->>'startsAt')::timestamptz, starts_at) else starts_at end,
   ends_at = case when p_config ? 'endsAt' then (p_config->>'endsAt')::timestamptz else ends_at end
  where id = c.id returning * into c;
  perform private.game_reward_put_rules(c.id, p_config->'rules');
 exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
  or invalid_datetime_format or datetime_field_overflow or string_data_right_truncation then
  raise exception 'GAME_INVALID_REWARD_RULES' using errcode = '22023';
 end;
 if not exists (select 1 from public.game_reward_rules where campaign_id = c.id) then
  raise exception 'GAME_INVALID_REWARD_RULES' using errcode = '22023'; end if;
 return private.game_reward_campaign_json(c);
end $$;

create function public.set_game_reward_campaign_status(p_campaign uuid, p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.game_reward_campaigns;
begin
 perform private.require_coin_manager();
 perform pg_advisory_xact_lock(hashtextextended('safi-penalty', 733));
 select * into c from public.game_reward_campaigns where id = p_campaign for update;
 if not found or p_status is null or p_status not in ('active', 'paused', 'ended') or c.status = 'ended'
  or (c.status = 'draft' and p_status = 'paused') then raise exception 'GAME_REWARD_INVALID_TRANSITION' using errcode = 'P0403'; end if;
 if p_status = 'active' and exists (select 1 from public.game_reward_campaigns where game_key = c.game_key and status = 'active' and id <> c.id) then
  raise exception 'GAME_REWARD_CAMPAIGN_ACTIVE' using errcode = 'P0403'; end if;
 update public.game_reward_campaigns set status = p_status where id = c.id returning * into c;
 return private.game_reward_campaign_json(c);
end $$;

-- ————————————————————————————————————————————————————————————————— Rounds
-- What the app may know about a round: progress and mode. No level, top result, rule or reward configuration.
create or replace function private.center_session_json(s public.game_sessions) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('sessionId', s.id, 'gameId', s.game_key, 'attempts', s.attempt_limit,
  'score', s.score, 'attemptsUsed', s.attempts_used, 'rewardEligible', s.reward_eligible, 'rewardReason', s.reward_reason,
  'expiresAt', s.expires_at, 'mode', s.entry_mode, 'coinBalance', private.sun_coin_balance(s.user_id));
$$;

create or replace function public.game_center_start_mode(p_game_key text, p_request uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare client uuid; s public.game_sessions; c public.game_reward_campaigns; last_free timestamptz;
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
 if p_mode <> 'practice' then
  c := private.game_reward_live_campaign(p_game_key);
  if c.id is null then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode = 'P0403'; end if;
  if p_mode = 'free' then
   select max(started_at) into last_free from public.game_sessions where user_id = auth.uid() and game_key = p_game_key and entry_mode = 'free';
   if last_free + interval '24 hours' > now() then raise exception 'GAME_FREE_COOLDOWN' using errcode = 'P0403'; end if;
  elsif private.sun_coin_balance(auth.uid()) < 10 then raise exception 'COIN_INSUFFICIENT_BALANCE' using errcode = 'P0403'; end if;
 end if;
 insert into public.game_sessions(campaign_id, user_id, client_id, workspace_id, eligible, guaranteed, game_key, start_request,
  attempt_limit, target_snapshot, reward_eligible, reward_reason, entry_mode, pro_reward_eligible, coin_campaign_id, coin_reward_eligible, reward_campaign_id)
 values (null, auth.uid(), client, private.client_workspace_id(client), false, false, p_game_key, p_request, 10, 10,
  p_mode <> 'practice', case when p_mode = 'practice' then 'PRACTICE' end, p_mode, false, null, false, c.id) returning * into s;
 if p_mode = 'paid' then
  insert into public.sun_coin_ledger(user_id, amount, type, source, reference_id, game_session_id, metadata)
  values (auth.uid(), -10, 'GAME_SPEND', 'SAFI_PENALTY_REWARD_ATTEMPT', s.id, s.id, jsonb_build_object('gameId', p_game_key, 'gameSessionId', s.id, 'requestId', p_request));
 end if;
 return private.center_session_json(s);
end $$;

-- The score is recounted from the judged shots; the reward is the best switched-on rule the score reached that is
-- still in stock, granted once. The response says only what was won.
create or replace function public.game_center_finish(p_session uuid) returns jsonb
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
  if c.status = 'active' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now()) then
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

-- The wallet tells the app only whether Reward Mode is open and what kinds of prizes exist — never scores or amounts.
create or replace function public.get_sun_coin_wallet(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare last_free timestamptz; active public.game_sessions; c public.game_reward_campaigns;
begin
 perform private.require_game_client();
 select max(started_at) into last_free from public.game_sessions where user_id = auth.uid() and game_key = 'safi-penalty' and entry_mode = 'free';
 select * into active from public.game_sessions where user_id = auth.uid() and game_key = 'safi-penalty' and status = 'playing' and expires_at > now()
  order by started_at desc limit 1;
 c := private.game_reward_live_campaign('safi-penalty');
 return jsonb_build_object('balance', private.sun_coin_balance(auth.uid()), 'serverNow', clock_timestamp(),
  'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'userId', l.user_id, 'amount', l.amount, 'type', l.type,
    'source', l.source, 'referenceId', l.reference_id, 'createdAt', l.created_at, 'metadata', l.metadata) order by l.created_at desc)
   from (select * from public.sun_coin_ledger where user_id = auth.uid() order by created_at desc, id desc limit greatest(1, least(coalesce(p_limit, 30), 100))) l), '[]'::jsonb),
  'attempt', jsonb_build_object('gameId', 'safi-penalty', 'freeAvailable', last_free is null or last_free + interval '24 hours' <= now(),
   'nextFreeAt', case when last_free + interval '24 hours' > now() then last_free + interval '24 hours' end, 'cost', 10,
   'activeSession', case when active.id is not null then private.center_session_json(active) end),
  'campaignAvailable', c.id is not null,
  'rewardKinds', coalesce((select jsonb_agg(distinct r.reward_type) from public.game_reward_rules r
   where r.campaign_id = c.id and r.enabled and (r.quantity is null or r.awarded < r.quantity)), '[]'::jsonb),
  -- Kept empty for app builds that still read these keys.
  'campaign', null, 'proCampaign', null,
  'pendingPurchase', (select private.sun_coin_request_json(q) from public.sun_coin_purchase_requests q where q.user_id = auth.uid() and q.status = 'pending'));
end $$;

-- ————————————————————————————————————————————————————————————————— Admin view
create or replace function public.get_sun_coin_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_coin_manager();
 return jsonb_build_object('campaigns', coalesce((select jsonb_agg(private.sun_coin_campaign_json(c) order by c.created_at desc) from public.sun_coin_campaigns c), '[]'::jsonb),
 'analytics', (select jsonb_build_object('purchased', coalesce(sum(amount) filter (where type = 'PURCHASE'), 0),
  'spent', -coalesce(sum(amount) filter (where type = 'GAME_SPEND'), 0), 'rewarded', coalesce(sum(amount) filter (where type = 'GAME_REWARD'), 0),
  'gifted', coalesce(sum(amount) filter (where type = 'ADMIN_BONUS'), 0),
  'circulating', coalesce(sum(amount), 0), 'totalWinners', count(distinct user_id) filter (where type = 'GAME_REWARD')) from public.sun_coin_ledger),
 'packs', coalesce((select jsonb_agg(private.sun_coin_pack_json(p) order by p.sort_order, p.coins) from public.sun_coin_packs p), '[]'::jsonb),
 'purchaseRequests', coalesce((select jsonb_agg(private.sun_coin_request_json(r) || jsonb_build_object('userName', coalesce(nullif(u.full_name, ''), u.email), 'clientName', cl.name)
   order by (r.status = 'pending') desc, r.created_at desc)
  from (select * from public.sun_coin_purchase_requests order by (status = 'pending') desc, created_at desc limit 50) r
  join public.profiles u on u.id = r.user_id left join public.clients cl on cl.id = r.client_id), '[]'::jsonb),
 'settings', coalesce((select jsonb_agg(jsonb_build_object('gameId', s.game_key, 'difficulty', s.difficulty, 'updatedAt', s.updated_at)) from public.game_center_settings s), '[]'::jsonb),
 'levels', private.game_center_levels_json(),
 'rewardCampaigns', coalesce((select jsonb_agg(private.game_reward_campaign_json(c) order by (c.status = 'active') desc, c.created_at desc)
  from public.game_reward_campaigns c), '[]'::jsonb),
 'rewardSummary', (select jsonb_build_object('rounds', count(*), 'coins', coalesce(sum(amount) filter (where reward_type = 'SUN_COIN'), 0),
  'proDays', coalesce(sum(amount) filter (where reward_type = 'PRO_DAYS'), 0), 'winners', count(distinct user_id)) from public.game_reward_grants));
end $$;

-- A starting point SUN MEDIA can edit — a draft, so nothing is given away until a manager switches it on.
insert into public.game_reward_campaigns(game_key, title, status)
values ('safi-penalty', 'SAFI Penalty — standart mukofotlar', 'draft');
insert into public.game_reward_rules(campaign_id, score, reward_type, amount)
select c.id, r.score, r.kind, r.amount from public.game_reward_campaigns c,
 (values (7, 'SUN_COIN', 3), (8, 'SUN_COIN', 5), (9, 'PRO_DAYS', 7), (10, 'PRO_DAYS', 30)) r(score, kind, amount)
where c.game_key = 'safi-penalty' and c.title = 'SAFI Penalty — standart mukofotlar';

revoke all on function private.game_center_level(integer), private.game_center_goal_chance(integer, integer, integer),
 private.game_center_level_distribution(integer), private.game_center_levels_json(), private.game_center_judge(integer, integer, integer, integer),
 private.game_reward_campaign_json(public.game_reward_campaigns), private.game_reward_live_campaign(text),
 private.game_reward_put_rules(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_game_reward_campaign(jsonb), public.update_game_reward_campaign(uuid, jsonb),
 public.set_game_reward_campaign_status(uuid, text) from public, anon;
grant execute on function public.create_game_reward_campaign(jsonb), public.update_game_reward_campaign(uuid, jsonb),
 public.set_game_reward_campaign_status(uuid, text) to authenticated;
