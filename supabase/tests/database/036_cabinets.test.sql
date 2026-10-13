begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table cab_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into cab_ids(key) values ('rahbar'), ('editor'), ('admin'), ('safi_user'), ('safi_staff'), ('other_user'), ('safi'), ('other');
grant select on cab_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from cab_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@cabinet-tests.local',
       jsonb_build_object('full_name', key), '{}'
from cab_ids where key not in ('safi', 'other');
insert into public.user_roles(user_id, role_id) select pg_temp.id('rahbar'), id from public.roles where key = 'owner';
insert into public.user_roles(user_id, role_id) select pg_temp.id('editor'), id from public.roles where key = 'editor';
insert into public.user_roles(user_id, role_id) select pg_temp.id('admin'), id from public.roles where key = 'admin';
insert into public.employees(user_id) select id from cab_ids where key in ('rahbar', 'editor', 'admin');

insert into public.clients (id, name, code)
select id, 'Cabinet ' || key, 'CB' || upper(left(replace(id::text, '-', ''), 10)) from cab_ids where key in ('safi', 'other');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.id('safi'), pg_temp.id('safi_user'), id from public.roles where key = 'client_owner'
union all
select pg_temp.id('safi'), pg_temp.id('safi_staff'), id from public.roles where key = 'client_employee'
union all
select pg_temp.id('other'), pg_temp.id('other_user'), id from public.roles where key = 'client_owner';

insert into public.social_accounts (id, client_id, platform, handle)
values (gen_random_uuid(), pg_temp.id('safi'), 'instagram', 'safi.test'), (gen_random_uuid(), pg_temp.id('other'), 'instagram', 'other.test');
create function pg_temp.account(k text) returns uuid language sql stable as
  $$select a.id from public.social_accounts a where a.client_id = pg_temp.id(k)$$;
grant execute on function pg_temp.account(text) to authenticated, service_role;

create temp table cab_run(key text primary key, id uuid);
grant select, insert, update on cab_run to authenticated;

-- ---------------------------------------------------------------------------
-- Rahbar: enters numbers (draft and published) and publishes reports
-- ---------------------------------------------------------------------------
select ok((select permission_key = any (array['analytics.manage', 'reports.manage'])
           from public.role_permissions rp join public.roles r on r.id = rp.role_id
           where r.key = 'owner' and rp.permission_key = 'analytics.manage'), 'the Rahbar may enter statistics');

set local role authenticated;
select pg_temp.login('rahbar');
select lives_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views, reach, likes,
                    reels_count, ad_spend, ad_currency, leads, status)
                  values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-08-01', '2026-08-31', 12000, 8000, 900, 6, 1500000, 'UZS', 30, 'published')$$,
  'Rahbar enters a published month');
select lives_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views, status)
                  values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-09-01', '2026-09-30', 99999, 'draft')$$,
  'and a draft month');
select is((select source::text from public.social_metrics where period_start = '2026-08-01' and client_id = pg_temp.id('safi')), 'manual',
  'numbers typed in are marked as manual, never as live');
select ok((select published_at is not null and published_by = pg_temp.id('rahbar') from public.social_metrics
           where period_start = '2026-08-01' and client_id = pg_temp.id('safi')), 'publishing records who and when');
select ok((select published_at is null from public.social_metrics where period_start = '2026-09-01' and client_id = pg_temp.id('safi')),
  'a draft has no publish time');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views)
                   values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-08-15', '2026-09-14', 1)$$,
  '23P01', null, 'an overlapping period is refused (no double counting)');
select lives_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views, status)
                  values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-08-01', '2026-08-31', 12500, 'published')
                  on conflict (social_account_id, period_start, period_end) do update set views = excluded.views$$,
  'the same month is corrected in place');
select is((select count(*)::int from public.social_metrics where client_id = pg_temp.id('safi')), 2, 'still one row per month');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, ad_currency)
                   values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-07-01', '2026-07-31', 'EUR')$$,
  '23514', null, 'unknown ad currency is refused');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, leads)
                   values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-06-01', '2026-06-30', -1)$$,
  '23514', null, 'negative numbers are refused');

insert into cab_run select 'aug', (public.generate_monthly_report(pg_temp.id('safi'), '2026-08-01')).id;
insert into cab_run select 'sep', (public.generate_monthly_report(pg_temp.id('safi'), '2026-09-01')).id;
select is((select value from public.monthly_report_metrics where report_id = (select id from cab_run where key = 'aug') and metric_key = 'social.views'),
  12500::numeric, 'the report uses the published numbers');
select is((select count(*)::int from public.monthly_report_metrics where report_id = (select id from cab_run where key = 'sep') and metric_key like 'social.%'),
  0, 'draft numbers never reach a report');
update public.monthly_reports set work_done = 'Reels: 6 ta', work_planned = 'Oktabr: 8 ta Reels' where id = (select id from cab_run where key = 'aug');
select is((select work_done from public.monthly_reports where id = (select id from cab_run where key = 'aug')), 'Reels: 6 ta', 'Rahbar writes the work done');
select lives_ok($$select public.publish_monthly_report((select id from cab_run where key = 'aug'))$$, 'Rahbar publishes the report');

-- A file attached to each report (the object must exist in storage first).
insert into storage.objects (bucket_id, name, owner, metadata)
values ('reports', pg_temp.id('safi') || '/' || (select id from cab_run where key = 'aug') || '/files/a.pdf', auth.uid(), '{"mimetype":"application/pdf","size":2048}'),
       ('reports', pg_temp.id('safi') || '/' || (select id from cab_run where key = 'sep') || '/files/b.pdf', auth.uid(), '{"mimetype":"application/pdf","size":1024}');
select lives_ok($$select public.add_report_file((select id from cab_run where key = 'aug'),
                  pg_temp.id('safi') || '/' || (select id from cab_run where key = 'aug') || '/files/a.pdf', 'Avgust hisobot.pdf')$$,
  'a file is attached to the published report');
select lives_ok($$select public.add_report_file((select id from cab_run where key = 'sep'),
                  pg_temp.id('safi') || '/' || (select id from cab_run where key = 'sep') || '/files/b.pdf', 'Sentabr qoralama.pdf')$$,
  'and to the draft');
select is((select size_bytes from public.monthly_report_files where name = 'Avgust hisobot.pdf'), 2048::bigint, 'size comes from storage, not the caller');
select throws_ok($$select public.add_report_file((select id from cab_run where key = 'aug'),
                   pg_temp.id('other') || '/' || (select id from cab_run where key = 'aug') || '/files/x.pdf', 'x.pdf')$$,
  '22023', null, 'a file outside the report folder is refused');
select throws_ok($$select public.add_report_file((select id from cab_run where key = 'aug'),
                   pg_temp.id('safi') || '/' || (select id from cab_run where key = 'aug') || '/files/missing.pdf', 'x.pdf')$$,
  'P0002', null, 'a file that was never uploaded is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Partner: own brand, published data only
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('safi_user');
select is((select count(*)::int from public.social_metrics), 1, 'the partner reads only published numbers of its brand');
select is((select count(*)::int from public.monthly_reports), 1, 'and only the published report');
select is((select count(*)::int from public.monthly_report_files), 1, 'and only that report''s files');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics'), 1,
  'the cabinet shows the published month only');
select is((public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics' -> 0 ->> 'views')::int, 12500,
  'with the corrected value');
select is((public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics' -> 0 ->> 'source'), 'manual',
  'labelled as manual');
select is((public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics' -> 0 ->> 'reach_7d'), null,
  'no internal fields');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'reports'), 1,
  'one published report');
select is(public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'reports' -> 0 ->> 'work_planned', 'Oktabr: 8 ta Reels',
  'with the planned work');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-09-01', '2026-09-01') -> 'reports'), 0,
  'the draft month has no report');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-09-01', '2026-09-01') -> 'metrics'), 0,
  'and no numbers');
select throws_ok($$select public.get_partner_cabinet(pg_temp.id('other'), '2026-01-01', '2026-12-01')$$,
  '42501', null, 'SAFI cannot open another brand by changing the id');
select throws_ok($$select public.get_partner_cabinet(pg_temp.id('safi'), '2020-01-01', '2026-12-01')$$,
  '22023', null, 'periods longer than three years are refused');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views)
                   values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-05-01', '2026-05-31', 1)$$,
  '42501', null, 'the partner cannot enter statistics');
update public.social_metrics set views = 1 where client_id = pg_temp.id('safi');
update public.monthly_reports set work_done = 'hack' where client_id = pg_temp.id('safi');
select throws_ok($$select public.add_report_file((select id from cab_run where key = 'aug'), 'x', 'x')$$,
  'P0002', null, 'the partner cannot attach files');
select throws_ok($$select public.remove_report_file((select id from public.monthly_report_files limit 1))$$,
  'P0002', null, 'or remove them');
select throws_ok($$select public.publish_monthly_report((select id from cab_run where key = 'sep'))$$,
  'P0002', null, 'or publish a report');

select pg_temp.login('safi_staff');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics'), 1,
  'a second account of the same brand sees the same cabinet');

select pg_temp.login('other_user');
select throws_ok($$select public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01')$$,
  '42501', null, 'another partner cannot open SAFI');
select is((select count(*)::int from public.social_metrics where client_id = pg_temp.id('safi')), 0, 'nor read its numbers');
select is((select count(*)::int from public.monthly_reports where client_id = pg_temp.id('safi')), 0, 'nor its reports');
select is((select count(*)::int from public.monthly_report_files), 0, 'nor its files');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 0, 'nor the stored files');

select pg_temp.login('safi_user');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 1, 'SAFI reaches the published report file only');
reset role;

select is((select views from public.social_metrics where period_start = '2026-08-01' and client_id = pg_temp.id('safi')), 12500::bigint,
  'the partner''s update changed nothing');
select is((select work_done from public.monthly_reports where id = (select id from cab_run where key = 'aug')), 'Reels: 6 ta',
  'nor the report text');

-- ---------------------------------------------------------------------------
-- Staff without rights, API rows, visitors
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('editor');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, views)
                   values (pg_temp.account('safi'), pg_temp.id('safi'), '2026-04-01', '2026-04-30', 1)$$,
  '42501', null, 'an employee without analytics rights cannot enter statistics');
select throws_ok($$select public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01')$$,
  '42501', null, 'and cannot open a brand they do not work on');
select pg_temp.login('rahbar');
select is(jsonb_array_length(public.get_partner_cabinet(pg_temp.id('safi'), '2026-01-01', '2026-12-01') -> 'metrics'), 1,
  'management previews exactly what the partner sees');
reset role;

-- Synced numbers are live data: always published.
select public.ig_save_period(pg_temp.account('other'), '2026-08-01', '2026-08-31', '{"views": 10}');
select is((select status::text from public.social_metrics where client_id = pg_temp.id('other')), 'published', 'synced numbers are published');
select is((select source::text from public.social_metrics where client_id = pg_temp.id('other')), 'api', 'and marked as synced');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.get_partner_cabinet(gen_random_uuid(), '2026-01-01', '2026-02-01')$$, '42501', null, 'visitors cannot open a cabinet');
select throws_ok($$select public.site_login_begin(repeat('v', 32), repeat('a', 32))$$, '42501', null, 'visitors cannot call the login limiter');
reset role;
set local role authenticated;
select pg_temp.login('safi_user');
select throws_ok($$select public.site_login_finish(1, true)$$, '42501', null, 'nor can signed-in users');
reset role;

-- ---------------------------------------------------------------------------
-- Login attempt limits (the server calls these with its service key)
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table cab_attempts(n int, result jsonb);
insert into cab_attempts select n, public.site_login_begin(repeat('v', 32), repeat('a', 32)) from generate_series(1, 5) n;
select ok((select bool_and((result ->> 'ok')::boolean) from cab_attempts), 'the first five attempts are allowed');
select public.site_login_finish((result ->> 'attempt')::bigint, false) from cab_attempts;
select is((public.site_login_begin(repeat('v', 32), repeat('a', 32)) ->> 'ok')::boolean, false, 'the sixth wrong password is locked out');
select ok((public.site_login_begin(repeat('v', 32), repeat('a', 32)) ->> 'retryAfter')::int between 1 and 900, 'with a wait time');
select is((public.site_login_begin(repeat('w', 32), repeat('a', 32)) ->> 'ok')::boolean, true, 'another visitor can still sign in to that login');
select is((public.site_login_begin(repeat('v', 32), repeat('b', 32)) ->> 'ok')::boolean, true, 'and the same visitor to another login');
reset role;
update private.login_attempts set created_at = created_at - interval '16 minutes' where account = repeat('a', 32);
set local role service_role;
select is((public.site_login_begin(repeat('v', 32), repeat('a', 32)) ->> 'ok')::boolean, true, 'the lock ends after 15 minutes');
reset role;

select * from finish();
rollback;
