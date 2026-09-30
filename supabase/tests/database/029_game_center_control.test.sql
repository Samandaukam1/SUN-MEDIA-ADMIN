begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create temp table gcc_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into gcc_ids(key) values ('player'),('staff'),('client'),('gift');
grant select on gcc_ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from gcc_ids where key=k$$;
create function pg_temp.login(k text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(k),'role','authenticated')::text,true)::text$$;
insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',key||'.'||left(id::text,8)||'@control-tests.local',jsonb_build_object('full_name','Control '||key),'{}'
from gcc_ids where key in ('player','staff');
insert into public.user_roles(user_id,role_id) select pg_temp.id('staff'),id from public.roles where key='admin';
insert into public.employees(user_id) values(pg_temp.id('staff'));
insert into public.clients(id,name,code) values(pg_temp.id('client'),'Control Client','GCCTEST');
insert into public.client_members(client_id,user_id,role_id) select pg_temp.id('client'),pg_temp.id('player'),id from public.roles where key='client_owner';
update public.game_center_settings set difficulty='easy';
create temp table gcc_run(key text primary key, data jsonb);
grant select on gcc_run to authenticated;
create function pg_temp.run(k text) returns jsonb language sql as $$select data from gcc_run where key=k$$;
create function pg_temp.keep(k text,d jsonb) returns jsonb language sql as $$insert into gcc_run values(k,d) on conflict (key) do update set data=excluded.data returning data$$;
-- Shoot the zone next to where the keeper will dive (same row, one column over).
create function pg_temp.shoot_next_to_keeper(sid uuid, n int) returns jsonb language plpgsql as $$
declare k int; z int;
begin
 perform setseed(.29); k := floor(random()*15)::int + 1; perform setseed(.29);
 z := case when (k - 1) % 5 = 4 then k - 1 else k + 1 end;
 return public.game_center_shoot(sid, gen_random_uuid(), n, z);
end $$;

-- Level: readable by everyone, changed only by coin managers
select pg_temp.login('player');
select is((select difficulty from public.game_center_settings where game_key='safi-penalty'),'easy','players can read the level (honest odds)');
select throws_ok($$select public.set_game_center_difficulty('safi-penalty','extreme')$$,'42501',null,'a client cannot change the level');
set local role authenticated;
select throws_ok($$update public.game_center_settings set difficulty='extreme'$$,'42501',null,'no direct writes to the level');
reset role;

-- Easy: a shot next to the dive is a goal
select pg_temp.keep('easy',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
select is((select reach_snapshot::int from public.game_sessions where id=(pg_temp.run('easy')->>'sessionId')::uuid),0,'easy round snapshots reach 0');
select is(pg_temp.shoot_next_to_keeper((pg_temp.run('easy')->>'sessionId')::uuid,1)->>'result','GOAL','easy: the keeper only covers its own zone');

-- Hard: the same shot is saved; the running easy round keeps its level
select pg_temp.login('staff');
select is(public.set_game_center_difficulty('safi-penalty','hard')->>'difficulty','hard','manager sets the level to hard');
select throws_ok($$select public.set_game_center_difficulty('safi-penalty','impossible')$$,'22023','GAME_INVALID_LEVEL','unknown level refused');
select throws_ok($$select public.set_game_center_difficulty('no-such-game','hard')$$,'22023','GAME_NOT_AVAILABLE','unknown game refused');
select pg_temp.login('player');
select is(pg_temp.shoot_next_to_keeper((pg_temp.run('easy')->>'sessionId')::uuid,2)->>'result','GOAL','a round keeps the level it started with');
update public.game_sessions set status='expired' where id=(pg_temp.run('easy')->>'sessionId')::uuid;
select pg_temp.keep('hard',public.game_center_start_mode('safi-penalty',gen_random_uuid(),'practice'));
select is((select reach_snapshot::int from public.game_sessions where id=(pg_temp.run('hard')->>'sessionId')::uuid),2,'new round snapshots reach 2');
select is(pg_temp.shoot_next_to_keeper((pg_temp.run('hard')->>'sessionId')::uuid,1)->>'result','CATCH','hard: the dive covers the neighbouring zone');
select is((select (params->>'reach')::int from public.game_attempts where session_id=(pg_temp.run('hard')->>'sessionId')::uuid),2,'the judged reach is recorded');

-- Gifts: coin managers only, once per request, to client users only
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),10)$$,'42501',null,'a client cannot gift coins');
select throws_ok($$select public.search_sun_coin_recipients('Control')$$,'42501',null,'a client cannot list recipients');
select pg_temp.login('staff');
select is((select r->>'clientName' from jsonb_array_elements(public.search_sun_coin_recipients('control client')) r where (r->>'userId')::uuid=pg_temp.id('player')),'Control Client','search finds the player by client name');
select ok(not exists(select 1 from jsonb_array_elements(public.search_sun_coin_recipients('control')) r where (r->>'userId')::uuid=pg_temp.id('staff')),'staff are not recipients');
select is((public.grant_sun_coin_bonus(pg_temp.id('player'),25,'Yaxshi o‘yin uchun',pg_temp.id('gift'))->>'balance')::int,25,'gift credited: 25 SC');
select is((public.grant_sun_coin_bonus(pg_temp.id('player'),25,'Yaxshi o‘yin uchun',pg_temp.id('gift'))->>'duplicate')::boolean,true,'the same request cannot pay twice');
select is(private.sun_coin_balance(pg_temp.id('player')),25::bigint,'still 25 SC');
select results_eq($$select type,source,amount::int,metadata->>'note' from public.sun_coin_ledger where user_id=pg_temp.id('player')$$,
 $$select 'ADMIN_BONUS'::text,'ADMIN_GIFT'::text,25,'Yaxshi o‘yin uchun'::text$$,'ledger: ADMIN_BONUS with the note');
select ok(exists(select 1 from public.notifications where user_id=pg_temp.id('player') and type='sun_coin.gift'),'the player is notified');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),0)$$,'22023','COIN_INVALID_AMOUNT','zero refused');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('player'),100001)$$,'22023','COIN_INVALID_AMOUNT','over the per-gift cap refused');
select throws_ok($$select public.grant_sun_coin_bonus(pg_temp.id('staff'),10)$$,'22023','COIN_INVALID_RECIPIENT','staff cannot receive gifts');
select ok((public.get_sun_coin_admin_dashboard()->'analytics'->>'gifted')::int>=25,'gifts appear in the analytics');
select is((select s->>'difficulty' from jsonb_array_elements(public.get_sun_coin_admin_dashboard()->'settings') s where s->>'gameId'='safi-penalty'),'hard','dashboard carries the level');
select ok(not has_function_privilege('anon','public.grant_sun_coin_bonus(uuid,bigint,text,uuid)','execute'),'anonymous cannot gift');
select * from finish();
rollback;
