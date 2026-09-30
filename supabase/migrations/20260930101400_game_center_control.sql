-- Game Center control for SUN MEDIA managers (app and panel): the game's level, snapshotted by each new round and
-- applied when the goalkeeper's dive is judged; direct SUN Coin gifts (ADMIN_BONUS) to client users; a recipient
-- search; gifts in the analytics. Additive: the default level keeps today's odds.

create table public.game_center_settings (
 game_key text primary key check (game_key ~ '^[a-z][a-z0-9-]{1,63}$'),
 -- The goalkeeper's reach: easy = only its zone · normal = ±1 column · hard = ±1 column and row · extreme = ±2 columns, ±1 row.
 difficulty text not null default 'easy' check (difficulty in ('easy', 'normal', 'hard', 'extreme')),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
insert into public.game_center_settings(game_key) values ('safi-penalty');
alter table public.game_center_settings enable row level security;
revoke all on public.game_center_settings from anon, authenticated;
grant select on public.game_center_settings to authenticated;
-- The level is public on purpose: players may know the odds.
create policy "everyone signed in reads game levels" on public.game_center_settings for select to authenticated using (true);

alter table public.game_sessions add column reach_snapshot smallint check (reach_snapshot between 0 and 3);

create function private.game_center_reach(p_game_key text) returns smallint language sql stable set search_path = '' as $$
 select coalesce((select case difficulty when 'easy' then 0 when 'normal' then 1 when 'hard' then 2 else 3 end
  from public.game_center_settings where game_key = p_game_key), 0)::smallint;
$$;

-- A round keeps the level it started with, whatever changes during it.
create function private.game_sessions_reach_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.game_key is not null and new.reach_snapshot is null then
  new.reach_snapshot := private.game_center_reach(new.game_key);
 end if;
 return new;
end $$;
create trigger game_sessions_05_reach_snapshot before insert on public.game_sessions
 for each row execute function private.game_sessions_reach_snapshot();

create or replace function public.game_center_shoot(p_session uuid, p_request uuid, p_n integer, p_zone integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.game_sessions; v_a public.game_attempts; v_keeper int; v_goal boolean; v_response jsonb; v_reach int;
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
 -- The round's level decides how far the dive reaches (easy = only the keeper's own zone).
 v_reach := coalesce(v_s.reach_snapshot, 0);
 v_goal := not private.penalty_saved(v_keeper - 1, p_zone - 1, v_reach);
 v_response := jsonb_build_object('attemptId', p_request, 'sessionId', p_session, 'attempt', p_n,
   'selectedZone', p_zone, 'goalkeeperZone', v_keeper, 'result', case when v_goal then 'GOAL' else 'CATCH' end,
   'score', v_s.score + case when v_goal then 1 else 0 end, 'attempts', v_s.attempt_limit);
 insert into public.game_attempts(session_id, n, params, zone, submitted_at, hit, valid, request_id, response)
 values(p_session, p_n, jsonb_build_object('keeper', v_keeper - 1, 'reach', v_reach), p_zone - 1, clock_timestamp(), v_goal, true, p_request, v_response);
 update public.game_sessions set attempts_used = p_n, score = (v_response->>'score')::int where id = p_session;
 return v_response;
end $$;

create function public.set_game_center_difficulty(p_game_key text, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.game_center_settings;
begin
 perform private.require_coin_manager();
 if p_difficulty is null or p_difficulty not in ('easy', 'normal', 'hard', 'extreme') then
  raise exception 'GAME_INVALID_LEVEL' using errcode = '22023'; end if;
 update public.game_center_settings set difficulty = p_difficulty, updated_by = auth.uid(), updated_at = now()
 where game_key = p_game_key returning * into s;
 if not found then raise exception 'GAME_NOT_AVAILABLE' using errcode = '22023'; end if;
 return jsonb_build_object('gameId', s.game_key, 'difficulty', s.difficulty, 'updatedAt', s.updated_at);
end $$;

-- Client users a manager can send coins to (active accounts of live clients), with their balance.
create function public.search_sun_coin_recipients(p_query text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
 perform private.require_coin_manager();
 return coalesce((select jsonb_agg(x order by x->>'name') from (
  select distinct on (p.id) jsonb_build_object('userId', p.id, 'name', coalesce(nullif(p.full_name, ''), p.email), 'email', p.email,
   'clientName', c.name, 'balance', private.sun_coin_balance(p.id)) as x
  from public.client_members m
  join public.profiles p on p.id = m.user_id
  join public.clients c on c.id = m.client_id
  where p.status = 'active' and p.deleted_at is null and c.deleted_at is null
   and (q = '' or position(q in lower(coalesce(p.full_name, ''))) > 0 or position(q in lower(coalesce(p.email, ''))) > 0
        or position(q in lower(c.name)) > 0)
  order by p.id
  limit 40) r), '[]'::jsonb);
end $$;

-- A gift from SUN MEDIA: ADMIN_BONUS, once per request id (a retried tap cannot pay twice), the player is notified.
create function public.grant_sun_coin_bonus(p_user uuid, p_amount bigint, p_note text default null, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ref uuid := coalesce(p_request, gen_random_uuid()); v_note text := nullif(trim(coalesce(p_note, '')), ''); v_client uuid;
begin
 perform private.require_coin_manager();
 if p_amount is null or p_amount not between 1 and 100000 then raise exception 'COIN_INVALID_AMOUNT' using errcode = '22023'; end if;
 if v_note is not null and char_length(v_note) > 200 then raise exception 'COIN_INVALID_AMOUNT' using errcode = '22023'; end if;
 select m.client_id into v_client from public.client_members m join public.profiles p on p.id = m.user_id
 join public.clients c on c.id = m.client_id
 where m.user_id = p_user and p.status = 'active' and p.deleted_at is null and c.deleted_at is null order by m.client_id limit 1;
 if v_client is null then raise exception 'COIN_INVALID_RECIPIENT' using errcode = '22023'; end if;
 begin
  insert into public.sun_coin_ledger(user_id, amount, type, source, reference_id, metadata)
  values (p_user, p_amount, 'ADMIN_BONUS', 'ADMIN_GIFT', v_ref, jsonb_build_object('note', v_note, 'grantedBy', auth.uid()));
 exception when unique_violation then
  return jsonb_build_object('userId', p_user, 'amount', p_amount, 'balance', private.sun_coin_balance(p_user), 'duplicate', true);
 end;
 perform private.notify(array[p_user], 'sun_coin.gift', '+' || p_amount || ' SUN Coin sovg''a',
  coalesce(v_note, 'SUN MEDIA sizga SUN Coin sovg''a qildi.'), jsonb_build_object('route', '/account/sun-coin'),
  'sun_coin_ledger', v_ref, v_client);
 return jsonb_build_object('userId', p_user, 'amount', p_amount, 'balance', private.sun_coin_balance(p_user), 'duplicate', false);
end $$;

create or replace function public.get_sun_coin_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_coin_manager();
 return jsonb_build_object('campaigns',coalesce((select jsonb_agg(private.sun_coin_campaign_json(c) order by c.created_at desc) from public.sun_coin_campaigns c),'[]'::jsonb),
 'analytics',(select jsonb_build_object('purchased',coalesce(sum(amount) filter(where type='PURCHASE'),0),
 'spent',-coalesce(sum(amount) filter(where type='GAME_SPEND'),0),'rewarded',coalesce(sum(amount) filter(where type='GAME_REWARD'),0),
 'gifted',coalesce(sum(amount) filter(where type='ADMIN_BONUS'),0),
 'circulating',coalesce(sum(amount),0),'totalWinners',count(distinct user_id) filter(where type='GAME_REWARD')) from public.sun_coin_ledger),
 'packs',coalesce((select jsonb_agg(private.sun_coin_pack_json(p) order by p.sort_order, p.coins) from public.sun_coin_packs p),'[]'::jsonb),
 'purchaseRequests',coalesce((select jsonb_agg(private.sun_coin_request_json(r) || jsonb_build_object('userName', coalesce(nullif(u.full_name,''), u.email), 'clientName', c.name)
   order by (r.status = 'pending') desc, r.created_at desc)
  from (select * from public.sun_coin_purchase_requests order by (status = 'pending') desc, created_at desc limit 50) r
  join public.profiles u on u.id = r.user_id left join public.clients c on c.id = r.client_id),'[]'::jsonb),
 'settings',coalesce((select jsonb_agg(jsonb_build_object('gameId', s.game_key, 'difficulty', s.difficulty, 'updatedAt', s.updated_at)) from public.game_center_settings s),'[]'::jsonb));
end $$;

revoke all on function private.game_center_reach(text), private.game_sessions_reach_snapshot() from public, anon, authenticated;
revoke all on function public.set_game_center_difficulty(text, text), public.search_sun_coin_recipients(text),
 public.grant_sun_coin_bonus(uuid, bigint, text, uuid) from public, anon;
grant execute on function public.set_game_center_difficulty(text, text), public.search_sun_coin_recipients(text),
 public.grant_sun_coin_bonus(uuid, bigint, text, uuid) to authenticated;
