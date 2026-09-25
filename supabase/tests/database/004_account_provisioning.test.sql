-- Account provisioning rules: who may create which login, fresh-account guard, permission delegation,
-- client member grants, account status and password-reset authorization. Seed-safe, rolled back.
-- npx supabase test db --local supabase/tests/database/004_account_provisioning.test.sql
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ap_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on ap_ids to authenticated, anon;
insert into ap_ids (key) values
  ('owner'), ('owner2'), ('admin'), ('pm'), ('editor'), ('client'), ('client_user'),
  ('new_editor'), ('new_owner'), ('new_client_emp'), ('stale'), ('new_by_pm');

create function pg_temp.ap(p_key text) returns uuid language sql stable as $$ select id from ap_ids where key = p_key $$;
grant execute on function pg_temp.ap(text) to authenticated, anon;
create function pg_temp.ap_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ap(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.ap_login(text) to authenticated, anon;

-- Existing accounts plus fresh logins (as the Auth admin API would create them)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@provision-tests.local',
       jsonb_build_object('full_name', key), '{}',
       case when key = 'stale' then now() - interval '2 hours' else now() end
from ap_ids where key <> 'client';

insert into public.user_roles (user_id, role_id)
select i.id, r.id from ap_ids i join public.roles r on r.key = case i.key when 'owner2' then 'owner' when 'pm' then 'project_manager' else i.key end
where i.key in ('owner', 'owner2', 'admin', 'pm', 'editor');
insert into public.employees (user_id) select id from ap_ids where key in ('owner', 'owner2', 'admin', 'pm', 'editor');
insert into public.clients (id, name, code) values (pg_temp.ap('client'), 'Provision test', 'PV' || upper(left(replace(pg_temp.ap('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.ap('client'), pg_temp.ap('client_user'), id from public.roles where key = 'client_owner';

-- ---------------------------------------------------------------------------
-- Staff provisioning
-- ---------------------------------------------------------------------------
select pg_temp.ap_login('admin');
select lives_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_editor'), '  Jasur ', 'Karimov', 'editor', 'Montajyor', '+998 90 123-45-67',
      null, 'full_time', '{}', array[pg_temp.ap('client')])$$,
  'admin provisions an editor');
reset role;
select is((select full_name from public.profiles where id = pg_temp.ap('new_editor')), 'Jasur Karimov', 'names are cleaned and joined');
select is((select phone from public.profiles where id = pg_temp.ap('new_editor')), '+998901234567', 'phone is normalised');
select ok(exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                  where ur.user_id = pg_temp.ap('new_editor') and r.key = 'editor'), 'role assigned');
select is((select team_role::text from public.client_team_members where user_id = pg_temp.ap('new_editor')), 'editor', 'client team role derived from the role');
select ok(exists (select 1 from public.audit_logs where action = 'account.created' and entity_id = pg_temp.ap('new_editor')::text
                  and actor_id = pg_temp.ap('admin')), 'account creation is audited with the actor');

select pg_temp.ap_login('admin');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_owner'), 'Yangi', 'Owner', 'owner')$$,
  '42501', null, 'admin cannot create an owner');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_editor'), 'Jasur', 'Karimov', 'editor')$$,
  '22023', null, 'an already provisioned account cannot be provisioned again');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('stale'), 'Eski', 'Login', 'editor')$$,
  '22023', null, 'only freshly created logins can be provisioned');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_owner'), 'Mijoz', 'Rol', 'client_owner')$$,
  '22023', null, 'client roles are not staff roles');
reset role;

select pg_temp.ap_login('editor');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_owner'), 'Yangi', 'Xodim', 'editor')$$,
  '42501', null, 'an editor cannot provision accounts');
reset role;

-- A manager with employees.manage cannot hand out permissions they do not hold
insert into public.user_permissions (user_id, permission_key) values (pg_temp.ap('pm'), 'employees.manage');
select pg_temp.ap_login('pm');
select throws_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_by_pm'), 'Yangi', 'Operator', 'operator', null, null, null, 'full_time', array['finance.read'])$$,
  '42501', null, 'permissions cannot be delegated beyond your own');
select lives_ok(
  $$select public.provision_staff_member(pg_temp.ap('new_by_pm'), 'Yangi', 'Operator', 'operator')$$,
  'manager with employees.manage provisions an operator');
reset role;

select pg_temp.ap_login('owner');
select lives_ok($$select public.provision_staff_member(pg_temp.ap('new_owner'), 'Ikkinchi', 'Owner', 'director')$$, 'owner can create a director');
reset role;

-- ---------------------------------------------------------------------------
-- Client logins
-- ---------------------------------------------------------------------------
select pg_temp.ap_login('client_user');
select throws_ok(
  $$select public.provision_client_user(pg_temp.ap('new_client_emp'), pg_temp.ap('client'), 'client_employee', 'Mijoz', 'Xodimi')$$,
  '42501', null, 'client users cannot create logins');
reset role;

select pg_temp.ap_login('admin');
select lives_ok(
  $$select public.provision_client_user(pg_temp.ap('new_client_emp'), pg_temp.ap('client'), 'client_employee', 'Mijoz', 'Xodimi',
      null, 'Marketing', array['client.approve'])$$,
  'admin creates a client employee who may approve');
select throws_ok(
  $$select public.set_client_member_permissions(pg_temp.ap('client'), pg_temp.ap('new_client_emp'), array['finance.read'])$$,
  '22023', null, 'staff permissions cannot be granted to client users');
reset role;

select pg_temp.ap_login('new_client_emp');
select ok((public.get_my_context() -> 'clients' -> 0 -> 'permissions') ? 'client.approve', 'granted approval shows in the session context');
reset role;
select ok(pg_temp.ap('new_client_emp') = any (private.client_users_with_permission(pg_temp.ap('client'), 'client.approve')),
  'granted approver receives approval alerts');

select pg_temp.ap_login('admin');
select lives_ok($$select public.set_client_member_permissions(pg_temp.ap('client'), pg_temp.ap('new_client_emp'), '{}')$$, 'approval right can be withdrawn');
reset role;
select pg_temp.ap_login('new_client_emp');
select ok(not ((public.get_my_context() -> 'clients' -> 0 -> 'permissions') ? 'client.approve'), 'withdrawn right disappears from the context');
reset role;

-- ---------------------------------------------------------------------------
-- Account status and password reset
-- ---------------------------------------------------------------------------
select pg_temp.ap_login('admin');
select throws_ok($$select public.set_account_status(pg_temp.ap('editor'), 'suspended')$$, '22023', null, 'blocking needs a reason');
select lives_ok($$select public.set_account_status(pg_temp.ap('editor'), 'suspended', 'Tekshiruv')$$, 'admin suspends an editor');
select throws_ok($$select public.set_account_status(pg_temp.ap('owner'), 'disabled', 'x')$$, '42501', null, 'admin cannot block an owner');
select throws_ok($$select public.set_account_status(pg_temp.ap('admin'), 'disabled', 'x')$$, '42501', null, 'nobody blocks themselves');
select is(public.authorize_password_reset(pg_temp.ap('editor')), (select email from public.profiles where id = pg_temp.ap('editor')),
  'admin may reset an editor password');
select throws_ok($$select public.authorize_password_reset(pg_temp.ap('owner'))$$, '42501', null, 'admin cannot reset an owner password');
reset role;

select pg_temp.ap_login('editor');
select is(public.get_my_context() ->> 'status', 'disabled', 'a suspended account is shut out of the app');
select is((select count(*)::int from public.clients), 0, 'a suspended account reads nothing');
reset role;

select pg_temp.ap_login('client_user');
select throws_ok($$select public.authorize_password_reset(pg_temp.ap('editor'))$$, '42501', null, 'client users cannot reset passwords');
reset role;

-- Owner-level accounts: only owners manage owners (the last-active-owner guard is defence in depth).
select pg_temp.ap_login('new_owner');
select throws_ok($$select public.set_account_status(pg_temp.ap('owner2'), 'suspended', 'x')$$, '42501', null,
  'a director cannot block an owner');
reset role;
select pg_temp.ap_login('owner');
select lives_ok($$select public.set_account_status(pg_temp.ap('owner2'), 'suspended', 'Ta’til')$$, 'an owner can block another owner');
select lives_ok($$select public.set_account_status(pg_temp.ap('owner2'), 'active')$$, 'and restore it without a reason');
reset role;
select is((select status::text from public.profiles where id = pg_temp.ap('owner2')), 'active', 'owner account is active again');
select ok(exists (select 1 from public.audit_logs where action = 'account.status_changed' and entity_id = pg_temp.ap('owner2')::text),
  'status changes are audited');

select * from finish();
rollback;
