-- SUN Coin Shop: packs are a catalogue managed by SUN MEDIA (no prices in code). A client asks for a pack; the
-- payment is settled with SUN MEDIA under the client's contract, and only a manager's confirmation credits the
-- wallet (PURCHASE, once per request). SUN Coin is never exchanged back for money. Additive.

create table public.sun_coin_packs (
 id uuid primary key default gen_random_uuid(),
 coins bigint not null check (coins between 1 and 1000000),
 price_cents bigint not null check (price_cents between 1 and 100000000),
 currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
 is_active boolean not null default true,
 sort_order smallint not null default 0 check (sort_order between 0 and 99),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create trigger sun_coin_packs_updated_at before update on public.sun_coin_packs
 for each row execute function private.set_updated_at();

create table public.sun_coin_purchase_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 client_id uuid references public.clients(id),
 pack_id uuid not null references public.sun_coin_packs(id),
 coins bigint not null check (coins > 0),
 price_cents bigint not null check (price_cents > 0),
 currency text not null,
 status text not null default 'pending' check (status in ('pending','fulfilled','rejected','cancelled')),
 note text check (char_length(note) <= 300),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id)
);
-- One open request per person: no spam, and the app always knows which one is waiting.
create unique index sun_coin_one_pending_purchase_idx on public.sun_coin_purchase_requests(user_id) where status = 'pending';
create index sun_coin_purchase_requests_created_idx on public.sun_coin_purchase_requests(created_at desc);

alter table public.sun_coin_packs enable row level security;
alter table public.sun_coin_purchase_requests enable row level security;
revoke all on public.sun_coin_packs, public.sun_coin_purchase_requests from anon, authenticated;
grant select on public.sun_coin_packs, public.sun_coin_purchase_requests to authenticated;
create policy "active packs or coin managers" on public.sun_coin_packs for select to authenticated
 using (is_active or ((select private.is_staff()) and (select private.has_permission('promo.manage'))));
create policy "own purchase requests or coin managers" on public.sun_coin_purchase_requests for select to authenticated
 using (user_id = (select auth.uid()) or ((select private.is_staff()) and (select private.has_permission('promo.manage'))));

create function private.sun_coin_pack_json(p public.sun_coin_packs) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id', p.id, 'coins', p.coins, 'priceCents', p.price_cents, 'currency', p.currency,
  'isActive', p.is_active, 'sortOrder', p.sort_order);
$$;
create function private.sun_coin_request_json(r public.sun_coin_purchase_requests) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id', r.id, 'packId', r.pack_id, 'coins', r.coins, 'priceCents', r.price_cents, 'currency', r.currency,
  'status', r.status, 'note', r.note, 'createdAt', r.created_at, 'resolvedAt', r.resolved_at);
$$;

-- Client: the shop and the request.
create function public.get_sun_coin_shop() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_game_client();
 return jsonb_build_object(
  'packs', coalesce((select jsonb_agg(private.sun_coin_pack_json(p) order by p.sort_order, p.coins) from public.sun_coin_packs p where p.is_active), '[]'::jsonb),
  'pending', (select private.sun_coin_request_json(r) from public.sun_coin_purchase_requests r where r.user_id = auth.uid() and r.status = 'pending'),
  'balance', private.sun_coin_balance(auth.uid()));
end $$;

create function public.request_sun_coin_purchase(p_pack uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_client uuid; p public.sun_coin_packs; r public.sun_coin_purchase_requests; v_name text;
begin
 v_client := private.require_game_client();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 731));
 select * into r from public.sun_coin_purchase_requests where user_id = auth.uid() and status = 'pending';
 if found then
  if r.pack_id is distinct from p_pack then raise exception 'COIN_PURCHASE_PENDING' using errcode = 'P0403'; end if;
  return private.sun_coin_request_json(r);
 end if;
 select * into p from public.sun_coin_packs where id = p_pack and is_active;
 if not found then raise exception 'COIN_PACK_UNAVAILABLE' using errcode = 'P0403'; end if;
 insert into public.sun_coin_purchase_requests(user_id, client_id, pack_id, coins, price_cents, currency)
 values (auth.uid(), v_client, p.id, p.coins, p.price_cents, p.currency) returning * into r;
 select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
 perform private.notify(
  private.users_with_permission('promo.manage'), 'sun_coin.purchase_requested',
  coalesce(v_name, 'Mijoz') || ': ' || p.coins || ' SC xarid so''rovi',
  'Paket: ' || p.coins || ' SC · ' || to_char(p.price_cents / 100.0, 'FM999999990.00') || ' ' || p.currency,
  jsonb_build_object('route', '/clients/games/safi-penalty/rewards/sun-coin'), 'sun_coin_purchase_requests', r.id, v_client);
 return private.sun_coin_request_json(r);
end $$;

create function public.cancel_sun_coin_purchase(p_request uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.sun_coin_purchase_requests;
begin
 perform private.require_game_client();
 update public.sun_coin_purchase_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
 where id = p_request and user_id = auth.uid() and status = 'pending' returning * into r;
 if not found then raise exception 'COIN_PURCHASE_CLOSED' using errcode = 'P0403'; end if;
 return private.sun_coin_request_json(r);
end $$;

-- SUN MEDIA: the catalogue and the confirmation of paid requests.
create function public.save_sun_coin_pack(p_pack jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.sun_coin_packs;
begin
 perform private.require_coin_manager();
 if p_pack is null or jsonb_typeof(p_pack) <> 'object' then raise exception 'COIN_INVALID_PACK' using errcode = '22023'; end if;
 begin
  if p_pack ? 'id' then
   update public.sun_coin_packs set
    coins = coalesce((p_pack->>'coins')::bigint, coins),
    price_cents = coalesce((p_pack->>'priceCents')::bigint, price_cents),
    currency = coalesce(upper(p_pack->>'currency'), currency),
    is_active = coalesce((p_pack->>'isActive')::boolean, is_active),
    sort_order = coalesce((p_pack->>'sortOrder')::smallint, sort_order)
   where id = (p_pack->>'id')::uuid returning * into p;
   if not found then raise exception 'COIN_INVALID_PACK' using errcode = '22023'; end if;
  else
   insert into public.sun_coin_packs(coins, price_cents, currency, is_active, sort_order, created_by)
   values ((p_pack->>'coins')::bigint, (p_pack->>'priceCents')::bigint, coalesce(upper(p_pack->>'currency'), 'USD'),
    coalesce((p_pack->>'isActive')::boolean, true), coalesce((p_pack->>'sortOrder')::smallint, 0), auth.uid()) returning * into p;
  end if;
 exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'COIN_INVALID_PACK' using errcode = '22023';
 end;
 return private.sun_coin_pack_json(p);
end $$;

create function public.fulfill_sun_coin_purchase(p_request uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.sun_coin_purchase_requests;
begin
 perform private.require_coin_manager();
 select * into r from public.sun_coin_purchase_requests where id = p_request for update;
 if not found or r.status <> 'pending' then raise exception 'COIN_PURCHASE_CLOSED' using errcode = 'P0403'; end if;
 -- The credit and the status change are one transaction; the ledger key allows one PURCHASE per request.
 insert into public.sun_coin_ledger(user_id, amount, type, source, reference_id, metadata)
 values (r.user_id, r.coins, 'PURCHASE', 'COIN_SHOP', r.id,
  jsonb_build_object('requestId', r.id, 'packId', r.pack_id, 'priceCents', r.price_cents, 'currency', r.currency, 'confirmedBy', auth.uid()));
 update public.sun_coin_purchase_requests set status = 'fulfilled', resolved_at = now(), resolved_by = auth.uid()
 where id = r.id returning * into r;
 perform private.notify(array[r.user_id], 'sun_coin.purchase_fulfilled', '+' || r.coins || ' SUN Coin hisobingizga tushdi',
  'Xarid tasdiqlandi.', jsonb_build_object('route', '/account/sun-coin'), 'sun_coin_purchase_requests', r.id, r.client_id);
 return private.sun_coin_request_json(r);
end $$;

create function public.reject_sun_coin_purchase(p_request uuid, p_note text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.sun_coin_purchase_requests;
begin
 perform private.require_coin_manager();
 update public.sun_coin_purchase_requests set status = 'rejected', note = nullif(trim(p_note), ''), resolved_at = now(), resolved_by = auth.uid()
 where id = p_request and status = 'pending' returning * into r;
 if not found then raise exception 'COIN_PURCHASE_CLOSED' using errcode = 'P0403'; end if;
 perform private.notify(array[r.user_id], 'sun_coin.purchase_rejected', 'SUN Coin xarid so''rovi rad etildi',
  coalesce(r.note, 'Batafsil ma''lumot uchun SUN MEDIA bilan bog''laning.'), jsonb_build_object('route', '/account/sun-coin'),
  'sun_coin_purchase_requests', r.id, r.client_id);
 return private.sun_coin_request_json(r);
end $$;

create or replace function public.get_sun_coin_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_coin_manager();
 return jsonb_build_object('campaigns',coalesce((select jsonb_agg(private.sun_coin_campaign_json(c) order by c.created_at desc) from public.sun_coin_campaigns c),'[]'::jsonb),
 'analytics',(select jsonb_build_object('purchased',coalesce(sum(amount) filter(where type='PURCHASE'),0),
 'spent',-coalesce(sum(amount) filter(where type='GAME_SPEND'),0),'rewarded',coalesce(sum(amount) filter(where type='GAME_REWARD'),0),
 'circulating',coalesce(sum(amount),0),'totalWinners',count(distinct user_id) filter(where type='GAME_REWARD')) from public.sun_coin_ledger),
 'packs',coalesce((select jsonb_agg(private.sun_coin_pack_json(p) order by p.sort_order, p.coins) from public.sun_coin_packs p),'[]'::jsonb),
 'purchaseRequests',coalesce((select jsonb_agg(private.sun_coin_request_json(r) || jsonb_build_object('userName', coalesce(nullif(u.full_name,''), u.email), 'clientName', c.name)
   order by (r.status = 'pending') desc, r.created_at desc)
  from (select * from public.sun_coin_purchase_requests order by (status = 'pending') desc, created_at desc limit 50) r
  join public.profiles u on u.id = r.user_id left join public.clients c on c.id = r.client_id),'[]'::jsonb));
end $$;

-- The wallet also carries the server clock, so countdowns do not trust the device clock, and the open purchase.
create or replace function public.get_sun_coin_wallet(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare last_free timestamptz; active public.game_sessions; c public.sun_coin_campaigns; g public.game_campaigns; cj jsonb; gj jsonb;
begin
 perform private.require_game_client();
 select max(started_at) into last_free from public.game_sessions where user_id=auth.uid() and game_key='safi-penalty' and entry_mode='free';
 select * into active from public.game_sessions where user_id=auth.uid() and game_key='safi-penalty' and status='playing' and expires_at>now() order by started_at desc limit 1;
 select * into c from public.sun_coin_campaigns sc where sc.game_key='safi-penalty' and sc.status='active' and sc.starts_at<=now() and (sc.ends_at is null or sc.ends_at>now())
 and exists(select 1 from public.sun_coin_reward_options o where o.campaign_id=sc.id and o.amount<=sc.total_pool-sc.distributed and (o.quantity is null or o.awarded<o.quantity)) limit 1;
 if c.id is not null then
 cj:=jsonb_build_object('id',c.id,'title',c.title,'minimumScore',c.minimum_score,'strategy',c.strategy,'remaining',c.total_pool-c.distributed,
 'options',(select jsonb_agg(jsonb_build_object('amount',o.amount,'minScore',o.min_score,'maxScore',o.max_score) order by o.sort_order)
 from public.sun_coin_reward_options o where o.campaign_id=c.id and o.amount<=c.total_pool-c.distributed and (o.quantity is null or o.awarded<o.quantity)));
 end if;
 select * into g from public.game_campaigns p where p.template='penalty' and p.attempts=10 and p.target_score<=10
 and p.client_id=any(private.member_client_ids()) and p.is_active and p.starts_at<=now() and (p.ends_at is null or p.ends_at>now())
 and (p.max_rewards_total is null or p.rewards_given<p.max_rewards_total)
 and (select count(*) from public.game_sessions s where s.campaign_id=p.id and s.user_id=auth.uid() and s.won)<p.max_wins_per_user
 order by p.starts_at desc,p.id limit 1;
 if g.id is not null then gj:=jsonb_build_object('id',g.id,'title',g.title,'targetScore',g.target_score,'rewardDays',g.reward_days); end if;
 return jsonb_build_object('balance',private.sun_coin_balance(auth.uid()),'serverNow',clock_timestamp(),'transactions',coalesce((select jsonb_agg(jsonb_build_object(
 'id',l.id,'userId',l.user_id,'amount',l.amount,'type',l.type,'source',l.source,'referenceId',l.reference_id,'createdAt',l.created_at,'metadata',l.metadata) order by l.created_at desc)
 from (select * from public.sun_coin_ledger where user_id=auth.uid() order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),100))) l),'[]'::jsonb),
 'attempt',jsonb_build_object('gameId','safi-penalty','freeAvailable',last_free is null or last_free+interval '24 hours'<=now(),
 'nextFreeAt',case when last_free+interval '24 hours'>now() then last_free+interval '24 hours' end,'cost',10,
 'activeSession',case when active.id is not null then private.center_session_json(active) end),
 'campaignAvailable',c.id is not null or g.id is not null,'campaign',cj,'proCampaign',gj,
 'pendingPurchase',(select private.sun_coin_request_json(r) from public.sun_coin_purchase_requests r where r.user_id=auth.uid() and r.status='pending'));
end $$;

revoke all on function private.sun_coin_pack_json(public.sun_coin_packs), private.sun_coin_request_json(public.sun_coin_purchase_requests) from public, anon, authenticated;
revoke all on function public.get_sun_coin_shop(), public.request_sun_coin_purchase(uuid), public.cancel_sun_coin_purchase(uuid),
 public.save_sun_coin_pack(jsonb), public.fulfill_sun_coin_purchase(uuid), public.reject_sun_coin_purchase(uuid, text) from public, anon;
grant execute on function public.get_sun_coin_shop(), public.request_sun_coin_purchase(uuid), public.cancel_sun_coin_purchase(uuid),
 public.save_sun_coin_pack(jsonb), public.fulfill_sun_coin_purchase(uuid), public.reject_sun_coin_purchase(uuid, text) to authenticated;
