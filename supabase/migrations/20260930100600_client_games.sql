-- Branded client mini-games with server-validated results and SUN MEDIA Pro rewards (additive).
--
-- One reusable engine, two templates: 'catch' (SAFI: aim the egg, the chicken on the gate catches it) and 'pour'
-- (WeDrink: stop the pour inside the target band). The SERVER is the referee:
--   * each attempt's physics parameters are created when the attempt starts (never all up front);
--   * the app sends only the tap time; the database recomputes hit / miss with the same closed-form formulas;
--   * tap times are checked against the server clock; implausible or bot-perfect play is flagged;
--   * whether a finished game wins is decided when the session starts (by the campaign mode), before any box;
--   * a reward is granted once per session and extends the client workspace's Pro.
-- Games exist only for client users; SUN MEDIA staff never see them.

create table public.game_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  template text not null check (template in ('catch', 'pour')),
  title text not null check (char_length(title) between 1 and 80),
  subtitle text check (char_length(subtitle) <= 160),
  rules text check (char_length(rules) <= 1000),
  -- Colours and optional images: {"primary": "#E30613", "background": "#FFF6E5", "text": "#1A1A1A", "logo_url": "..."}
  brand jsonb not null default '{}' check (jsonb_typeof(brand) = 'object'),
  attempts smallint not null default 10 check (attempts between 1 and 30),
  target_score smallint not null default 10 check (target_score >= 1),
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard', 'extreme')),
  reward_plan text not null default 'pro' references public.saas_plans (key),
  reward_days integer not null default 3 check (reward_days between 1 and 365),
  -- skill: every target score wins. probability: a finished target score wins with win_probability.
  -- first_play_guaranteed: a player's first game wins once completed; later games follow win_probability.
  -- next_player_guaranteed: the next game started (guarantee_next) wins once completed; others follow win_probability.
  win_mode text not null default 'skill' check (win_mode in ('skill', 'probability', 'first_play_guaranteed', 'next_player_guaranteed')),
  win_probability numeric(5, 4) not null default 1 check (win_probability between 0 and 1),
  guarantee_next boolean not null default false,
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 0 and 10080),
  max_sessions_per_day integer not null default 3 check (max_sessions_per_day between 1 and 100),
  max_wins_per_user integer not null default 1 check (max_wins_per_user between 1 and 100),
  max_rewards_total integer check (max_rewards_total > 0),
  rewards_given integer not null default 0 check (rewards_given >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_score <= attempts),
  check (ends_at is null or ends_at > starts_at)
);

create index game_campaigns_client_idx on public.game_campaigns (client_id) where is_active;

create trigger game_campaigns_updated_at before update on public.game_campaigns
  for each row execute function private.set_updated_at();

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.game_campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'playing' check (status in ('playing', 'finished', 'expired', 'flagged')),
  -- Decided at the start and never sent to the app before the end.
  eligible boolean not null,
  guaranteed boolean not null default false,
  score smallint not null default 0,
  attempts_used smallint not null default 0,
  invalid_taps smallint not null default 0,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  finished_at timestamptz,
  won boolean,
  box_index smallint check (box_index between 0 and 2),
  flagged_reason text check (char_length(flagged_reason) <= 200)
);

create index game_sessions_user_idx on public.game_sessions (campaign_id, user_id, started_at desc);

create table public.game_attempts (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  n smallint not null check (n >= 1),
  params jsonb not null,
  started_at timestamptz not null default clock_timestamp(),
  tap_ms integer,
  submitted_at timestamptz,
  hit boolean,
  error_ratio numeric,
  valid boolean,
  primary key (session_id, n)
);

create table public.game_rewards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.game_sessions (id) on delete cascade,
  campaign_id uuid not null references public.game_campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_key text not null references public.saas_plans (key),
  days integer not null,
  subscription_id uuid references public.workspace_subscriptions (id) on delete set null,
  claimed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Physics: the same closed-form formulas run in the app (for drawing) and here (for judging).
-- ---------------------------------------------------------------------------
create or replace function private.game_attempt_params(p_template text, p_difficulty text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v jsonb;
  j numeric := 0.9 + random() * 0.2; -- ±10% period jitter per attempt
begin
  if p_template = 'catch' then
    v := case p_difficulty
      when 'easy' then '{"pc": 3.2, "ac": 0.26, "pa": 2.6, "t": 0.55, "r": 0.11, "a2": 0, "p2": 1}'
      when 'normal' then '{"pc": 2.4, "ac": 0.30, "pa": 2.0, "t": 0.6, "r": 0.085, "a2": 0, "p2": 1}'
      when 'hard' then '{"pc": 1.8, "ac": 0.33, "pa": 1.6, "t": 0.65, "r": 0.065, "a2": 0.03, "p2": 0.9}'
      else '{"pc": 1.3, "ac": 0.33, "pa": 1.25, "t": 0.7, "r": 0.05, "a2": 0.06, "p2": 0.8}'
    end::jsonb;
    return v || jsonb_build_object(
      'pc', round(((v ->> 'pc')::numeric * j), 3),
      'pa', round(((v ->> 'pa')::numeric * (1.9 - j)), 3),
      'aa', (v ->> 'ac')::numeric + 0.04,
      'fc', round((random() * 2 * pi())::numeric, 4),
      'fa', round((random() * 2 * pi())::numeric, 4),
      'limit_ms', 20000
    );
  end if;
  v := case p_difficulty
    when 'easy' then '{"tf": 3.0, "k": 1.0, "w": 0.07, "ab": 0, "pb": 1}'
    when 'normal' then '{"tf": 2.4, "k": 1.3, "w": 0.055, "ab": 0, "pb": 1}'
    when 'hard' then '{"tf": 1.9, "k": 1.6, "w": 0.045, "ab": 0.03, "pb": 1.3}'
    else '{"tf": 1.5, "k": 1.9, "w": 0.035, "ab": 0.06, "pb": 1.1}'
  end::jsonb;
  return v || jsonb_build_object(
    'tf', round(((v ->> 'tf')::numeric * j), 3),
    'c', round((0.55 + random() * 0.3)::numeric, 3),
    'fb', round((random() * 2 * pi())::numeric, 4),
    'limit_ms', 20000
  );
end;
$$;

-- catch: chicken x_c(t) = 0.5 + ac·sin(2πt/pc + fc) + a2·sin(2πt/p2); aim x_a(t) = 0.5 + aa·sin(2πt/pa + fa);
--        the egg lands at x_a(tap) after t seconds; caught if |x_a(tap) − x_c(tap + t)| ≤ r.
-- pour:  level L(t) = (t/tf)^k (overflow above 1.25); band centre c(t) = c + ab·sin(2πt/pb + fb);
--        a hit if |L(tap) − c(tap)| ≤ w.
create or replace function private.game_judge(p_template text, p_params jsonb, p_tap_ms integer)
returns table (hit boolean, error_ratio numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  t double precision := p_tap_ms / 1000.0;
  x_aim double precision;
  x_chicken double precision;
  lvl double precision;
  centre double precision;
  diff double precision;
  tol double precision;
begin
  if p_template = 'catch' then
    x_aim := 0.5 + (p_params ->> 'aa')::float8 * sin(2 * pi() * t / (p_params ->> 'pa')::float8 + (p_params ->> 'fa')::float8);
    x_chicken := 0.5 + (p_params ->> 'ac')::float8 * sin(2 * pi() * (t + (p_params ->> 't')::float8) / (p_params ->> 'pc')::float8 + (p_params ->> 'fc')::float8)
               + (p_params ->> 'a2')::float8 * sin(2 * pi() * (t + (p_params ->> 't')::float8) / (p_params ->> 'p2')::float8);
    diff := abs(x_aim - x_chicken);
    tol := (p_params ->> 'r')::float8;
  else
    lvl := power(greatest(t, 0) / (p_params ->> 'tf')::float8, (p_params ->> 'k')::float8);
    if lvl > 1.25 then
      return query select false, 99::numeric;
      return;
    end if;
    centre := (p_params ->> 'c')::float8 + (p_params ->> 'ab')::float8 * sin(2 * pi() * t / (p_params ->> 'pb')::float8 + (p_params ->> 'fb')::float8);
    diff := abs(lvl - centre);
    tol := (p_params ->> 'w')::float8;
  end if;
  return query select diff <= tol, round((diff / tol)::numeric, 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- Player API (client users only)
-- ---------------------------------------------------------------------------
create or replace function private.game_player_state(p_campaign public.game_campaigns, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select * from public.game_sessions s where s.campaign_id = p_campaign.id and s.user_id = p_user
  )
  select jsonb_build_object(
    'plays_today', (select count(*) from mine where (started_at at time zone private.agency_timezone())::date = private.agency_today()),
    'wins', (select count(*) from mine where won),
    'last_started_at', (select max(started_at) from mine),
    'next_play_at', (select max(started_at) + make_interval(mins => p_campaign.cooldown_minutes) from mine
                     having max(started_at) + make_interval(mins => p_campaign.cooldown_minutes) > now()),
    'open_session', (select id from mine where status = 'playing' and expires_at > now() order by started_at desc limit 1)
  );
$$;

-- What the player is told about winning — the real rule of the campaign, never an invented chance.
create or replace function private.game_rules_text(p_campaign public.game_campaigns)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_campaign.win_mode
    when 'skill' then p_campaign.target_score || '/' || p_campaign.attempts || ' natija — ' || p_campaign.reward_days || ' kunlik Pro.'
    when 'probability' then p_campaign.target_score || '/' || p_campaign.attempts || ' natija qilganlar orasida sovg‘a ehtimoli — '
      || trim(to_char(p_campaign.win_probability * 100, 'FM990.##')) || '%. Sovg‘a: ' || p_campaign.reward_days || ' kunlik Pro.'
    when 'first_play_guaranteed' then 'Birinchi o‘yiningizni oxirigacha o‘ynang — ' || p_campaign.reward_days || ' kunlik Pro kafolatlangan. Keyingi o‘yinlarda '
      || p_campaign.target_score || '/' || p_campaign.attempts || ' natija qilganlarga ehtimol: ' || trim(to_char(p_campaign.win_probability * 100, 'FM990.##')) || '%.'
    else p_campaign.target_score || '/' || p_campaign.attempts || ' natija qilganlar orasida sovg‘a ehtimoli — '
      || trim(to_char(p_campaign.win_probability * 100, 'FM990.##')) || '%. Ba’zi o‘yinlar SUN MEDIA tomonidan sovg‘ali qilib belgilanadi.'
  end;
$$;

create or replace function public.get_my_games()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if private.is_staff() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'client_id', g.client_id, 'client_name', c.name, 'template', g.template, 'title', g.title,
      'subtitle', g.subtitle, 'rules', g.rules, 'rules_text', private.game_rules_text(g), 'brand', g.brand,
      'attempts', g.attempts, 'target_score', g.target_score, 'difficulty', g.difficulty, 'reward_days', g.reward_days,
      'ends_at', g.ends_at, 'max_sessions_per_day', g.max_sessions_per_day, 'max_wins_per_user', g.max_wins_per_user,
      'sold_out', g.max_rewards_total is not null and g.rewards_given >= g.max_rewards_total,
      'me', private.game_player_state(g, auth.uid())
    ) order by g.starts_at desc)
    from public.game_campaigns g
    join public.clients c on c.id = g.client_id
    where g.is_active and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
      and g.client_id = any (private.member_client_ids())
  ), '[]'::jsonb);
end;
$$;

create or replace function public.game_start(p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_g public.game_campaigns;
  v_state jsonb;
  v_eligible boolean;
  v_guaranteed boolean := false;
  v_session public.game_sessions;
begin
  if v_uid is null or private.is_staff() then
    raise exception 'Games are for clients' using errcode = '42501';
  end if;
  select * into v_g from public.game_campaigns where id = p_campaign for update;
  if not found or not v_g.is_active or v_g.starts_at > now() or (v_g.ends_at is not null and v_g.ends_at <= now())
     or not (v_g.client_id = any (private.member_client_ids())) then
    raise exception 'GAME_NOT_AVAILABLE' using errcode = 'P0403';
  end if;

  -- Only one game at a time; unfinished ones expire.
  update public.game_sessions set status = 'expired'
  where campaign_id = p_campaign and user_id = v_uid and status = 'playing';

  v_state := private.game_player_state(v_g, v_uid);
  if (v_state ->> 'wins')::int >= v_g.max_wins_per_user then
    raise exception 'GAME_MAX_WINS' using errcode = 'P0403';
  end if;
  if (v_state ->> 'plays_today')::int >= v_g.max_sessions_per_day then
    raise exception 'GAME_DAILY_LIMIT' using errcode = 'P0403';
  end if;
  if v_state ->> 'next_play_at' is not null then
    raise exception 'GAME_COOLDOWN' using errcode = 'P0403';
  end if;

  -- The outcome rule is fixed here, before any box is shown.
  if v_g.win_mode = 'first_play_guaranteed' and v_state ->> 'last_started_at' is null then
    v_guaranteed := true;
  elsif v_g.win_mode = 'next_player_guaranteed' and v_g.guarantee_next then
    v_guaranteed := true;
    update public.game_campaigns set guarantee_next = false where id = v_g.id;
  end if;
  v_eligible := v_guaranteed or v_g.win_mode = 'skill' or random() < v_g.win_probability;
  if v_g.max_rewards_total is not null and v_g.rewards_given >= v_g.max_rewards_total then
    v_eligible := false;
    v_guaranteed := false;
  end if;

  insert into public.game_sessions (campaign_id, user_id, client_id, workspace_id, eligible, guaranteed)
  values (v_g.id, v_uid, v_g.client_id, private.client_workspace_id(v_g.client_id), v_eligible, v_guaranteed)
  returning * into v_session;
  return jsonb_build_object('session_id', v_session.id, 'attempts', v_g.attempts, 'target_score', v_g.target_score,
                            'template', v_g.template, 'expires_at', v_session.expires_at);
end;
$$;

-- Starts attempt n: creates its parameters now (the app gets them only for this attempt).
create or replace function public.game_next_attempt(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.game_sessions;
  v_g public.game_campaigns;
  v_n smallint;
  v_params jsonb;
begin
  select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() for update;
  if not found or v_s.status <> 'playing' or v_s.expires_at <= now() then
    raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_g from public.game_campaigns where id = v_s.campaign_id;
  -- An attempt that was started and never answered counts as a miss.
  update public.game_attempts set hit = false, valid = false, submitted_at = clock_timestamp()
  where session_id = p_session and submitted_at is null;
  select coalesce(max(n), 0) + 1 into v_n from public.game_attempts where session_id = p_session;
  if v_n > v_g.attempts then
    raise exception 'GAME_NO_ATTEMPTS_LEFT' using errcode = 'P0403';
  end if;
  v_params := private.game_attempt_params(v_g.template, v_g.difficulty);
  insert into public.game_attempts (session_id, n, params) values (p_session, v_n, v_params);
  update public.game_sessions set attempts_used = v_n where id = p_session;
  return jsonb_build_object('n', v_n, 'params', v_params);
end;
$$;

-- The tap of attempt n, in ms since the attempt started on the device. Judged here against the server clock.
create or replace function public.game_submit_attempt(p_session uuid, p_n smallint, p_tap_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.game_sessions;
  v_g public.game_campaigns;
  v_a public.game_attempts;
  v_elapsed_ms numeric;
  v_valid boolean;
  v_hit boolean;
  v_ratio numeric;
begin
  select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() for update;
  if not found or v_s.status <> 'playing' then
    raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_a from public.game_attempts where session_id = p_session and n = p_n for update;
  if not found or v_a.submitted_at is not null then
    raise exception 'GAME_ATTEMPT_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_g from public.game_campaigns where id = v_s.campaign_id;

  v_elapsed_ms := extract(epoch from (clock_timestamp() - v_a.started_at)) * 1000;
  -- A tap cannot happen after the request arrived, nor long before it (network), nor faster than a human.
  v_valid := p_tap_ms between 120 and (v_a.params ->> 'limit_ms')::int
             and p_tap_ms <= v_elapsed_ms + 300 and p_tap_ms >= v_elapsed_ms - 5000;
  if v_valid then
    select j.hit, j.error_ratio into v_hit, v_ratio from private.game_judge(v_g.template, v_a.params, p_tap_ms) j;
  else
    v_hit := false;
    v_ratio := null;
  end if;

  update public.game_attempts
  set tap_ms = p_tap_ms, submitted_at = clock_timestamp(), hit = v_hit, error_ratio = v_ratio, valid = v_valid
  where session_id = p_session and n = p_n;
  update public.game_sessions
  set score = score + case when v_hit then 1 else 0 end,
      invalid_taps = invalid_taps + case when v_valid then 0 else 1 end
  where id = p_session;
  return jsonb_build_object('n', p_n, 'hit', v_hit, 'valid', v_valid);
end;
$$;

-- End of the game: score from the judged attempts; boxes appear only when there is a prize opportunity.
create or replace function public.game_finish(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.game_sessions;
  v_g public.game_campaigns;
  v_score integer;
  v_hits integer;
  v_best numeric;
  v_flag text;
  v_won boolean;
  v_complete boolean;
begin
  select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() for update;
  if not found or v_s.status <> 'playing' then
    raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_g from public.game_campaigns where id = v_s.campaign_id;
  update public.game_attempts set hit = false, valid = false, submitted_at = clock_timestamp()
  where session_id = p_session and submitted_at is null;

  select count(*) filter (where hit), count(*) filter (where hit), max(error_ratio) filter (where hit)
  into v_score, v_hits, v_best
  from public.game_attempts where session_id = p_session;
  v_complete := (select count(*) from public.game_attempts where session_id = p_session) >= v_g.attempts;

  -- Suspicious play: several impossible tap times, or near-perfect precision on nearly every attempt.
  if v_s.invalid_taps >= 2 then
    v_flag := 'Bosish vaqtlari server vaqti bilan mos emas';
  elsif v_hits >= greatest(8, v_g.attempts - 2) and v_best is not null and v_best < 0.08 then
    v_flag := 'Juda aniq (avtomatik o‘yin ehtimoli)';
  end if;

  v_won := v_flag is null and v_complete and v_s.eligible and (v_s.guaranteed or v_score >= v_g.target_score);
  update public.game_sessions
  set status = case when v_flag is null then 'finished' else 'flagged' end, score = v_score, finished_at = now(),
      won = v_won, flagged_reason = v_flag
  where id = p_session;

  return jsonb_build_object(
    'score', v_score, 'attempts', v_g.attempts, 'target_score', v_g.target_score,
    -- Boxes are shown for a prize opportunity: target reached (or a guaranteed game). The chosen box's content is fixed.
    'boxes', v_flag is null and v_complete and (v_s.guaranteed or v_score >= v_g.target_score),
    'flagged', v_flag is not null
  );
end;
$$;

-- Opening a box: the outcome was fixed at the start; a winning session's prize is in whichever box is opened.
create or replace function public.game_open_box(p_session uuid, p_box smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.game_sessions;
  v_g public.game_campaigns;
  v_sub public.workspace_subscriptions;
  v_reward public.game_rewards;
begin
  select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() for update;
  if not found or v_s.status <> 'finished' or p_box not between 0 and 2 then
    raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403';
  end if;
  if v_s.box_index is not null then
    select * into v_reward from public.game_rewards where session_id = p_session;
    return jsonb_build_object('box', v_s.box_index, 'won', v_reward.id is not null, 'days', v_reward.days, 'repeat', true);
  end if;
  update public.game_sessions set box_index = p_box where id = p_session;
  if not v_s.won then
    return jsonb_build_object('box', p_box, 'won', false);
  end if;

  select * into v_g from public.game_campaigns where id = v_s.campaign_id for update;
  if v_g.max_rewards_total is not null and v_g.rewards_given >= v_g.max_rewards_total then
    update public.game_sessions set won = false where id = p_session;
    return jsonb_build_object('box', p_box, 'won', false, 'sold_out', true);
  end if;
  v_sub := private.extend_workspace_plan(v_s.workspace_id, v_g.reward_plan, v_g.reward_days, 'game', 'O‘yin: ' || v_g.title);
  insert into public.game_rewards (session_id, campaign_id, user_id, workspace_id, plan_key, days, subscription_id)
  values (p_session, v_g.id, v_s.user_id, v_s.workspace_id, v_g.reward_plan, v_g.reward_days, v_sub.id)
  returning * into v_reward;
  update public.game_campaigns set rewards_given = rewards_given + 1 where id = v_g.id;
  perform private.notify(array[v_s.user_id], 'game.reward', v_g.reward_days || ' kunlik SUN MEDIA Pro yutdingiz!',
    v_g.title || ': ' || to_char(v_sub.ends_at at time zone private.agency_timezone(), 'DD.MM.YYYY') || ' gacha amal qiladi.',
    jsonb_build_object('route', '/account'), 'game_sessions', p_session, v_s.client_id, 'normal', true);
  return jsonb_build_object('box', p_box, 'won', true, 'days', v_g.reward_days, 'ends_at', v_sub.ends_at);
end;
$$;

-- Admin: "the next player wins" switch for next_player_guaranteed campaigns.
create or replace function public.game_guarantee_next(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff() and private.has_permission('promo.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.game_campaigns set guarantee_next = true where id = p_campaign and win_mode = 'next_player_guaranteed';
end;
$$;

-- Running campaigns is a Pro tool of the agency. Invoker rights: an app write cannot touch the reward counter,
-- while game_open_box (definer) can.
create or replace function private.gate_game_campaigns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform private.require_agency_feature('promo.tools');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  if not private.is_privileged_context() and tg_op = 'UPDATE' then
    new.rewards_given := old.rewards_given;
  end if;
  return new;
end;
$$;

create trigger game_campaigns_05_gate before insert or update on public.game_campaigns
  for each row execute function private.gate_game_campaigns();

grant execute on function public.get_my_games() to authenticated;
grant execute on function public.game_start(uuid) to authenticated;
grant execute on function public.game_next_attempt(uuid) to authenticated;
grant execute on function public.game_submit_attempt(uuid, smallint, integer) to authenticated;
grant execute on function public.game_finish(uuid) to authenticated;
grant execute on function public.game_open_box(uuid, smallint) to authenticated;
grant execute on function public.game_guarantee_next(uuid) to authenticated;
revoke all on function public.get_my_games() from anon;
revoke all on function public.game_start(uuid) from anon;
revoke all on function public.game_next_attempt(uuid) from anon;
revoke all on function public.game_submit_attempt(uuid, smallint, integer) from anon;
revoke all on function public.game_finish(uuid) from anon;
revoke all on function public.game_open_box(uuid, smallint) from anon;
revoke all on function public.game_guarantee_next(uuid) from anon;

-- ---------------------------------------------------------------------------
-- RLS: players read their own history; campaign managers read everything. All writes go through functions,
-- except campaign configuration by promo managers.
-- ---------------------------------------------------------------------------
alter table public.game_campaigns enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_attempts enable row level security;
alter table public.game_rewards enable row level security;

revoke insert, update, delete on public.game_sessions, public.game_attempts, public.game_rewards from anon, authenticated;
revoke delete on public.game_campaigns from anon, authenticated;

create policy "promo managers read campaigns" on public.game_campaigns for select to authenticated
  using ((select private.has_permission('promo.manage')));
create policy "promo managers create campaigns" on public.game_campaigns for insert to authenticated
  with check ((select private.has_permission('promo.manage')));
create policy "promo managers edit campaigns" on public.game_campaigns for update to authenticated
  using ((select private.has_permission('promo.manage'))) with check ((select private.has_permission('promo.manage')));

create policy "players and managers read sessions" on public.game_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('promo.manage')));
create policy "managers read attempts" on public.game_attempts for select to authenticated
  using ((select private.has_permission('promo.manage')));
create policy "players and managers read rewards" on public.game_rewards for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('promo.manage')));

create trigger audit_game_campaigns after insert or update on public.game_campaigns
  for each row execute function private.audit_row();
