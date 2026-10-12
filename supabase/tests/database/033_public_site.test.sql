begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table ps_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into ps_ids(key) values ('owner'), ('admin'), ('editor');
grant select on ps_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from ps_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@site-tests.local',
       jsonb_build_object('full_name', key), '{}'
from ps_ids;
insert into public.user_roles(user_id, role_id) select pg_temp.id('owner'), id from public.roles where key = 'system_owner';
insert into public.user_roles(user_id, role_id) select pg_temp.id('admin'), id from public.roles where key = 'admin';
insert into public.user_roles(user_id, role_id) select pg_temp.id('editor'), id from public.roles where key = 'editor';
insert into public.employees(user_id) select id from ps_ids;

-- Fixtures written by the migration owner.
insert into private.site_gate (id, code_hash) values (true, extensions.crypt('482913', extensions.gen_salt('bf', 4)))
  on conflict (id) do update set code_hash = excluded.code_hash;
delete from private.site_gate_attempts;
delete from public.site_applications;
insert into public.site_services (title, summary, is_published) values ('Yashirin xizmat', 'Saytda chiqmasligi kerak', false);

-- ---------------------------------------------------------------------------
-- Visitors
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.site_settings$$, '42501', null, 'visitor cannot read the settings table directly');
select throws_ok($$select count(*) from public.site_applications$$, '42501', null, 'visitor cannot read applications');
select throws_ok($$insert into public.site_services (title, summary) values ('x', 'y')$$, '42501', null, 'visitor cannot add content');
select throws_ok($$select public.get_site_content()$$, '42501', null, 'visitor cannot call functions; the site is rendered on the server');
select throws_ok($$select public.site_gate_verify('482913', repeat('v', 20))$$, '42501', null, 'visitor cannot call the gate check directly');
select throws_ok($$select public.site_submit_application('A', '+998901234567', '', '', '', '', '/', repeat('v', 20), '')$$, '42501', null, 'visitor cannot insert applications directly');
reset role;
set local role authenticated;
select pg_temp.login('editor');
select throws_ok($$select public.get_site_content()$$, '42501', null, 'signed-in users do not call it either');
reset role;

-- ---------------------------------------------------------------------------
-- Rendering the site and the footer gate (service role = the panel server)
-- ---------------------------------------------------------------------------
set local role service_role;
select ok((public.get_site_content()->'settings'->>'hero_title') is not null, 'the server reads the published site');
select ok(not (public.get_site_content()->'services' @> '[{"title":"Yashirin xizmat"}]'), 'hidden services stay out of the site');
select ok(public.get_site_content()->'settings' ? 'gate_label', 'footer gate label is part of the site');
select ok(not (public.get_site_content()::text ilike '%code_hash%'), 'the gate code never appears in site content');
select is(public.site_gate_verify('000000', repeat('a', 20))->>'reason', 'invalid', 'wrong code is refused');
select is((public.site_gate_verify('111111', repeat('a', 20))->>'remaining')::int, 3, 'remaining attempts count down');
select public.site_gate_verify('222222', repeat('a', 20));
select public.site_gate_verify('333333', repeat('a', 20));
select is(public.site_gate_verify('444444', repeat('a', 20))->>'remaining', '0', 'fifth wrong code leaves no attempts');
select is(public.site_gate_verify('482913', repeat('a', 20))->>'reason', 'locked', 'even the right code is refused while locked');
select ok((public.site_gate_verify('482913', repeat('a', 20))->>'retryAfter')::int between 1 and 900, 'lock tells how long to wait');
select is(public.site_gate_verify('482913', repeat('b', 20))->>'ok', 'true', 'right code opens the gate for another visitor');
select is(public.site_gate_verify('48291', repeat('c', 20))->>'reason', 'invalid', 'five digits are not a code');
select throws_ok($$select public.site_gate_verify('482913', 'short')$$, '22023', null, 'visitor key is required');
reset role;
select is((select count(*)::int from private.site_gate_attempts where fingerprint = repeat('a', 20) and success), 0, 'locked attempts are not recorded as successes');

-- ---------------------------------------------------------------------------
-- Managers
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('editor');
update public.site_settings set hero_title = 'Buzilgan' where id;
select throws_ok($$insert into public.site_services (title, summary) values ('x', 'y')$$, '42501', null, 'staff without site.manage cannot add content');
select is((select count(*)::int from public.site_applications), 0, 'staff without site.manage see no applications');
select throws_ok($$select public.site_gate_status()$$, '42501', null, 'staff without site.manage cannot see gate status');

select pg_temp.login('admin');
select isnt((select hero_title from public.site_settings where id), 'Buzilgan', 'editor changes to the site were ignored by RLS');
update public.site_settings set hero_title = 'Yangi *sarlavha*' where id;
select is((select hero_title from public.site_settings where id), 'Yangi *sarlavha*', 'admin edits site texts');
select lives_ok($$insert into public.site_partners (name, since_year) values ('Hamkor', 2021)$$, 'admin adds a partner');
select throws_ok($$update public.site_pages set is_published = false where key = 'home'$$, '23514', null, 'the landing page cannot be switched off');
select ok((public.site_gate_status()->>'configured')::boolean, 'admin sees the gate is configured');
select throws_ok($$select public.site_gate_set_code('123987')$$, '42501', null, 'admin cannot change the gate code');

select pg_temp.login('owner');
select throws_ok($$select public.site_gate_set_code('12345')$$, '22023', 'SITE_GATE_INVALID_CODE', 'code must be six digits');
select lives_ok($$select public.site_gate_set_code('735104')$$, 'system owner changes the gate code');
reset role;
set local role service_role;
select is(public.site_gate_verify('482913', repeat('d', 20))->>'reason', 'invalid', 'old code stops working');
select is(public.site_gate_verify('735104', repeat('d', 20))->>'ok', 'true', 'new code opens the gate');
reset role;
select ok(not exists (select 1 from public.audit_logs where action = 'site.gate_code_changed' and (new_values::text like '%735104%' or metadata::text like '%735104%')),
  'the audit log never stores the code');

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
set local role service_role;
select isnt(public.site_submit_application('Ali Valiyev', '+998 90 123 45 67', 'Brend', 'https://instagram.com/brend', 'SMM', 'Salom', '/aloqa', repeat('e', 20), 'test'), null, 'server stores an application');
select public.site_submit_application('Ali', '+998901234567', '', '', '', '', '/', repeat('e', 20), '');
select public.site_submit_application('Ali', '+998901234567', '', '', '', '', '/', repeat('e', 20), '');
select throws_ok($$select public.site_submit_application('Ali', '+998901234567', '', '', '', '', '/', repeat('e', 20), '')$$, 'P0001', 'SITE_RATE_LIMITED', 'fourth application in 10 minutes is refused');
select throws_ok($$select public.site_submit_application('Ali', '12', '', '', '', '', '/', repeat('f', 20), '')$$, '23514', null, 'phone is validated');
select throws_ok($$select public.site_submit_application('Ali', '+998901234567', '', 'javascript:alert(1)', '', '', '/', repeat('f', 20), '')$$, '23514', null, 'link must be http(s)');
reset role;
select is((select phone from public.site_applications where full_name = 'Ali Valiyev'), '+998901234567', 'phone is stored as +digits');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('admin') and type = 'site.application'), 'admin is notified of a new application');
select ok(not exists (select 1 from public.notifications where user_id = pg_temp.id('editor') and type = 'site.application'), 'staff without site.manage are not notified');

set local role authenticated;
select pg_temp.login('admin');
update public.site_applications set status = 'seen' where full_name = 'Ali Valiyev';
select is((select handled_by from public.site_applications where full_name = 'Ali Valiyev'), pg_temp.id('admin'), 'marking as seen records who did it');
select throws_ok($$update public.site_applications set phone = '+998900000000'$$, '42501', null, 'application details cannot be rewritten');
select lives_ok($$delete from public.site_applications where full_name = 'Ali'$$, 'admin deletes applications');
reset role;

select * from finish();
rollback;
