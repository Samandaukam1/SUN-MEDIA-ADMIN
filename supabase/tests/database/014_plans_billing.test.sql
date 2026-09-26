-- Tariffs: assigning plans closes the running period, usage follows the period, upgrade requests
-- are approved/rejected atomically, the client plan read model respects permissions. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table pl_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on pl_ids to authenticated, anon;
insert into pl_ids (key) values ('boss'), ('pm'), ('owner_user'), ('emp_user'), ('client'), ('other_client'),
  ('basic'), ('premium'), ('custom_other');

create function pg_temp.pl(p_key text) returns uuid language sql stable as $$ select id from pl_ids where key = p_key $$;
grant execute on function pg_temp.pl(text) to authenticated, anon;
create function pg_temp.pl_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.pl(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.pl_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@plan-tests.local',
       jsonb_build_object('full_name', 'Plan ' || key), '{}'
from pl_ids where key in ('boss', 'pm', 'owner_user', 'emp_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from pl_ids i join public.roles r on r.key = case i.key when 'boss' then 'admin' else 'project_manager' end
where i.key in ('boss', 'pm');
insert into public.employees (user_id) select id from pl_ids where key in ('boss', 'pm');
insert into public.clients (id, name, code)
select id, 'Plan ' || key, 'PL' || upper(left(replace(id::text, '-', ''), 10)) from pl_ids where key in ('client', 'other_client');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.pl('client'), pg_temp.pl(k), r.id
from (values ('owner_user', 'client_owner'), ('emp_user', 'client_employee')) m(k, role_key) join public.roles r on r.key = m.role_key;
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.pl('client'), pg_temp.pl('pm'), 'project_manager');

-- Catalogue (as admin)
select pg_temp.pl_login('boss');
insert into public.plans (id, name, slug, price, duration_months, position)
values (pg_temp.pl('basic'), 'Test Basic', 'test-basic-' || left(pg_temp.pl('basic')::text, 8), 3000000, 1, 900),
       (pg_temp.pl('premium'), 'Test Premium', 'test-premium-' || left(pg_temp.pl('premium')::text, 8), 7000000, 1, 901);
insert into public.plans (id, name, slug, price, is_public, client_id)
values (pg_temp.pl('custom_other'), 'Other custom', 'other-custom-' || left(pg_temp.pl('custom_other')::text, 8), 1, false, pg_temp.pl('other_client'));
insert into public.plan_features (plan_id, service_key, quantity) values
  (pg_temp.pl('basic'), 'reels', 8), (pg_temp.pl('basic'), 'posts', 12),
  (pg_temp.pl('premium'), 'reels', 20), (pg_temp.pl('premium'), 'posts', 30), (pg_temp.pl('premium'), 'shooting_days', 4);

select throws_ok($$select public.assign_plan(pg_temp.pl('client'), pg_temp.pl('custom_other'))$$, '22023', null, 'another client''s custom plan cannot be assigned');
insert into pl_ids (key, id) select 'sub1', public.assign_plan(pg_temp.pl('client'), pg_temp.pl('basic'), private.agency_today() - 10);
reset role;
select is((select status::text from public.client_subscriptions where id = pg_temp.pl('sub1')), 'active', 'a subscription that already started is active');
select is((select count(*)::int from public.subscription_quotas where subscription_id = pg_temp.pl('sub1')), 2, 'quotas are snapshotted from the plan');
select is((select price from public.client_subscriptions where id = pg_temp.pl('sub1')), 3000000::numeric, 'price defaults to the plan price');

select pg_temp.pl_login('boss');
insert into public.client_plan_usage (client_id, service_key, quantity, occurred_on, note)
values (pg_temp.pl('client'), 'reels', 2, private.agency_today(), 'Qo''shimcha reels');
reset role;
select is((select subscription_id from public.client_plan_usage where client_id = pg_temp.pl('client') and note = 'Qo''shimcha reels'), pg_temp.pl('sub1'),
  'manual usage lands in the running subscription');

-- The project manager reads but does not assign
select pg_temp.pl_login('pm');
select throws_ok($$select public.assign_plan(pg_temp.pl('client'), pg_temp.pl('premium'))$$, '42501', null, 'subscriptions.read is not enough to assign');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'current' -> 'plan' ->> 'name'), 'Test Basic', 'the PM sees the current plan');
reset role;

-- Client: read, request an upgrade, one pending at a time
select pg_temp.pl_login('owner_user');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'current' -> 'plan' ->> 'name'), 'Test Basic', 'the client sees the current plan');
select is((select (u ->> 'used')::int from jsonb_array_elements(public.get_client_plan(pg_temp.pl('client')) -> 'usage') u where u ->> 'service_key' = 'reels'), 2,
  'usage shows what was used');
select ok(exists (select 1 from jsonb_array_elements(public.get_client_plan(pg_temp.pl('client')) -> 'plans') p where p ->> 'name' = 'Test Premium'),
  'public plans are offered');
select ok(not exists (select 1 from jsonb_array_elements(public.get_client_plan(pg_temp.pl('client')) -> 'plans') p where p ->> 'name' = 'Other custom'),
  'another client''s custom plan is never offered');
with r as (
  insert into public.plan_upgrade_requests (client_id, requested_plan_id, message)
  values (pg_temp.pl('client'), pg_temp.pl('premium'), 'Ko''proq reels kerak') returning id
)
insert into pl_ids (key, id) select 'req', id from r;
select throws_ok($$insert into public.plan_upgrade_requests (client_id, requested_plan_id) values (pg_temp.pl('client'), pg_temp.pl('premium'))$$,
  '23505', null, 'only one pending request at a time');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'pending_request' ->> 'plan_name'), 'Test Premium', 'the pending request is shown');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.pl('boss') and type = 'plan.upgrade_requested'), 'subscription managers are notified');

select pg_temp.pl_login('emp_user');
select throws_ok($$select public.get_client_plan(pg_temp.pl('client'))$$, '42501', null, 'a client employee without plan access cannot read it');
reset role;

-- Handling
select pg_temp.pl_login('boss');
select throws_ok($$select public.handle_upgrade_request(pg_temp.pl('req'), false)$$, '22023', null, 'a rejection needs a reason');
insert into pl_ids (key, id) select 'sub2', public.handle_upgrade_request(pg_temp.pl('req'), true, 'Bugundan Premium');
select throws_ok($$select public.handle_upgrade_request(pg_temp.pl('req'), true)$$, '22023', null, 'a handled request cannot be handled again');
reset role;
select is((select status::text from public.plan_upgrade_requests where id = pg_temp.pl('req')), 'approved', 'request approved');
select is((select ends_on from public.client_subscriptions where id = pg_temp.pl('sub1')), private.agency_today() - 1, 'the old period ends yesterday');
select is((select status::text from public.client_subscriptions where id = pg_temp.pl('sub1')), 'expired', 'and is expired');
select is((select plan_id from public.client_subscriptions where id = pg_temp.pl('sub2')), pg_temp.pl('premium'), 'the new plan runs from today');
select is((select subscription_id from public.client_plan_usage where client_id = pg_temp.pl('client') and note = 'Qo''shimcha reels'), pg_temp.pl('sub2'),
  'today''s usage moves to the new period');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.pl('owner_user') and type = 'plan.upgrade_approved'), 'the client is told');

select pg_temp.pl_login('owner_user');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'current' -> 'plan' ->> 'name'), 'Test Premium', 'the client now sees Premium');
select is(jsonb_array_length(public.get_client_plan(pg_temp.pl('client')) -> 'history'), 1, 'the previous period is in the history');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'last_decision' ->> 'status'), 'approved', 'the last decision is shown');
reset role;

-- A future start is scheduled, not active
select pg_temp.pl_login('boss');
insert into pl_ids (key, id) select 'sub3', public.assign_plan(pg_temp.pl('client'), pg_temp.pl('basic'), private.agency_today() + 5);
reset role;
select is((select status::text from public.client_subscriptions where id = pg_temp.pl('sub3')), 'scheduled', 'a future start is scheduled');
select is((select ends_on from public.client_subscriptions where id = pg_temp.pl('sub2')), private.agency_today() + 4, 'the running period ends the day before');
select pg_temp.pl_login('owner_user');
select is((public.get_client_plan(pg_temp.pl('client')) -> 'upcoming' ->> 'plan_name'), 'Test Basic', 'the next period is announced to the client');
select ok(not exists (select 1 from jsonb_array_elements(public.get_client_plan(pg_temp.pl('client')) -> 'history') h where h ->> 'id' = pg_temp.pl('sub3')::text),
  'a future period is not listed as history');
reset role;

select * from finish();
rollback;
