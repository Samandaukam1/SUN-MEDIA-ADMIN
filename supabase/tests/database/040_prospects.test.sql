-- Prospect analysis is for the system owner and admins only. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table pr_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into pr_ids(key) values ('sys'), ('admin'), ('rahbar'), ('editor'), ('client_user'), ('client');
grant select on pr_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from pr_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@prospect-tests.local',
       jsonb_build_object('full_name', key), '{}'
from pr_ids where key <> 'client';
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('sys', 'system_owner'), ('admin', 'admin'), ('rahbar', 'owner'), ('editor', 'editor')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id) select id from pr_ids where key in ('sys', 'admin', 'rahbar', 'editor');
insert into public.clients (id, name, code) values (pg_temp.id('client'), 'Prospect test', 'PRT' || upper(left(replace(pg_temp.id('client')::text, '-', ''), 9)));
insert into public.client_members (client_id, user_id, role_id) select pg_temp.id('client'), pg_temp.id('client_user'), id from public.roles where key = 'client_owner';

create temp table pr_run(id uuid);
grant select, insert on pr_run to authenticated;

set local role authenticated;
select pg_temp.login('admin');
select lives_ok($$with p as (insert into public.prospects (name, instagram, answers) values ('Kafe Lazzat', 'lazzat.uz', '{"goal": {"options": ["sales"], "custom": ""}}') returning id) insert into pr_run select id from p$$,
  'an admin adds a prospect');
select lives_ok($$insert into public.prospect_analyses (prospect_id, kind, input, result) select id, 'brief', '{}', '{"summary": "ok"}' from pr_run$$, 'and stores an analysis');
select is((select count(*)::int from public.prospects), 1, 'and reads it');

select pg_temp.login('sys');
select is((select count(*)::int from public.prospects), 1, 'the system owner reads prospects');
select lives_ok($$update public.prospects set status = 'analyzed'$$, 'and edits them');

select pg_temp.login('rahbar');
select is((select count(*)::int from public.prospects), 0, 'the Rahbar does not see prospects');
select throws_ok($$insert into public.prospects (name) values ('X')$$, '42501', null, 'nor add them');
select pg_temp.login('editor');
select is((select count(*)::int from public.prospect_analyses), 0, 'an employee sees no analyses');
select pg_temp.login('client_user');
select is((select count(*)::int from public.prospects), 0, 'a client sees nothing');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('prospects', (select id from pr_run)::text || '/a.png', auth.uid())$$,
  '42501', null, 'nor uploads screenshots');
select pg_temp.login('admin');
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('prospects', (select id from pr_run)::text || '/a.png', auth.uid())$$,
  'an admin uploads a profile screenshot');
reset role;

select ok(not (select public from storage.buckets where id = 'prospects'), 'screenshots are private');

select * from finish();
rollback;
