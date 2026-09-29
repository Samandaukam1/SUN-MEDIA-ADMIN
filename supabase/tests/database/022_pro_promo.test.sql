-- SUN MEDIA Pro: internal lifetime licence, configurable Free limits enforced in the database, client inheritance,
-- promo codes with reuse / brute-force protection, and no way to write a subscription from the app. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table pp_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on pp_ids to authenticated, anon;
insert into pp_ids (key) values ('owner'), ('admin'), ('client_a'), ('client_b'), ('user_a'), ('user_b');
create function pg_temp.pp(p_key text) returns uuid language sql stable as $$ select id from pp_ids where key = p_key $$;
grant execute on function pg_temp.pp(text) to authenticated, anon;
create function pg_temp.pp_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.pp(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.pp_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@pro-tests.local',
       jsonb_build_object('full_name', key), '{}'
from pp_ids where key in ('owner', 'admin', 'user_a', 'user_b');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from pp_ids i join public.roles r on r.key = case i.key when 'owner' then 'system_owner' else 'admin' end
where i.key in ('owner', 'admin');
insert into public.employees (user_id) select id from pp_ids where key in ('owner', 'admin');
insert into public.clients (id, name, code) values (pg_temp.pp('client_a'), 'Pro Test A', 'PROTA'), (pg_temp.pp('client_b'), 'Pro Test B', 'PROTB');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.pp('client_a'), pg_temp.pp('user_a'), id from public.roles where key = 'client_owner';
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.pp('client_b'), pg_temp.pp('user_b'), id from public.roles where key = 'client_owner';

select ok(private.client_workspace_id(pg_temp.pp('client_a')) is not null, 'every client gets its own workspace');

-- Internal licence
select pg_temp.pp_login('admin');
select is(public.get_my_entitlements() -> 'plan' ->> 'key', 'pro', 'SUN MEDIA staff work on Pro');
select is(public.get_my_entitlements() ->> 'source', 'internal', 'from the internal lifetime licence');
select is(public.get_my_entitlements() ->> 'ends_at', null, 'which never ends');
reset role;
select pg_temp.pp_login('user_a');
select is(public.get_my_entitlements() -> 'plan' ->> 'key', 'pro', 'clients inherit the agency plan');
select is((public.get_my_entitlements() ->> 'inherited')::boolean, true, 'and know it is inherited');
select throws_ok($$insert into public.workspace_subscriptions (workspace_id, plan_key, source) values (private.client_workspace_id(pg_temp.pp('client_a')), 'pro', 'manual')$$,
  '42501', null, 'nobody writes a subscription from the app');
select throws_ok($$select public.grant_workspace_plan(private.client_workspace_id(pg_temp.pp('client_a')), 'pro', 30)$$, '42501', null, 'clients cannot grant Pro');
select is((select count(*)::int from public.promo_codes), 0, 'clients cannot read promo codes');
reset role;
select pg_temp.pp_login('admin');
select throws_ok($$select public.grant_workspace_plan(private.agency_workspace_id(), 'pro', 30)$$, '42501', null, 'admins cannot grant subscriptions either');
reset role;

-- If the agency were on Free, the configured limits apply in the database.
update public.workspace_subscriptions set status = 'cancelled' where source = 'internal';
select throws_ok($$insert into public.clients (name, code) values ('Ortiqcha', 'EXTRA1')$$, 'P0402', null, 'Free: no client beyond the configured limit');
select throws_ok($$insert into public.employees (user_id) select id from pp_ids where key = 'user_b'$$, 'P0402', null, 'Free: no employee beyond the limit');
select pg_temp.pp_login('user_a');
select is(public.get_my_entitlements() -> 'plan' ->> 'key', 'free', 'a client of a Free agency is on Free');
select throws_ok($$select public.get_client_forecast(pg_temp.pp('client_a'))$$, 'P0402', null, 'the forecast is Pro');
reset role;
update public.saas_plan_features set limit_value = 100 where plan_key = 'free' and feature_key = 'clients.max';
select lives_ok($$insert into public.clients (name, code) values ('Endi mumkin', 'EXTRA2')$$, 'limits are configuration, not code');

-- Promo codes
select pg_temp.pp_login('admin');
select lives_ok($$insert into public.promo_codes (code, title, reward_days, audience, per_user_limit, max_redemptions) values (' safi3day ', '3 kun Pro', 3, 'clients', 1, 1)$$,
  'an admin creates a promo code');
select is((select code from public.promo_codes where title = '3 kun Pro'), 'SAFI3DAY', 'codes are stored upper-case');
select is(public.redeem_promo('SAFI3DAY') ->> 'reason', 'not_eligible', 'a client-only code does not work for staff');
select throws_ok($$delete from public.promo_codes where code = 'SAFI3DAY'$$, '42501', null, 'codes are deactivated, never deleted');
reset role;

select pg_temp.pp_login('user_a');
select is(public.redeem_promo('safi3day') ->> 'ok', 'true', 'the client redeems the code');
select is(public.get_my_entitlements() -> 'plan' ->> 'key', 'pro', 'and is on Pro now');
select is((public.get_my_entitlements() -> 'own' ->> 'source'), 'promo', 'from the promo');
select lives_ok($$select public.get_client_forecast(pg_temp.pp('client_a'))$$, 'Pro features open');
select is(public.redeem_promo('SAFI3DAY') ->> 'reason', 'already_used', 'one person, one use');
select is(public.redeem_promo('NOPE-123') ->> 'reason', 'invalid', 'unknown codes are refused');
select lives_ok($$select public.redeem_promo('WRONG' || g) from generate_series(1, 9) g$$, 'more wrong guesses');
select throws_ok($$select public.redeem_promo('SAFI3DAY')$$, 'P0429', null, 'guessing is rate-limited');
reset role;

select pg_temp.pp_login('user_b');
select is(public.redeem_promo('SAFI3DAY') ->> 'reason', 'used_up', 'a single-use code works once in total');
reset role;
select is((select redemption_count from public.promo_codes where code = 'SAFI3DAY'), 1, 'the counter cannot be faked');

select pg_temp.pp_login('owner');
select ok(public.grant_workspace_plan(private.client_workspace_id(pg_temp.pp('client_b')), 'pro', 30, 'Hamkor') is not null, 'the Tizim egasi grants Pro by hand');
reset role;
select pg_temp.pp_login('user_b');
select is(public.get_my_entitlements() -> 'plan' ->> 'key', 'pro', 'and it takes effect');
reset role;

select * from finish();
rollback;
