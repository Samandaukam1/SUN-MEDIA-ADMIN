begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table sh_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into sh_ids(key) values ('player'),('staff'),('client');
grant select on sh_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from sh_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@shop-tests.local',jsonb_build_object('full_name',key),'{}'
from sh_ids where key in ('player','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Shop Test','SHTEST');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
update public.sun_coin_packs set is_active=false;
create temp table sh_run(key text primary key, data jsonb);
create function pg_temp.run(k text) returns jsonb language sql as $$select data from sh_run where key=k$$;
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into sh_run values(k,d) on conflict (key) do update set data=excluded.data returning data$$;
create function pg_temp.balance() returns bigint language sql as $$select private.sun_coin_balance(pg_temp.id('player'))$$;

-- Catalogue: only coin managers write it; prices live in the database
select pg_temp.login('player');
select throws_ok($$select public.save_sun_coin_pack('{"coins":50,"priceCents":299}')$$,'42501',null,'a client cannot create packs');
select pg_temp.login('staff');
select pg_temp.keep('p50',public.save_sun_coin_pack('{"coins":50,"priceCents":299,"currency":"usd","sortOrder":1}'));
select pg_temp.keep('p100',public.save_sun_coin_pack('{"coins":100,"priceCents":499,"sortOrder":2}'));
select pg_temp.keep('p500',public.save_sun_coin_pack('{"coins":500,"priceCents":1999,"sortOrder":3,"isActive":false}'));
select is(pg_temp.run('p50')->>'currency','USD','currency normalised');
select throws_ok($$select public.save_sun_coin_pack('{"coins":0,"priceCents":100}')$$,'22023',null,'zero-coin pack refused');
select throws_ok($$select public.save_sun_coin_pack('{"coins":10,"priceCents":-1}')$$,'22023',null,'negative price refused');
select is(public.save_sun_coin_pack(jsonb_build_object('id',pg_temp.run('p100')->>'id','priceCents',599))->>'priceCents','599','manager edits a price');

-- Client shop: active packs only, in order, with the balance
select pg_temp.login('player');
select is((select jsonb_agg(p->'coins') from jsonb_array_elements(public.get_sun_coin_shop()->'packs') p),'[50,100]'::jsonb,'only active packs, sorted');
select is(public.get_sun_coin_shop()->'pending','null'::jsonb,'nothing pending yet');
select throws_ok($$select public.request_sun_coin_purchase((pg_temp.run('p500')->>'id')::uuid)$$,'P0403','COIN_PACK_UNAVAILABLE','inactive pack cannot be requested');

-- Request: a snapshot, no coins yet, staff notified
select pg_temp.keep('r1',public.request_sun_coin_purchase((pg_temp.run('p100')->>'id')::uuid));
select is(pg_temp.run('r1')->>'status','pending','request is pending');
select is((pg_temp.run('r1')->>'priceCents')::int,599,'price snapshot taken');
select is(pg_temp.balance(),0::bigint,'a request credits nothing');
select ok((select count(*) from public.notifications where type='sun_coin.purchase_requested' and entity_id=(pg_temp.run('r1')->>'id')::uuid)>0,'coin managers are notified');
select is(public.request_sun_coin_purchase((pg_temp.run('p100')->>'id')::uuid)->>'id',pg_temp.run('r1')->>'id','repeating the same request returns it');
select throws_ok($$select public.request_sun_coin_purchase((pg_temp.run('p50')->>'id')::uuid)$$,'P0403','COIN_PURCHASE_PENDING','one open request at a time');
select is(public.get_sun_coin_wallet()->'pendingPurchase'->>'id',pg_temp.run('r1')->>'id','wallet shows the open request');
select ok((public.get_sun_coin_wallet()->>'serverNow') is not null,'wallet carries the server clock');
select throws_ok($$select public.fulfill_sun_coin_purchase((pg_temp.run('r1')->>'id')::uuid)$$,'42501',null,'a client cannot confirm its own purchase');

-- Confirmation: PURCHASE credited once, atomically with the status
select pg_temp.login('staff');
select is(public.fulfill_sun_coin_purchase((pg_temp.run('r1')->>'id')::uuid)->>'status','fulfilled','manager confirms payment');
select is(pg_temp.balance(),100::bigint,'100 SC credited');
select results_eq($$select type,amount::int,source from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,
 $$select 'PURCHASE'::text,100,'COIN_SHOP'::text$$,'one PURCHASE ledger entry');
select throws_ok($$select public.fulfill_sun_coin_purchase((pg_temp.run('r1')->>'id')::uuid)$$,'P0403','COIN_PURCHASE_CLOSED','a request is credited only once');
select is(pg_temp.balance(),100::bigint,'still 100 SC');
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(pg_temp.id('player'),100,'PURCHASE','COIN_SHOP',(pg_temp.run('r1')->>'id')::uuid)$$,
 '23505',null,'the ledger itself refuses a second credit for the request');

-- Reject and cancel credit nothing
select pg_temp.login('player');
select pg_temp.keep('r2',public.request_sun_coin_purchase((pg_temp.run('p50')->>'id')::uuid));
select pg_temp.login('staff');
select is(public.reject_sun_coin_purchase((pg_temp.run('r2')->>'id')::uuid,'To‘lov topilmadi')->>'status','rejected','manager rejects');
select pg_temp.login('player');
select is(pg_temp.balance(),100::bigint,'rejected request credits nothing');
select pg_temp.keep('r3',public.request_sun_coin_purchase((pg_temp.run('p50')->>'id')::uuid));
select is(public.cancel_sun_coin_purchase((pg_temp.run('r3')->>'id')::uuid)->>'status','cancelled','player cancels an open request');
select throws_ok($$select public.cancel_sun_coin_purchase((pg_temp.run('r3')->>'id')::uuid)$$,'P0403','COIN_PURCHASE_CLOSED','closed request cannot change');
select pg_temp.login('staff');
select throws_ok($$select public.fulfill_sun_coin_purchase((pg_temp.run('r3')->>'id')::uuid)$$,'P0403','COIN_PURCHASE_CLOSED','a cancelled request cannot be credited');

-- The balance never goes negative, whatever the writer
select throws_ok($$insert into public.sun_coin_ledger(user_id,amount,type,source,reference_id) values(pg_temp.id('player'),-101,'ADJUSTMENT','TEST',gen_random_uuid())$$,
 'P0403','COIN_INSUFFICIENT_BALANCE','an adjustment cannot push the wallet below zero');

-- Free Reward Mode countdown is server time: last free start + 24 hours
update public.game_reward_campaigns set status='ended' where status='active';
insert into public.game_reward_campaigns(game_key,title,status) values('safi-penalty','Shop test','active');
insert into public.game_reward_rules(campaign_id,score,reward_type,amount) select id,5,'SUN_COIN',1 from public.game_reward_campaigns where title='Shop test' and status='active';
select pg_temp.login('player');
select pg_temp.keep('free',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'free'));
select is((public.get_sun_coin_wallet()->'attempt'->>'freeAvailable')::boolean,false,'free attempt used');
select is((public.get_sun_coin_wallet()->'attempt'->>'nextFreeAt')::timestamptz,
 (select started_at+interval '24 hours' from public.game_sessions where id=(pg_temp.run('free')->>'sessionId')::uuid),'next free time = start + 24 h');

-- Analytics include purchases
select pg_temp.login('staff');
select ok((public.get_sun_coin_admin_dashboard()->'analytics'->>'purchased')::int>=100,'purchased appears in analytics');
select ok(jsonb_array_length(public.get_sun_coin_admin_dashboard()->'purchaseRequests')>=3,'requests listed for managers');
select ok(not has_function_privilege('anon','public.request_sun_coin_purchase(uuid)','execute'),'anonymous cannot request');
select * from finish();
rollback;
