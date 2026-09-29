-- SAFI penalty game (final mechanic): a chicken goalkeeper in front of a goal split into 3 rows × 5 columns.
-- The player picks one of 15 zones; the goalkeeper's dive is chosen by the server when the attempt starts and is
-- never sent to the app. Saved = the dive covers the shot (difficulty = how far the goalkeeper reaches):
--   easy 0: only its zone · normal 1: ±1 column · hard 2: ±1 column and ±1 row · extreme 3: ±2 columns and ±1 row.
-- Goal = +1. Rewards, cooldowns and prize boxes keep the existing engine. Additive.

alter table public.game_campaigns drop constraint game_campaigns_template_check;
alter table public.game_campaigns add constraint game_campaigns_template_check check (template in ('catch', 'pour', 'penalty'));
alter table public.game_attempts add column if not exists zone smallint check (zone between 0 and 14);

CREATE OR REPLACE FUNCTION private.game_attempt_params(p_template text, p_difficulty text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v jsonb;
  j numeric := 0.9 + random() * 0.2; -- ±10% period jitter per attempt
begin
  if p_template = 'penalty' then
    -- 3 rows × 5 columns (zone = row * 5 + col). reach: how far the goalkeeper covers around its dive.
    return jsonb_build_object(
      'keeper', floor(random() * 15)::int,
      'reach', case p_difficulty when 'easy' then 0 when 'normal' then 1 when 'hard' then 2 else 3 end,
      'min_ms', 250,
      'limit_ms', 20000
    );
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.game_next_attempt(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Penalty: where the goalkeeper will dive is decided now and never sent to the app.
  return jsonb_build_object('n', v_n, 'params', case when v_g.template = 'penalty' then v_params - 'keeper' else v_params end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.game_submit_attempt(p_session uuid, p_n smallint, p_tap_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_g.template = 'penalty' then
    raise exception 'GAME_USE_SHOOT' using errcode = 'P0403';
  end if;

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
$function$;

create or replace function private.penalty_saved(p_keeper integer, p_zone integer, p_reach integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_reach
    when 0 then p_keeper = p_zone
    when 1 then p_keeper / 5 = p_zone / 5 and abs(p_keeper % 5 - p_zone % 5) <= 1
    when 2 then abs(p_keeper / 5 - p_zone / 5) <= 1 and abs(p_keeper % 5 - p_zone % 5) <= 1
    else abs(p_keeper / 5 - p_zone / 5) <= 1 and abs(p_keeper % 5 - p_zone % 5) <= 2
  end;
$$;

-- The shot of attempt n at zone 0…14. Timing is measured by the server clock; the result and the goalkeeper's
-- zone are returned only after the shot is recorded.
create or replace function public.game_shoot(p_session uuid, p_n smallint, p_zone smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.game_sessions;
  v_g public.game_campaigns;
  v_a public.game_attempts;
  v_elapsed_ms integer;
  v_valid boolean;
  v_keeper integer;
  v_goal boolean;
begin
  select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() for update;
  if not found or v_s.status <> 'playing' or v_s.expires_at <= now() then
    raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_g from public.game_campaigns where id = v_s.campaign_id;
  if v_g.template <> 'penalty' or p_zone not between 0 and 14 then
    raise exception 'GAME_ATTEMPT_CLOSED' using errcode = 'P0403';
  end if;
  select * into v_a from public.game_attempts where session_id = p_session and n = p_n for update;
  if not found or v_a.submitted_at is not null then
    raise exception 'GAME_ATTEMPT_CLOSED' using errcode = 'P0403';
  end if;

  v_elapsed_ms := (extract(epoch from (clock_timestamp() - v_a.started_at)) * 1000)::int;
  v_valid := v_elapsed_ms between (v_a.params ->> 'min_ms')::int and (v_a.params ->> 'limit_ms')::int;
  v_keeper := (v_a.params ->> 'keeper')::int;
  v_goal := v_valid and not private.penalty_saved(v_keeper, p_zone, (v_a.params ->> 'reach')::int);

  update public.game_attempts
  set zone = p_zone, tap_ms = v_elapsed_ms, submitted_at = clock_timestamp(), hit = v_goal, valid = v_valid
  where session_id = p_session and n = p_n;
  update public.game_sessions
  set score = score + case when v_goal then 1 else 0 end,
      invalid_taps = invalid_taps + case when v_valid then 0 else 1 end
  where id = p_session;
  return jsonb_build_object('n', p_n, 'zone', p_zone, 'keeper', v_keeper, 'goal', v_goal, 'valid', v_valid);
end;
$$;

grant execute on function public.game_shoot(uuid, smallint, smallint) to authenticated;
revoke all on function public.game_shoot(uuid, smallint, smallint) from anon;
