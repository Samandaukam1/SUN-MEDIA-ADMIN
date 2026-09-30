-- SUN Coin is a shared, append-only virtual-currency ledger. Game admission,
-- inventory allocation and ledger postings are transactionally serialized.
-- No gameplay / goalkeeper / shot selection logic changes in this migration.
create table public.sun_coin_campaigns (
 id uuid primary key default gen_random_uuid(),
 game_key text not null check (game_key ~ '^[a-z][a-z0-9-]{1,63}$'),
 title text not null check (char_length(title) between 1 and 100),
 status text not null default 'draft' check (status in ('draft','active','paused','ended')),
 total_pool bigint not null check (total_pool between 1 and 1000000000),
 distributed bigint not null default 0 check (distributed >= 0 and distributed <= total_pool),
 minimum_score smallint not null default 5 check (minimum_score between 0 and 10),
 strategy text not null default 'FIRST_ELIGIBLE' check (strategy in ('FIRST_ELIGIBLE','WEIGHTED_RANDOM')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ends_at is null or ends_at > starts_at)
);
create unique index sun_coin_one_active_game_idx on public.sun_coin_campaigns(game_key) where status='active';
create index sun_coin_campaigns_created_idx on public.sun_coin_campaigns(created_at desc);
create table public.sun_coin_reward_options (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.sun_coin_campaigns(id),
 amount bigint not null check(amount between 1 and 1000000000),
 quantity bigint check(quantity between 1 and 1000000000),
 awarded bigint not null default 0 check(awarded >= 0 and (quantity is null or awarded <= quantity)),
 weight bigint not null default 1 check(weight between 1 and 1000000000),
 min_score smallint not null default 0 check(min_score between 0 and 10),
 max_score smallint not null default 10 check(max_score between 0 and 10 and max_score >= min_score),
 sort_order smallint not null check(sort_order between 0 and 29),
 unique(campaign_id,sort_order)
);
create table public.sun_coin_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 amount bigint not null check(amount <> 0 and amount between -1000000000 and 1000000000),
 type text not null check(type in ('PURCHASE','GAME_REWARD','ADMIN_BONUS','GAME_SPEND','REFUND','PROMO','ADJUSTMENT')),
 source text not null check(char_length(source) between 1 and 100),
 reference_id uuid not null,
 game_session_id uuid, -- immutable audit reference, deliberately survives session retention
 campaign_id uuid references public.sun_coin_campaigns(id),
 reward_id uuid references public.sun_coin_reward_options(id),
 created_at timestamptz not null default clock_timestamp(),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
 unique(user_id,type,source,reference_id),
 check((type='GAME_SPEND' and amount < 0) or (type='ADJUSTMENT') or (type <> 'GAME_SPEND' and amount > 0)),
 check(type <> 'GAME_REWARD' or (game_session_id is not null and campaign_id is not null and reward_id is not null)),
 check(type <> 'GAME_SPEND' or game_session_id is not null)
);
create unique index sun_coin_reward_session_idx on public.sun_coin_ledger(game_session_id) where type='GAME_REWARD';
create unique index sun_coin_spend_session_idx on public.sun_coin_ledger(game_session_id) where type='GAME_SPEND';
create index sun_coin_ledger_user_created_idx on public.sun_coin_ledger(user_id,created_at desc);
create index sun_coin_ledger_campaign_idx on public.sun_coin_ledger(campaign_id) where campaign_id is not null;
create index sun_coin_ledger_reward_idx on public.sun_coin_ledger(reward_id) where reward_id is not null;
alter table public.game_sessions
 add column coin_campaign_id uuid references public.sun_coin_campaigns(id),
 add column entry_mode text not null default 'legacy' check(entry_mode in ('legacy','practice','free','paid')),
 add column pro_reward_eligible boolean,
 add column coin_reward_eligible boolean not null default false;
create index game_sessions_free_attempt_idx on public.game_sessions(user_id,game_key,started_at desc) where entry_mode='free';
create index game_sessions_coin_campaign_idx on public.game_sessions(coin_campaign_id) where coin_campaign_id is not null;

create function private.sun_coin_balance(p_user uuid) returns bigint language sql stable set search_path='' as $$
 select coalesce(sum(amount),0)::bigint from public.sun_coin_ledger where user_id=p_user;
$$;
create function private.sun_coin_ledger_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op <> 'INSERT' then raise exception 'COIN_LEDGER_IMMUTABLE' using errcode='42501'; end if;
 -- Every writer (including future payment/refund integrations) shares the user lock.
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,731));
 if private.sun_coin_balance(new.user_id)+new.amount < 0 then
  raise exception 'COIN_INSUFFICIENT_BALANCE' using errcode='P0403'; end if;
 return new;
end $$;
create trigger sun_coin_ledger_guard before insert or update or delete on public.sun_coin_ledger
 for each row execute function private.sun_coin_ledger_guard();
create trigger sun_coin_campaigns_updated_at before update on public.sun_coin_campaigns
 for each row execute function private.set_updated_at();
alter table public.sun_coin_ledger enable row level security;
alter table public.sun_coin_campaigns enable row level security;
alter table public.sun_coin_reward_options enable row level security;
revoke all on public.sun_coin_ledger,public.sun_coin_campaigns,public.sun_coin_reward_options from anon,authenticated;
grant select on public.sun_coin_ledger,public.sun_coin_campaigns,public.sun_coin_reward_options to authenticated;
create policy "coin owner or manager reads ledger" on public.sun_coin_ledger for select to authenticated
 using(user_id=(select auth.uid()) or ((select private.is_staff()) and (select private.has_permission('promo.manage'))));
create policy "coin managers read campaigns" on public.sun_coin_campaigns for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));
create policy "coin managers read options" on public.sun_coin_reward_options for select to authenticated
 using((select private.is_staff()) and (select private.has_permission('promo.manage')));

create function private.sun_coin_campaign_json(c public.sun_coin_campaigns) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'gameId',c.game_key,'title',c.title,'status',c.status,
 'totalPool',c.total_pool,'distributed',c.distributed,'remaining',c.total_pool-c.distributed,
 'minimumScore',c.minimum_score,'strategy',c.strategy,'startsAt',c.starts_at,'endsAt',c.ends_at,'createdAt',c.created_at,
 'totalWinners',(select count(*) from public.sun_coin_ledger where campaign_id=c.id and type='GAME_REWARD'),
 'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'amount',o.amount,'quantity',o.quantity,
 'awarded',o.awarded,'weight',o.weight,'minScore',o.min_score,'maxScore',o.max_score,'sortOrder',o.sort_order) order by o.sort_order)
 from public.sun_coin_reward_options o where o.campaign_id=c.id),'[]'::jsonb));
$$;
create function private.require_coin_manager() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_staff() or not private.has_permission('promo.manage') then
 raise exception 'Coin campaigns require promo.manage' using errcode='42501'; end if;
end $$;
create function public.create_sun_coin_campaign(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.sun_coin_campaigns; o jsonb; i int:=0; cost numeric:=0;
begin
 perform private.require_coin_manager();
 if p_config is null or jsonb_typeof(p_config)<>'object' or jsonb_typeof(p_config->'options') is distinct from 'array'
  or jsonb_array_length(p_config->'options') not between 1 and 30
  or coalesce(p_config->>'status','draft') not in ('draft','active') then
  raise exception 'COIN_INVALID_CONFIG' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_config->>'gameId',''),732));
 if p_config->>'status'='active' and exists(select 1 from public.sun_coin_campaigns where game_key=p_config->>'gameId' and status='active') then
 raise exception 'COIN_CAMPAIGN_ALREADY_ACTIVE' using errcode='P0403'; end if;
 begin
 insert into public.sun_coin_campaigns(game_key,title,status,total_pool,minimum_score,strategy,starts_at,ends_at,created_by)
 values(p_config->>'gameId',trim(p_config->>'title'),coalesce(p_config->>'status','draft'),(p_config->>'totalPool')::bigint,
 coalesce((p_config->>'minimumScore')::smallint,5),coalesce(p_config->>'strategy','FIRST_ELIGIBLE'),
 coalesce((p_config->>'startsAt')::timestamptz,now()),(p_config->>'endsAt')::timestamptz,auth.uid()) returning * into c;
 for o in select value from jsonb_array_elements(p_config->'options') loop
  if jsonb_typeof(o)<>'object' or (o->>'amount')::bigint > c.total_pool then raise check_violation; end if;
  insert into public.sun_coin_reward_options(campaign_id,amount,quantity,weight,min_score,max_score,sort_order)
  values(c.id,(o->>'amount')::bigint,(o->>'quantity')::bigint,coalesce((o->>'weight')::bigint,1),
   coalesce((o->>'minScore')::smallint,0),coalesce((o->>'maxScore')::smallint,10),i);
  cost:=cost+coalesce((o->>'amount')::numeric*(o->>'quantity')::numeric,0); i:=i+1;
 end loop;
 if cost>c.total_pool then raise check_violation; end if;
 exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
  raise exception 'COIN_INVALID_CONFIG' using errcode='22023';
 end;
 return private.sun_coin_campaign_json(c);
end $$;
create function public.set_sun_coin_campaign_status(p_campaign uuid,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.sun_coin_campaigns; k text;
begin
 perform private.require_coin_manager();
 select game_key into k from public.sun_coin_campaigns where id=p_campaign;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(k,''),732));
 select * into c from public.sun_coin_campaigns where id=p_campaign for update;
 if not found or p_status is null or p_status not in ('active','paused','ended') or c.status='ended'
 or (c.status='draft' and p_status='paused') then raise exception 'COIN_INVALID_TRANSITION' using errcode='P0403'; end if;
 if p_status='active' and exists(select 1 from public.sun_coin_campaigns where game_key=c.game_key and status='active' and id<>c.id) then
 raise exception 'COIN_CAMPAIGN_ALREADY_ACTIVE' using errcode='P0403'; end if;
 update public.sun_coin_campaigns set status=p_status where id=c.id returning * into c;
 return private.sun_coin_campaign_json(c);
end $$;
create function public.get_sun_coin_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_coin_manager();
 return jsonb_build_object('campaigns',coalesce((select jsonb_agg(private.sun_coin_campaign_json(c) order by c.created_at desc) from public.sun_coin_campaigns c),'[]'::jsonb),
 'analytics',(select jsonb_build_object('purchased',coalesce(sum(amount) filter(where type='PURCHASE'),0),
 'spent',-coalesce(sum(amount) filter(where type='GAME_SPEND'),0),'rewarded',coalesce(sum(amount) filter(where type='GAME_REWARD'),0),
 'circulating',coalesce(sum(amount),0),'totalWinners',count(distinct user_id) filter(where type='GAME_REWARD')) from public.sun_coin_ledger));
end $$;

create or replace function private.center_session_json(s public.game_sessions) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('sessionId',s.id,'gameId',s.game_key,'attempts',s.attempt_limit,
 'score',s.score,'attemptsUsed',s.attempts_used,'rewardEligible',s.reward_eligible,'rewardReason',s.reward_reason,
 'expiresAt',s.expires_at,'targetScore',s.target_snapshot,'mode',s.entry_mode,
 'proRewardEligible',coalesce(s.pro_reward_eligible,s.reward_eligible),'coinRewardEligible',s.coin_reward_eligible,
 'coinCampaignId',s.coin_campaign_id,'coinBalance',private.sun_coin_balance(s.user_id));
$$;
create function public.get_sun_coin_wallet(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 return jsonb_build_object('balance',private.sun_coin_balance(auth.uid()),'transactions',coalesce((select jsonb_agg(jsonb_build_object(
 'id',l.id,'userId',l.user_id,'amount',l.amount,'type',l.type,'source',l.source,'referenceId',l.reference_id,'createdAt',l.created_at,'metadata',l.metadata) order by l.created_at desc)
 from (select * from public.sun_coin_ledger where user_id=auth.uid() order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),100))) l),'[]'::jsonb),
 'attempt',jsonb_build_object('gameId','safi-penalty','freeAvailable',last_free is null or last_free+interval '24 hours'<=now(),
 'nextFreeAt',case when last_free+interval '24 hours'>now() then last_free+interval '24 hours' end,'cost',10,
 'activeSession',case when active.id is not null then private.center_session_json(active) end),
 'campaignAvailable',c.id is not null or g.id is not null,'campaign',cj,'proCampaign',gj);
end $$;

create function public.game_center_start_mode(p_game_key text,p_request uuid,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare client uuid; s public.game_sessions; c public.sun_coin_campaigns; g public.game_campaigns;
 last_free timestamptz; pro_ok boolean:=false; pro_reason text:='NO_CAMPAIGN'; wins int; plays int;
 guaranteed boolean:=false; draw boolean:=false;
begin
 client:=private.require_game_client();
 if p_game_key is distinct from 'safi-penalty' or p_request is null then raise exception 'GAME_NOT_AVAILABLE' using errcode='22023'; end if;
 if p_mode is null or p_mode not in ('practice','free','paid') then raise exception 'GAME_INVALID_MODE' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
 select * into s from public.game_sessions where user_id=auth.uid() and start_request=p_request;
 if found then
  if s.game_key<>p_game_key or (s.entry_mode<>p_mode and s.entry_mode<>'legacy') then raise exception 'GAME_REQUEST_CONFLICT' using errcode='22023'; end if;
  return private.center_session_json(s);
 end if;
 -- A reconnect or mode button cannot erase an active reward round or debit a second fee. A practice round
 -- carries nothing, so choosing Reward Mode closes it (inside this transaction: a refused start keeps it).
 select * into s from public.game_sessions where user_id=auth.uid() and game_key=p_game_key and status='playing' and expires_at>now() order by started_at desc limit 1;
 if found then
  if s.entry_mode='practice' and p_mode<>'practice' then
   update public.game_sessions set status='expired',finished_at=clock_timestamp() where id=s.id;
  else
   return private.center_session_json(s);
  end if;
 end if;
 if p_mode<>'practice' then
  select * into c from public.sun_coin_campaigns sc where sc.game_key=p_game_key and sc.status='active' and sc.starts_at<=now() and (sc.ends_at is null or sc.ends_at>now())
   and exists(select 1 from public.sun_coin_reward_options o where o.campaign_id=sc.id and o.amount<=sc.total_pool-sc.distributed and (o.quantity is null or o.awarded<o.quantity)) limit 1;
  select * into g from public.game_campaigns p where p.template='penalty' and p.attempts=10 and p.target_score<=10
   and p.client_id=any(private.member_client_ids()) and p.is_active and p.starts_at<=now() and (p.ends_at is null or p.ends_at>now()) order by p.starts_at desc,p.id limit 1 for update;
  if g.id is not null then
   client:=g.client_id;
   select count(*) filter(where won),count(*) filter(where coalesce(pro_reward_eligible,reward_eligible)) into wins,plays
    from public.game_sessions where campaign_id=g.id and user_id=auth.uid();
   pro_reason:=case when g.max_rewards_total is not null and g.rewards_given>=g.max_rewards_total then 'SOLD_OUT' when wins>=g.max_wins_per_user then 'MAX_WINS' end;
   pro_ok:=pro_reason is null;
   if pro_ok then
    guaranteed:=(g.win_mode='first_play_guaranteed' and plays=0) or (g.win_mode='next_player_guaranteed' and g.guarantee_next);
    if g.win_mode='next_player_guaranteed' and guaranteed then update public.game_campaigns set guarantee_next=false where id=g.id; end if;
    draw:=guaranteed or g.win_mode='skill' or random()<g.win_probability;
   end if;
  end if;
  if c.id is null and not pro_ok then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode='P0403'; end if;
  if p_mode='free' then
   select max(started_at) into last_free from public.game_sessions where user_id=auth.uid() and game_key=p_game_key and entry_mode='free';
   if last_free+interval '24 hours'>now() then raise exception 'GAME_FREE_COOLDOWN' using errcode='P0403'; end if;
  elsif private.sun_coin_balance(auth.uid())<10 then raise exception 'COIN_INSUFFICIENT_BALANCE' using errcode='P0403'; end if;
 end if;
 insert into public.game_sessions(campaign_id,user_id,client_id,workspace_id,eligible,guaranteed,game_key,start_request,
 attempt_limit,target_snapshot,reward_eligible,reward_reason,entry_mode,pro_reward_eligible,coin_campaign_id,coin_reward_eligible)
 values(g.id,auth.uid(),client,private.client_workspace_id(client),draw,guaranteed,p_game_key,p_request,10,coalesce(g.target_score,7),
 p_mode<>'practice',case when p_mode='practice' then 'PRACTICE' when not pro_ok and c.id is null then pro_reason end,p_mode,pro_ok,c.id,c.id is not null) returning * into s;
 if p_mode='paid' then
  insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,game_session_id,metadata)
  values(auth.uid(),-10,'GAME_SPEND','SAFI_PENALTY_REWARD_ATTEMPT',s.id,s.id,jsonb_build_object('gameId',p_game_key,'gameSessionId',s.id,'requestId',p_request));
 end if;
 return private.center_session_json(s);
end $$;

create or replace function public.game_center_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.game_sessions; c public.sun_coin_campaigns; o public.sun_coin_reward_options;
 v_score int; response jsonb; boxes boolean; v_amount bigint:=0; draw double precision; total_weight bigint;
begin
 perform private.require_game_client();
 -- Shared lock order is user -> session -> campaign -> ledger; concurrent sessions
 -- cannot overdraw a wallet, and concurrent users cannot exhaust one pool twice.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
 select * into s from public.game_sessions where id=p_session and user_id=auth.uid() and game_key='safi-penalty' for update;
 if not found or not(s.client_id=any(private.member_client_ids())) then raise exception 'GAME_SESSION_CLOSED' using errcode='P0403'; end if;
 if s.finish_response is not null then return s.finish_response; end if;
 if s.status<>'playing' or s.expires_at<=now() then raise exception 'GAME_SESSION_CLOSED' using errcode='P0403'; end if;
 if s.attempts_used<>s.attempt_limit then raise exception 'GAME_INCOMPLETE' using errcode='P0403'; end if;
 select count(*) filter(where hit and valid) into v_score from public.game_attempts where session_id=p_session;
 boxes:=coalesce(s.pro_reward_eligible,s.reward_eligible) and (s.guaranteed or v_score>=s.target_snapshot);
 if s.entry_mode in ('free','paid') and s.reward_eligible and s.coin_reward_eligible and s.coin_campaign_id is not null then
  select * into c from public.sun_coin_campaigns where id=s.coin_campaign_id for update;
  if c.status='active' and c.starts_at<=now() and (c.ends_at is null or c.ends_at>now()) and v_score>=c.minimum_score then
   if c.strategy='FIRST_ELIGIBLE' then
    select * into o from public.sun_coin_reward_options where campaign_id=c.id and amount<=c.total_pool-c.distributed
      and (quantity is null or awarded<quantity) and v_score between min_score and max_score order by sort_order,id limit 1;
   else
    select sum(weight) into total_weight from public.sun_coin_reward_options where campaign_id=c.id and amount<=c.total_pool-c.distributed
      and (quantity is null or awarded<quantity) and v_score between min_score and max_score;
    draw:=random()*coalesce(total_weight,0);
    select opt.* into o from public.sun_coin_reward_options opt join (
     select id,sum(weight) over(order by sort_order,id) as ceiling from public.sun_coin_reward_options where campaign_id=c.id
      and amount<=c.total_pool-c.distributed and (quantity is null or awarded<quantity) and v_score between min_score and max_score
    ) ranges using(id) where ranges.ceiling>draw order by opt.sort_order,opt.id limit 1;
   end if;
   if o.id is not null then
    v_amount:=o.amount;
    update public.sun_coin_campaigns set distributed=distributed+v_amount where id=c.id;
    update public.sun_coin_reward_options set awarded=awarded+1 where id=o.id;
    insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id,game_session_id,campaign_id,reward_id,metadata)
     values(s.user_id,v_amount,'GAME_REWARD','SAFI_PENALTY',s.id,s.id,c.id,o.id,
      jsonb_build_object('gameId',s.game_key,'gameSessionId',s.id,'campaignId',c.id,'rewardId',o.id,'score',v_score));
   end if;
  end if;
 end if;
 response:=jsonb_build_object('score',v_score,'attempts',s.attempt_limit,'boxes',boxes,'flagged',false,
 'coinAmount',v_amount,'coinBalance',private.sun_coin_balance(s.user_id),'coinCampaignId',case when v_amount>0 then c.id end,'coinRewardId',o.id);
 update public.game_sessions set status='finished',score=v_score,finished_at=clock_timestamp(),won=boxes and eligible,finish_response=response where id=p_session;
 return response;
end $$;
create or replace function public.game_center_claim(p_session uuid,p_box integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.game_sessions;
begin
 perform private.require_game_client();
 if p_box is null or p_box not between 0 and 2 then raise exception 'GAME_INVALID_BOX' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
 select * into s from public.game_sessions where id=p_session and user_id=auth.uid() and game_key='safi-penalty' for update;
 if not found or s.status<>'finished' or not coalesce(s.pro_reward_eligible,s.reward_eligible) or not coalesce((s.finish_response->>'boxes')::boolean,false)
 or not(s.client_id=any(private.member_client_ids())) then raise exception 'GAME_REWARD_UNAVAILABLE' using errcode='P0403'; end if;
 return public.game_open_box(p_session,p_box::smallint);
end $$;

-- The original Game Center entry (no mode) opens a practice round. Reward rounds are only the daily free
-- attempt or a paid one, through game_center_start_mode — otherwise campaign cooldowns would be free rewards.
create or replace function public.game_center_start(p_game_key text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_game_client();
 return public.game_center_start_mode(p_game_key,p_request,'practice');
end $$;

revoke all on function private.sun_coin_balance(uuid),private.sun_coin_ledger_guard(),private.sun_coin_campaign_json(public.sun_coin_campaigns),private.require_coin_manager() from public,anon,authenticated;
revoke all on function public.create_sun_coin_campaign(jsonb),public.set_sun_coin_campaign_status(uuid,text),public.get_sun_coin_admin_dashboard(),public.get_sun_coin_wallet(integer),public.game_center_start_mode(text,uuid,text) from public,anon;
grant execute on function public.create_sun_coin_campaign(jsonb),public.set_sun_coin_campaign_status(uuid,text),public.get_sun_coin_admin_dashboard(),public.get_sun_coin_wallet(integer),public.game_center_start_mode(text,uuid,text) to authenticated;
