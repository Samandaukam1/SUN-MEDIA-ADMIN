-- Only the system owner adds clients, client logins and employees (unless they hand the right to someone);
-- the system owner edits everyone below, the Rahbar included. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table oc_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into oc_ids(key) values ('sys'), ('rahbar'), ('admin'), ('fresh1'), ('fresh2'), ('fresh3'), ('fresh4'), ('client');
grant select on oc_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from oc_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@owner-tests.local',
       jsonb_build_object('full_name', key), '{}', now()
from oc_ids where key <> 'client';
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('sys', 'system_owner'), ('rahbar', 'owner'), ('admin', 'admin')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id) select id from oc_ids where key in ('sys', 'rahbar', 'admin');
insert into public.clients (id, name, code) values (pg_temp.id('client'), 'Owner test', 'OC' || upper(left(replace(pg_temp.id('client')::text, '-', ''), 10)));

select ok(exists (select 1 from public.permissions where key = 'clients.create'), 'the "add clients" right exists');
select ok(exists (select 1 from public.permissions where key = 'employees.create'), 'the "add employees" right exists');
select is((select count(*)::int from public.role_permissions where permission_key in ('clients.create', 'employees.create')), 0,
  'no role has them by default');

-- ---------------------------------------------------------------------------
-- Admin: keeps managing, cannot add
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('admin');
select throws_ok($$insert into public.clients (name, code) values ('Admin client', 'ADMNEW1')$$, '42501', null, 'an admin cannot add a client');
select throws_ok($$select public.provision_staff_member(pg_temp.id('fresh1'), 'Yangi', 'Xodim', 'editor')$$, '42501', null, 'an admin cannot add an employee');
select throws_ok($$select public.provision_client_user(pg_temp.id('fresh2'), pg_temp.id('client'), 'client_employee', 'Yangi', 'Mijoz')$$,
  '42501', null, 'an admin cannot add a client login');
select lives_ok($$update public.clients set industry = 'Restoran' where id = pg_temp.id('client')$$, 'an admin still edits clients');
select throws_ok($$select public.update_account_profile(pg_temp.id('rahbar'), 'Boshqa', 'Ism', null)$$, '42501', null,
  'an admin cannot rename the Rahbar (higher rank)');
reset role;

-- ---------------------------------------------------------------------------
-- System owner: adds, and edits everyone
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('sys');
select lives_ok($$insert into public.clients (name, code) values ('Owner client', 'SYSNEW1')$$, 'the system owner adds a client');
select lives_ok($$select public.provision_staff_member(pg_temp.id('fresh1'), 'Yangi', 'Xodim', 'editor')$$, 'the system owner adds an employee');
select lives_ok($$select public.provision_client_user(pg_temp.id('fresh2'), pg_temp.id('client'), 'client_employee', 'Yangi', 'Mijoz')$$,
  'the system owner adds a client login');
select lives_ok($$select public.update_account_profile(pg_temp.id('rahbar'), 'Bahodir', 'Rahbarov', null)$$, 'the system owner renames the Rahbar');
select lives_ok($$select public.update_account_profile(pg_temp.id('sys'), 'Anisjon', 'Asosiy', null)$$, 'and their own name');
select lives_ok($$select public.change_staff_role(pg_temp.id('rahbar'), 'director')$$, 'the system owner changes the Rahbar''s role');
select lives_ok($$select public.change_staff_role(pg_temp.id('rahbar'), 'owner')$$, 'and back');
select lives_ok($$select public.set_staff_permissions(pg_temp.id('admin'), array['clients.create'])$$, 'the system owner can hand "add clients" to an admin');
reset role;
select is((select full_name from public.profiles where id = pg_temp.id('rahbar')), 'Bahodir Rahbarov', 'the Rahbar''s new name is saved');

set local role authenticated;
select pg_temp.login('admin');
select lives_ok($$insert into public.clients (name, code) values ('Delegated client', 'DLGNEW1')$$, 'with the right handed over, the admin adds a client');
select throws_ok($$select public.provision_staff_member(pg_temp.id('fresh3'), 'Yana', 'Xodim', 'editor')$$, '42501', null,
  'but still not employees');
select throws_ok($$select public.set_staff_permissions(pg_temp.id('admin'), array['clients.create', 'employees.create'])$$, '42501', null,
  'and cannot give themself more');
reset role;

select * from finish();
rollback;
