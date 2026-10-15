-- One list of tariffs: a site tariff is the system tariff — same name, price and lines, synced on every save,
-- changed only through the site, assigned to clients with the same lines, retired when deleted. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table ss_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into ss_ids(key) values ('admin'), ('sysowner'), ('rahbar'), ('client'), ('reel');
grant select, insert on ss_ids to anon, authenticated, service_role;
create temp table ss_run(key text primary key, id uuid);
grant select, insert, update on ss_run to authenticated;
create function pg_temp.id(k text) returns uuid language sql stable as $$select coalesce((select id from ss_run where key = k), (select id from ss_ids where key = k))$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
create function pg_temp.lines(k text) returns text[] language sql stable as $$
  select array_agg(concat_ws(':', coalesce(f.label, st.name), coalesce(f.quantity::text, '∞'), coalesce(f.unit, st.unit)) order by f.position)
  from public.plan_features f join public.service_types st on st.key = f.service_key
  where f.plan_id = (select id from public.plans where site_plan_id = pg_temp.id(k))
$$;
grant execute on function pg_temp.id(text), pg_temp.login(text), pg_temp.lines(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@ss-tests.local',
       jsonb_build_object('full_name', initcap(key)), '{}'
from ss_ids where key in ('admin', 'sysowner', 'rahbar');
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('admin', 'admin'), ('sysowner', 'system_owner'), ('rahbar', 'owner')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id) select pg_temp.id(k) from unnest(array['admin', 'sysowner', 'rahbar']) k;
insert into public.clients(id, name, code, status) values (pg_temp.id('client'), 'SS Test Client', 'SST', 'active');

select is((select count(*)::int from public.site_plans s where not exists (select 1 from public.plans p where p.site_plan_id = s.id)), 0,
  'every site tariff already has its system tariff');

-- ---------------------------------------------------------------------------
-- A new site tariff becomes the system tariff, line by line
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('admin');
insert into ss_run values ('gold', public.site_save_plan(
  '{"name":"SS Gold","description":"Sinov tarifi","price":"1200","currency":"USD","price_mode":"fixed","billing_period":"monthly","is_published":true}',
  '[{"name":"Video kontent","quantity":"6 ta","note":"Reels va video","service_key":"video_content"},
    {"name":"Fotopost","quantity":"∞","service_key":"posts"},
    {"name":"Stories","quantity":"12 ta"},
    {"name":"SS Podkast","quantity":"4 ta","note":"studiyada"},
    {"name":"Target+","quantity":"","service_key":"ad_management"}]'));
set constraints site_plan_items_sync immediate;
set constraints site_plan_items_sync deferred;
reset role;

select is((select array[p.name, p.price::text, p.currency::text, p.is_public::text, p.is_active::text, p.duration_months::text]
           from public.plans p where p.site_plan_id = pg_temp.id('gold')),
  array['SS Gold', '1200.00', 'USD', 'true', 'true', '1'], 'the system tariff has the site name, price and currency');
select is(pg_temp.lines('gold'),
  array['Video kontent:6:ta', 'Fotopost:∞:dona', 'Stories:12:ta', 'SS Podkast:4:ta', 'Target+:∞:oy'],
  'every line is there, named and counted as on the site, in the same order (∞ = unlimited, unit from the service)');
select is((select service_key from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Stories'), 'stories',
  'a line without a chosen service is matched by name');
select is((select array[is_quantitative::text, counts_on, unit] from public.service_types
           where key = (select service_key from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'SS Podkast')),
  array['true', 'manual', 'ta'], 'a line the system did not know gets its own counted service');
select is((select note from public.plan_features where plan_id = (select id from public.plans where site_plan_id = pg_temp.id('gold')) and service_key = 'video_content'),
  'Reels va video', 'the line note travels too');

-- Editing the site tariff edits the system tariff.
set local role authenticated;
select pg_temp.login('admin');
select public.site_save_plan(
  jsonb_build_object('id', pg_temp.id('gold'), 'name', 'SS Gold+', 'description', '', 'price', '1500', 'currency', 'USD',
    'price_mode', 'fixed', 'billing_period', 'monthly', 'is_published', true),
  jsonb_build_array(
    jsonb_build_object('id', (select id from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Fotopost'), 'name', 'Fotopost', 'quantity', '20 ta', 'note', '', 'service_key', 'posts'),
    jsonb_build_object('id', (select id from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Video kontent'), 'name', 'Video kontent', 'quantity', '8 ta', 'note', 'Reels va video'),
    jsonb_build_object('id', (select id from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Stories'), 'name', 'Story', 'quantity', '15 ta', 'note', '', 'service_key', 'stories'),
    jsonb_build_object('id', (select id from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Target+'), 'name', 'Target+', 'quantity', '', 'note', '', 'service_key', 'ad_management')));
set constraints site_plan_items_sync immediate;
set constraints site_plan_items_sync deferred;
select throws_ok($$select public.site_save_plan('{"name":"SS Dup","price_mode":"negotiable","currency":"UZS","billing_period":"monthly"}',
  '[{"name":"Fotopost","quantity":"8 ta","service_key":"posts"},{"name":"Postlar","quantity":"4 ta","service_key":"posts"}]')$$,
  '22023', 'SITE_PLAN_SERVICE_DUPLICATE', 'one service appears once in a tariff');
reset role;
select is((select array[p.name, p.price::text] from public.plans p where p.site_plan_id = pg_temp.id('gold')), array['SS Gold+', '1500.00'],
  'a new name and price reach the system');
select is(pg_temp.lines('gold'), array['Fotopost:20:ta', 'Video kontent:8:ta', 'Story:15:ta', 'Target+:∞:oy'],
  'lines edited, renamed, reordered and removed together');
select is((select service_key from public.site_plan_items where plan_id = pg_temp.id('gold') and name = 'Video kontent'), 'video_content',
  'a line saved without a service keeps the one it had');

-- Hiding a site tariff stops new assignments; showing it again brings it back.
set local role authenticated;
select pg_temp.login('admin');
update public.site_plans set is_published = false where id = pg_temp.id('gold');
reset role;
select is((select is_active from public.plans where site_plan_id = pg_temp.id('gold')), false, 'a hidden tariff is inactive in the system');
set local role authenticated;
select pg_temp.login('admin');
update public.site_plans set is_published = true where id = pg_temp.id('gold');
reset role;
select is((select is_active from public.plans where site_plan_id = pg_temp.id('gold')), true, 'and active again when shown');

-- ---------------------------------------------------------------------------
-- The system copy is not edited on its own
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('sysowner');
select throws_ok($$update public.plans set price = 1 where site_plan_id = pg_temp.id('gold')$$, '42501', 'SITE_PLAN_MIRROR',
  'the mirrored tariff is changed only through Sayt › Tariflar');
select throws_ok($$insert into public.plan_features (plan_id, service_key, quantity)
  select id, 'designs', 3 from public.plans where site_plan_id = pg_temp.id('gold')$$, '42501', 'SITE_PLAN_MIRROR', 'nor are its lines');
select throws_ok($$delete from public.plan_features where plan_id = (select id from public.plans where site_plan_id = pg_temp.id('gold'))$$,
  '42501', 'SITE_PLAN_MIRROR', 'nor removed');
select lives_ok($$insert into public.plans (name, slug, price, is_public, client_id) values ('SS Maxsus', 'ss-maxsus', 900, false, pg_temp.id('client'))$$,
  'a custom tariff for one client is still made in the system');
reset role;

-- ---------------------------------------------------------------------------
-- A client on the tariff: the same lines, counted from published content
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('rahbar');
insert into ss_run values ('sub', public.assign_plan(pg_temp.id('client'), (select id from public.plans where site_plan_id = pg_temp.id('gold')), private.agency_today()));
select is((select array_agg(concat_ws(':', e.value ->> 'service_name', coalesce(e.value ->> 'planned', '∞'), e.value ->> 'unit') order by e.n)
           from jsonb_array_elements(public.get_client_plan(pg_temp.id('client')) -> 'usage') with ordinality as e(value, n)),
  array['Fotopost:20:ta', 'Video kontent:8:ta', 'Story:15:ta', 'Target+:∞:oy'], 'the client’s period shows the tariff lines as on the site');
select ok((select bool_or(f ->> 'service_name' = 'Fotopost' and (f ->> 'is_quantitative')::boolean)
           from jsonb_array_elements(public.get_client_plan(pg_temp.id('client')) -> 'plans') p, jsonb_array_elements(p -> 'features') f),
  'the tariff catalogue shows the same lines');
reset role;

insert into public.content_items (id, client_id, title, content_type, status) values (pg_temp.id('reel'), pg_temp.id('client'), 'SS reel', 'reel', 'approved');
update public.content_items set status = 'published', published_at = now() where id = pg_temp.id('reel');
select is((select array_agg(service_key) from public.client_plan_usage where content_id = pg_temp.id('reel')), array['video_content'],
  'a published reel uses one “Video kontent” of the tariff, not also “Reels”');
select is((select subscription_id from public.client_plan_usage where content_id = pg_temp.id('reel')), pg_temp.id('sub'), 'within the client’s period');

-- ---------------------------------------------------------------------------
-- Deleting the site tariff retires the system tariff, the client keeps the period
-- ---------------------------------------------------------------------------
create temp table ss_plan as select id from public.plans where site_plan_id = pg_temp.id('gold');
set local role authenticated;
select pg_temp.login('admin');
delete from public.site_plans where id = pg_temp.id('gold');
reset role;
select is((select array[(deleted_at is not null)::text, is_active::text, coalesce(site_plan_id::text, 'none')] from public.plans where id = (select id from ss_plan)),
  array['true', 'false', 'none'], 'the system tariff leaves the catalogue');
select is((select status::text from public.client_subscriptions where id = pg_temp.id('sub')), 'active', 'the client keeps the running period');

select * from finish();
rollback;
