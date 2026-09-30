-- Permanent Game Center. Reuse sessions, attempts, campaigns and subscription rewards.
-- The new protocol is isolated from the legacy timed catch/pour protocol.
alter table public.game_sessions alter column campaign_id drop not null;
alter table public.game_sessions
  add column game_key text check (game_key is null or game_key = 'safi-penalty'),
  add column start_request uuid,
  add column attempt_limit smallint not null default 10 check (attempt_limit between 1 and 30),
  add column target_snapshot smallint not null default 7,
  add column reward_eligible boolean not null default true,
  add column reward_reason text,
  add column finish_response jsonb;
create unique index game_sessions_start_request_idx on public.game_sessions(user_id, start_request) where start_request is not null;
create index game_sessions_center_idx on public.game_sessions(user_id, game_key, started_at desc) where game_key is not null;
alter table public.game_attempts add column request_id uuid, add column response jsonb;
create unique index game_attempts_request_idx on public.game_attempts(session_id, request_id) where request_id is not null;
-- eligible/guaranteed contain the private draw. Clients receive only safe RPC projections.
drop policy "players and managers read sessions" on public.game_sessions;
create policy "managers read sessions" on public.game_sessions for select to authenticated
  using ((select private.has_permission('promo.manage')));

create function private.require_game_client() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_client uuid;
begin
  if auth.uid() is null or private.is_staff() or not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active' and deleted_at is null
  ) then raise exception 'Games are for clients' using errcode = '42501'; end if;
  select c.id into v_client from public.clients c
  where c.id = any(private.member_client_ids()) and c.status in ('active', 'paused') and c.deleted_at is null
  order by c.id limit 1;
  if v_client is null then raise exception 'Games are for clients' using errcode = '42501'; end if;
  return v_client;
end $$;

create function private.center_session_json(s public.game_sessions) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('sessionId', s.id, 'gameId', s.game_key, 'attempts', s.attempt_limit,
   'score', s.score, 'attemptsUsed', s.attempts_used, 'rewardEligible', s.reward_eligible,
   'rewardReason', s.reward_reason, 'expiresAt', s.expires_at, 'targetScore', s.target_snapshot);
$$;

create function public.game_center_start(p_game_key text, p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_client uuid; v_g public.game_campaigns; v_s public.game_sessions;
 v_reason text; v_last timestamptz; v_today int; v_wins int; v_plays int;
 v_guaranteed boolean := false; v_draw boolean := false;
begin
 v_client := private.require_game_client();
 if p_game_key is distinct from 'safi-penalty' or p_request is null then
   raise exception 'GAME_NOT_AVAILABLE' using errcode = '22023'; end if;
 -- Serialize start/reward operations per user without locking unrelated players.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 731));
 select * into v_s from public.game_sessions where user_id = auth.uid() and start_request = p_request;
 if found then return private.center_session_json(v_s); end if;
 -- Reconnecting must not erase a round or reroll its reward draw.
 select * into v_s from public.game_sessions where user_id = auth.uid() and game_key = p_game_key
   and status = 'playing' and expires_at > now() order by started_at desc limit 1;
 if found then return private.center_session_json(v_s); end if;
 select g.* into v_g from public.game_campaigns g
 where g.template = 'penalty' and g.attempts = 10 and g.target_score <= 10 and g.client_id = any(private.member_client_ids())
   and g.is_active and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
 order by g.starts_at desc, g.id limit 1 for update;
 if v_g.id is null then v_reason := 'NO_CAMPAIGN';
 else
   v_client := v_g.client_id;
   select max(started_at), count(*) filter(where (started_at at time zone private.agency_timezone())::date = private.agency_today()),
     count(*) filter(where won), count(*) into v_last, v_today, v_wins, v_plays
   from public.game_sessions where campaign_id = v_g.id and user_id = auth.uid() and reward_eligible;
   v_reason := case
     when v_g.max_rewards_total is not null and v_g.rewards_given >= v_g.max_rewards_total then 'SOLD_OUT'
     when v_wins >= v_g.max_wins_per_user then 'MAX_WINS'
     when v_today >= v_g.max_sessions_per_day then 'DAILY_LIMIT'
     when v_last + make_interval(mins => v_g.cooldown_minutes) > now() then 'COOLDOWN'
     else null end;
   if v_reason is null then
     v_guaranteed := (v_g.win_mode = 'first_play_guaranteed' and v_plays = 0)
       or (v_g.win_mode = 'next_player_guaranteed' and v_g.guarantee_next);
     if v_g.win_mode = 'next_player_guaranteed' and v_guaranteed then
       update public.game_campaigns set guarantee_next = false where id = v_g.id;
     end if;
     v_draw := v_guaranteed or v_g.win_mode = 'skill' or random() < v_g.win_probability;
   end if;
 end if;
 insert into public.game_sessions(campaign_id, user_id, client_id, workspace_id, eligible, guaranteed,
   game_key, start_request, attempt_limit, target_snapshot, reward_eligible, reward_reason)
 values(v_g.id, auth.uid(), v_client, private.client_workspace_id(v_client), v_draw, v_guaranteed,
   p_game_key, p_request, 10, coalesce(v_g.target_score, 7), v_reason is null, v_reason)
 returning * into v_s;
 return private.center_session_json(v_s);
end $$;

create function public.game_center_shoot(p_session uuid, p_request uuid, p_n integer, p_zone integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.game_sessions; v_a public.game_attempts; v_keeper int; v_goal boolean; v_response jsonb;
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
 -- Draw only after committing the player's selected zone to this transaction. No predictive data is returned.
 v_keeper := floor(random() * 15)::int + 1;
 v_goal := v_keeper <> p_zone;
 v_response := jsonb_build_object('attemptId', p_request, 'sessionId', p_session, 'attempt', p_n,
   'selectedZone', p_zone, 'goalkeeperZone', v_keeper, 'result', case when v_goal then 'GOAL' else 'CATCH' end,
   'score', v_s.score + case when v_goal then 1 else 0 end, 'attempts', v_s.attempt_limit);
 insert into public.game_attempts(session_id, n, params, zone, submitted_at, hit, valid, request_id, response)
 values(p_session, p_n, jsonb_build_object('keeper', v_keeper - 1), p_zone - 1, clock_timestamp(), v_goal, true, p_request, v_response);
 update public.game_sessions set attempts_used = p_n, score = (v_response->>'score')::int where id = p_session;
 return v_response;
end $$;

create function public.game_center_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.game_sessions; v_score int; v_response jsonb; v_boxes boolean;
begin
 perform private.require_game_client();
 select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() and game_key = 'safi-penalty' for update;
 if not found or not (v_s.client_id = any(private.member_client_ids())) then raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 if v_s.finish_response is not null then return v_s.finish_response; end if;
 if v_s.status <> 'playing' or v_s.expires_at <= now() then raise exception 'GAME_SESSION_CLOSED' using errcode = 'P0403'; end if;
 if v_s.attempts_used <> v_s.attempt_limit then raise exception 'GAME_INCOMPLETE' using errcode = 'P0403'; end if;
 select count(*) filter(where hit and valid) into v_score from public.game_attempts where session_id = p_session;
 v_boxes := v_s.reward_eligible and (v_s.guaranteed or v_score >= v_s.target_snapshot);
 v_response := jsonb_build_object('score', v_score, 'attempts', v_s.attempt_limit, 'boxes', v_boxes, 'flagged', false);
 update public.game_sessions set status = 'finished', score = v_score, finished_at = clock_timestamp(),
   won = v_boxes and eligible, finish_response = v_response where id = p_session;
 return v_response;
end $$;

create function public.game_center_claim(p_session uuid, p_box integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.game_sessions;
begin
 perform private.require_game_client();
 if p_box is null or p_box not between 0 and 2 then raise exception 'GAME_INVALID_BOX' using errcode = '22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 731));
 select * into v_s from public.game_sessions where id = p_session and user_id = auth.uid() and game_key = 'safi-penalty' for update;
 if not found or v_s.status <> 'finished' or not v_s.reward_eligible or not coalesce((v_s.finish_response->>'boxes')::boolean, false)
   or not (v_s.client_id = any(private.member_client_ids())) then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode = 'P0403'; end if;
 -- Existing claim function enforces unique session rewards, stock and extends the existing Pro expiry.
 return public.game_open_box(p_session, p_box::smallint);
end $$;

revoke all on function private.require_game_client(), private.center_session_json(public.game_sessions) from public, anon, authenticated;
revoke all on function public.game_center_start(text, uuid), public.game_center_shoot(uuid, uuid, integer, integer),
 public.game_center_finish(uuid), public.game_center_claim(uuid, integer) from public, anon;
grant execute on function public.game_center_start(text, uuid), public.game_center_shoot(uuid, uuid, integer, integer),
 public.game_center_finish(uuid), public.game_center_claim(uuid, integer) to authenticated;

-- Keep legacy endpoints from mutating new-protocol sessions.
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
  if exists(select 1 from public.game_sessions where id = p_session and game_key is not null) then
    raise exception 'GAME_USE_CENTER' using errcode = 'P0403';
  end if;
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

-- Keep legacy endpoints from mutating new-protocol sessions.
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
  if exists(select 1 from public.game_sessions where id = p_session and game_key is not null) then
    raise exception 'GAME_USE_CENTER' using errcode = 'P0403';
  end if;
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

-- Keep legacy endpoints from mutating new-protocol sessions.
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
  if exists(select 1 from public.game_sessions where id = p_session and game_key is not null) then
    raise exception 'GAME_USE_CENTER' using errcode = 'P0403';
  end if;
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

-- Keep legacy endpoints from mutating new-protocol sessions.
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
  if exists(select 1 from public.game_sessions where id = p_session and game_key is not null) then
    raise exception 'GAME_USE_CENTER' using errcode = 'P0403';
  end if;
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
