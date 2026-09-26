-- Monthly reports: SMM enters real social numbers, the PM generates and publishes, clients read
-- only published reports without internal metrics, Uzbek month names everywhere. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table rp_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on rp_ids to authenticated, anon;
insert into rp_ids (key) values ('pm'), ('smm'), ('owner_user'), ('client'), ('account');

create function pg_temp.rp(p_key text) returns uuid language sql stable as $$ select id from rp_ids where key = p_key $$;
grant execute on function pg_temp.rp(text) to authenticated, anon;
create function pg_temp.rp_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.rp(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.rp_login(text) to authenticated, anon;
create function pg_temp.last_month() returns date language sql stable as $$ select (date_trunc('month', private.agency_today()) - interval '1 month')::date $$;
grant execute on function pg_temp.last_month() to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@report-tests.local',
       jsonb_build_object('full_name', 'Report ' || key), '{}'
from rp_ids where key in ('pm', 'smm', 'owner_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from rp_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' else 'smm_manager' end
where i.key in ('pm', 'smm');
insert into public.employees (user_id) select id from rp_ids where key in ('pm', 'smm');
insert into public.clients (id, name, code) values (pg_temp.rp('client'), 'Report client', 'RP' || upper(left(replace(pg_temp.rp('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id) select pg_temp.rp('client'), pg_temp.rp('owner_user'), id from public.roles where key = 'client_owner';
insert into public.client_team_members (client_id, user_id, team_role) values
  (pg_temp.rp('client'), pg_temp.rp('pm'), 'project_manager'),
  (pg_temp.rp('client'), pg_temp.rp('smm'), 'smm_manager');
insert into public.social_accounts (id, client_id, platform, handle) values (pg_temp.rp('account'), pg_temp.rp('client'), 'instagram', 'report.client');

-- Real numbers entered by the SMM manager
select pg_temp.rp_login('smm');
select lives_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, followers_start, followers_end, reach, views, likes, comments, shares, saves)
  values (pg_temp.rp('account'), pg_temp.rp('client'), pg_temp.last_month(), (pg_temp.last_month() + interval '1 month - 1 day')::date, 1000, 1250, 50000, 120000, 3000, 200, 150, 400)$$,
  'SMM enters last month''s numbers');
select throws_ok($$select public.generate_monthly_report(pg_temp.rp('client'), pg_temp.last_month())$$, '42501', null, 'SMM cannot generate reports');
reset role;
select is((select source::text from public.social_metrics where social_account_id = pg_temp.rp('account')), 'manual', 'the source is recorded as manual');

select pg_temp.rp_login('owner_user');
select throws_ok($$insert into public.social_metrics (social_account_id, client_id, period_start, period_end, reach)
  values (pg_temp.rp('account'), pg_temp.rp('client'), pg_temp.last_month() - interval '1 month', pg_temp.last_month() - 1, 1)$$,
  '42501', null, 'clients cannot type their own statistics');
reset role;

-- Generate and publish
select pg_temp.rp_login('pm');
select throws_ok($$select public.generate_monthly_report(pg_temp.rp('client'), (date_trunc('month', private.agency_today()) + interval '1 month')::date)$$,
  '22023', null, 'no reports about the future');
insert into rp_ids (key, id) select 'report', (public.generate_monthly_report(pg_temp.rp('client'), pg_temp.last_month())).id;
select is((select title from public.monthly_reports where id = pg_temp.rp('report')),
  'SUN MEDIA × Report client — ' || private.month_label_uz(pg_temp.last_month()) || ' hisoboti', 'the title uses the Uzbek month name');
select ok(private.month_label_uz(pg_temp.last_month()) ~ '^(Yanvar|Fevral|Mart|Aprel|May|Iyun|Iyul|Avgust|Sentabr|Oktabr|Noyabr|Dekabr) [0-9]{4}$', 'month label format');
select is(((public.get_report(pg_temp.rp('report')) -> 'metrics') @> '[{"key": "social.followers_growth", "value": 250}]'::jsonb), true, 'followers growth is computed from the entered numbers');
select ok(exists (select 1 from jsonb_array_elements(public.get_report(pg_temp.rp('report')) -> 'metrics') m where (m ->> 'internal')::boolean), 'the PM sees internal metrics');
reset role;

select pg_temp.rp_login('owner_user');
select is(public.get_report(pg_temp.rp('report')), null, 'a draft report is invisible to the client');
reset role;

select pg_temp.rp_login('pm');
select lives_ok($$update public.monthly_reports set highlights = 'Obunachilar 25% o''sdi' where id = pg_temp.rp('report')$$, 'the PM writes the highlights');
select lives_ok($$select public.publish_monthly_report(pg_temp.rp('report'))$$, 'the PM publishes');
select throws_ok($$select public.generate_monthly_report(pg_temp.rp('client'), pg_temp.last_month())$$, '22023', null, 'a published report is not silently regenerated');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.rp('owner_user') and type = 'report.published'
                  and title = private.month_label_uz(pg_temp.last_month()) || ' hisobotingiz tayyor'), 'the client is notified in Uzbek');

select pg_temp.rp_login('owner_user');
select is((public.get_report(pg_temp.rp('report')) ->> 'highlights'), 'Obunachilar 25% o''sdi', 'the client reads the published report');
select ok(not exists (select 1 from jsonb_array_elements(public.get_report(pg_temp.rp('report')) -> 'metrics') m where (m ->> 'internal')::boolean),
  'internal metrics never reach the client');
update public.monthly_reports set highlights = 'x' where id = pg_temp.rp('report');
reset role;
select is((select highlights from public.monthly_reports where id = pg_temp.rp('report')), 'Obunachilar 25% o''sdi', 'clients cannot edit reports');

select * from finish();
rollback;
