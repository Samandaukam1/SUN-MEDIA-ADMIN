-- Instagram analytics, client results and tariff forecasts: real stored data only, NULL when missing,
-- no forecast without history, and no client ever reads another client's numbers. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ig_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on ig_ids to authenticated, anon, service_role;
insert into ig_ids (key) values ('client_a'), ('client_b'), ('user_a'), ('user_b'), ('account_a'), ('plan_small'), ('plan_big'), ('sub_a');
create function pg_temp.i(p_key text) returns uuid language sql stable as $$ select id from ig_ids where key = p_key $$;
grant execute on function pg_temp.i(text) to authenticated, anon, service_role;
create function pg_temp.i_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.i(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.i_login(text) to authenticated, anon, service_role;
create function pg_temp.i_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function pg_temp.i_service() to authenticated, anon, service_role;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@ig-tests.local',
       jsonb_build_object('full_name', key), '{}'
from ig_ids where key in ('user_a', 'user_b');
insert into public.clients (id, name, code) values (pg_temp.i('client_a'), 'IG Test A', 'IGTA'), (pg_temp.i('client_b'), 'IG Test B', 'IGTB');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.i('client_a'), pg_temp.i('user_a'), id from public.roles where key = 'client_owner';
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.i('client_b'), pg_temp.i('user_b'), id from public.roles where key = 'client_owner';
insert into public.social_accounts (id, client_id, platform, handle, external_id, connection)
values (pg_temp.i('account_a'), pg_temp.i('client_a'), 'instagram', 'ig_test_a', '7777', 'connected');

-- Before any sync: nothing is invented.
select pg_temp.i_login('user_a');
select is(public.get_instagram_summary(pg_temp.i('client_a'), 30) ->> 'followers', null, 'no history, no follower number');
select is(public.get_client_results(pg_temp.i('client_a')) -> 'instagram', 'null'::jsonb, 'no Instagram block without data');
select is(public.get_client_results(pg_temp.i('client_a')) -> 'leads', 'null'::jsonb, 'no lead block without CRM');
select is(public.get_client_forecast(pg_temp.i('client_a')) ->> 'reason', 'no_plan', 'no forecast without a tariff');
select throws_ok($$select public.ig_save_snapshot(pg_temp.i('account_a'), private.agency_today(), '{}')$$, '42501', null, 'clients cannot write analytics');
reset role;

-- Tariffs: current (4 Reels) and a bigger public one (12 Reels).
insert into public.plans (id, name, slug, price, currency, duration_months, is_public, is_active)
values (pg_temp.i('plan_small'), 'IG Test Start', 'ig-test-start', 1000, 'USD', 1, true, true),
       (pg_temp.i('plan_big'), 'IG Test Pro', 'ig-test-pro', 2000, 'USD', 1, true, true);
insert into public.plan_features (plan_id, service_key, quantity, is_included)
values (pg_temp.i('plan_small'), 'reels', 4, true), (pg_temp.i('plan_big'), 'reels', 12, true);
insert into public.client_subscriptions (id, client_id, plan_id, status, starts_on, ends_on, price, currency)
values (pg_temp.i('sub_a'), pg_temp.i('client_a'), pg_temp.i('plan_small'), 'active', private.agency_today() - 10, private.agency_today() + 20, 1000, 'USD');
insert into public.subscription_quotas (subscription_id, service_key, quantity, is_included)
select pg_temp.i('sub_a'), 'reels', 4, true
where not exists (select 1 from public.subscription_quotas where subscription_id = pg_temp.i('sub_a') and service_key = 'reels');

-- 40 days of history from the sync.
select pg_temp.i_service();
select lives_ok($$
  select public.ig_save_snapshot(pg_temp.i('account_a'), (private.agency_today() - g)::date,
    jsonb_build_object('followers', 10000 - g * 10, 'views', 5000, 'reach', 3000, 'interactions', 400, 'reach_7d', 15000, 'reach_30d', 50000))
  from generate_series(0, 39) g
$$, 'the sync stores daily snapshots');
select lives_ok($$select public.ig_save_snapshot(pg_temp.i('account_a'), private.agency_today(), '{"views": null, "likes": 12}')$$,
  'a later partial sync keeps the known values');
select is((select views from public.social_daily_snapshots where social_account_id = pg_temp.i('account_a') and snapshot_date = private.agency_today()), 5000::bigint,
  'NULL from Meta never erases a stored number');
select is(public.ig_save_media(pg_temp.i('account_a'), (
  select jsonb_agg(jsonb_build_object('id', (9000 + g)::text, 'media_type', 'VIDEO', 'media_product_type', 'REELS',
    'permalink', 'https://www.instagram.com/reel/' || g || '/', 'timestamp', to_char(now() - make_interval(days => g * 5), 'YYYY-MM-DD"T"HH24:MI:SS+0000'),
    'views', 10000 * (g + 1), 'reach', 5000, 'likes', 100 * g, 'shares', g, 'saves', g))
  from generate_series(1, 5) g
)), 5, 'the sync stores Reels with insights');
reset role;

select pg_temp.i_login('user_a');
select is((public.get_instagram_summary(pg_temp.i('client_a'), 30) ->> 'followers')::int, 10000, 'latest followers');
select is((public.get_instagram_summary(pg_temp.i('client_a'), 30) ->> 'followers_growth')::int, 300, 'growth comes from the stored history (30 days of change)');
select is((public.get_instagram_summary(pg_temp.i('client_a'), 30) ->> 'reach')::int, 50000, '30-day reach is the unique 30-day reach, not a sum');
select is((public.get_instagram_summary(pg_temp.i('client_a'), 90) ->> 'reach'), null, 'no 90-day reach is invented');
select is(jsonb_array_length(public.get_top_media(pg_temp.i('client_a'), 30, 3)), 3, 'top content is limited');
select is((public.get_top_media(pg_temp.i('client_a'), 30, 1) -> 0 ->> 'views')::bigint, 60000::bigint, 'best Reel first');
select is((public.get_client_results(pg_temp.i('client_a')) -> 'production' ->> 'reels')::int, 0, 'production counts come from real content only');
select ok((public.get_client_results(pg_temp.i('client_a')) -> 'instagram' ->> 'views') is not null, 'this month''s views are shown');
select throws_ok($$select public.get_instagram_summary(pg_temp.i('client_b'), 30)$$, '42501', null, 'client A cannot read client B');
select is((select count(*)::int from public.social_daily_snapshots where client_id <> pg_temp.i('client_a')), 0, 'RLS keeps snapshots per client');
reset role;

select pg_temp.i_login('user_b');
select is((select count(*)::int from public.social_media_items), 0, 'client B sees none of client A''s posts');
select throws_ok($$select public.get_client_forecast(pg_temp.i('client_a'))$$, '42501', null, 'nor its forecast');
reset role;

-- Forecast: an honest range, only with enough history.
select pg_temp.i_login('user_a');
select is(public.get_client_forecast(pg_temp.i('client_a')) ->> 'available', 'true', 'enough history gives a forecast');
select ok((public.get_client_forecast(pg_temp.i('client_a')) -> 'views' ->> 'low')::numeric < (public.get_client_forecast(pg_temp.i('client_a')) -> 'views' ->> 'high')::numeric,
  'the forecast is a range, never a single promise');
select is(public.get_client_forecast(pg_temp.i('client_a')) -> 'leads', null, 'no lead forecast without lead history');
reset role;

select * from finish();
rollback;
