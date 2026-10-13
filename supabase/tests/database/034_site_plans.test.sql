begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table pl_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into pl_ids(key) values ('admin'), ('editor');
grant select on pl_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from pl_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@plan-tests.local',
       jsonb_build_object('full_name', key), '{}'
from pl_ids;
insert into public.user_roles(user_id, role_id) select pg_temp.id('admin'), id from public.roles where key = 'admin';
insert into public.user_roles(user_id, role_id) select pg_temp.id('editor'), id from public.roles where key = 'editor';
insert into public.employees(user_id) select id from pl_ids;
delete from public.site_plans;

create temp table pl_run(key text primary key, id uuid);
grant select, insert, update on pl_run to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: create, edit, order services, one featured tariff
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('admin');
insert into pl_run values ('start', public.site_save_plan(
  '{"name":"Start","description":"Boshlovchi brendlar uchun","price":"4500000","currency":"UZS","price_mode":"from","billing_period":"monthly","is_featured":true,"is_published":true}',
  '[{"name":"Reels","quantity":"oyiga 8 ta","note":"ssenariy bilan"},{"name":"Postlar","quantity":"12 ta","note":""}]'));
select is((select name from public.site_plans where id = (select id from pl_run where key = 'start')), 'Start', 'admin creates a tariff');
select is((select array_agg(name order by sort_order) from public.site_plan_items where plan_id = (select id from pl_run where key = 'start')),
  array['Reels', 'Postlar'], 'services keep the order they were given in');

insert into pl_run values ('pro', public.site_save_plan(
  '{"name":"Pro","price":"","currency":"UZS","price_mode":"negotiable","billing_period":"one_time","is_featured":true}', '[]'));
select is((select count(*)::int from public.site_plans where is_featured), 1, 'only one tariff is featured');
select ok((select is_featured from public.site_plans where id = (select id from pl_run where key = 'pro')), 'the newly featured tariff wins');
select is((select price from public.site_plans where id = (select id from pl_run where key = 'pro')), null, 'negotiable tariffs keep no price');

-- Edit: reorder services, rename one, drop one, add one.
select public.site_save_plan(
  jsonb_build_object('id', (select id from pl_run where key = 'start'), 'name', 'Start+', 'price', '5000000', 'currency', 'UZS',
    'price_mode', 'fixed', 'billing_period', 'monthly', 'is_featured', false, 'is_published', true),
  jsonb_build_array(
    jsonb_build_object('name', 'Stories', 'quantity', '20 ta', 'note', ''),
    jsonb_build_object('id', (select id from public.site_plan_items where name = 'Reels'), 'name', 'Reels (vertikal)', 'quantity', 'oyiga 10 ta', 'note', 'montaj bilan')));
select is((select array_agg(name order by sort_order) from public.site_plan_items where plan_id = (select id from pl_run where key = 'start')),
  array['Stories', 'Reels (vertikal)'], 'services edited, reordered and removed in one save');
select is((select price_mode from public.site_plans where id = (select id from pl_run where key = 'start')), 'fixed', 'price mode changes');

select throws_ok($$select public.site_save_plan('{"name":"Bad","price_mode":"fixed","price":"","currency":"UZS","billing_period":"monthly"}', '[]')$$,
  '23514', null, 'a fixed price is required unless negotiable');
select throws_ok($$select public.site_save_plan('{"name":"Bad","price_mode":"fixed","price":"10","currency":"GBP","billing_period":"monthly"}', '[]')$$,
  '23514', null, 'unknown currency is refused');
select throws_ok($$select public.site_save_plan('{"name":"Bad","price_mode":"negotiable","currency":"UZS","billing_period":"weekly"}', '[]')$$,
  '23514', null, 'unknown billing period is refused');
select throws_ok($$select public.site_save_plan('{"name":"Bad","price_mode":"negotiable","currency":"UZS","billing_period":"monthly"}', '[{"name":""}]')$$,
  '23514', null, 'a service needs a name');

update public.site_plans set is_published = false where id = (select id from pl_run where key = 'pro');
reset role;
set local role service_role;
select is(jsonb_array_length(public.get_site_content()->'plans'), 1, 'hidden tariffs stay off the site');
select is(public.get_site_content()->'plans'->0->'items'->0->>'name', 'Stories', 'the site gets services in order');
select is(public.get_site_content()->'plans'->0->>'priceMode', 'fixed', 'the site gets the price mode');
reset role;

-- ---------------------------------------------------------------------------
-- Staff without site.manage and visitors
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('editor');
select throws_ok($$select public.site_save_plan('{"name":"X","price_mode":"negotiable","currency":"UZS","billing_period":"monthly"}', '[]')$$,
  '42501', null, 'staff without site.manage cannot save tariffs');
select is((select count(*)::int from public.site_plans), 0, 'and do not see them');
delete from public.site_plans;
reset role;
select is((select count(*)::int from public.site_plans), 2, 'their delete changed nothing');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.site_plans$$, '42501', null, 'visitors cannot read the tariffs table');
select throws_ok($$select public.site_save_plan('{}', '[]')$$, '42501', null, 'visitors cannot save tariffs');
reset role;

-- ---------------------------------------------------------------------------
-- Pages and images
-- ---------------------------------------------------------------------------
select is((select path from public.site_pages where key = 'plans'), '/tariflar', 'the Tariflar page exists');
select is((select primary_cta_label from public.site_settings where id), 'Hamkorlarimiz', 'the main button says Hamkorlarimiz');

set local role authenticated;
select pg_temp.login('admin');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'site/partners/x.svg', auth.uid())$$,
  '42501', null, 'SVG files cannot be stored under site/');
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'site/partners/x.webp', auth.uid())$$,
  'raster images can');
select pg_temp.login('editor');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'site/partners/y.webp', auth.uid())$$,
  '42501', null, 'staff without site.manage cannot upload site images');
reset role;

select * from finish();
rollback;
