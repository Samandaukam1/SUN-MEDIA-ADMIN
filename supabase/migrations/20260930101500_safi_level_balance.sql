-- SAFI Penalty level balance. The level sets how often the goalkeeper saves (server-side, after the shot is
-- committed): easy 45 % · normal 65 % · hard 87.5 % · extreme 99 % — goals ≈ 55 / 35 / 12.5 / 1 %.
-- The dive follows the result: a save lands on the ball's zone, a goal sends the keeper clearly the wrong way
-- (outside the 3 × 3 neighbourhood of the shot). Rewards stay a separate system (campaign status, score threshold,
-- win probability, pool, quantity, limits); this only decides goal or save. game_sessions.reach_snapshot keeps the
-- round's level index (0 easy … 3 extreme). Legacy game_shoot is untouched.

create function private.game_center_save_chance(p_level integer) returns numeric language sql immutable set search_path = '' as $$
 select case p_level when 0 then 0.45 when 1 then 0.65 when 2 then 0.875 else 0.99 end::numeric;
$$;

-- One judged shot at zone 1…15 for a level: goal or save, and the zone the keeper dives to.
create function private.game_center_judge(p_level integer, p_zone integer, out goal boolean, out keeper integer)
language plpgsql volatile set search_path = '' as $$
begin
 goal := random() >= private.game_center_save_chance(coalesce(p_level, 0));
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
 select j.goal, j.keeper into v_goal, v_keeper from private.game_center_judge(v_level, p_zone) j;
 v_response := jsonb_build_object('attemptId', p_request, 'sessionId', p_session, 'attempt', p_n,
   'selectedZone', p_zone, 'goalkeeperZone', v_keeper, 'result', case when v_goal then 'GOAL' else 'CATCH' end,
   'score', v_s.score + case when v_goal then 1 else 0 end, 'attempts', v_s.attempt_limit);
 insert into public.game_attempts(session_id, n, params, zone, submitted_at, hit, valid, request_id, response)
 values(p_session, p_n, jsonb_build_object('keeper', v_keeper - 1, 'level', v_level, 'saveChance', private.game_center_save_chance(v_level)),
   p_zone - 1, clock_timestamp(), v_goal, true, p_request, v_response);
 update public.game_sessions set attempts_used = p_n, score = (v_response->>'score')::int where id = p_session;
 return v_response;
end $$;

revoke all on function private.game_center_save_chance(integer), private.game_center_judge(integer, integer) from public, anon, authenticated;
