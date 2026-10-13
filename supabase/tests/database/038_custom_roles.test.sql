-- The system owner renames roles and creates new ones from a base role; nobody else can. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table cr_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into cr_ids(key) values ('sys'), ('admin'), ('worker');
grant select on cr_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from cr_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@roles-tests.local',
       jsonb_build_object('full_name', key), '{}'
from cr_ids;
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('sys', 'system_owner'), ('admin', 'admin'), ('worker', 'editor')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id) select id from cr_ids;

create temp table cr_run(key text primary key, id uuid, rkey text);
grant select, insert on cr_run to authenticated;

set local role authenticated;
select pg_temp.login('admin');
select throws_ok($$select public.create_custom_role('Targetolog', 'smm_manager')$$, '42501', null, 'an admin cannot create roles');
select throws_ok($$select public.rename_role((select id from public.roles where key = 'editor'), 'Video montajchi')$$, '42501', null, 'or rename them');

select pg_temp.login('sys');
select lives_ok($$select public.rename_role((select id from public.roles where key = 'editor'), 'Video montajchi')$$, 'the system owner renames a built-in role');
select throws_ok($$select public.rename_role((select id from public.roles where key = 'editor'), '')$$, '22023', null, 'a name is required');
select throws_ok($$select public.rename_role((select id from public.roles where key = 'designer'), 'video MONTAJCHI')$$, '23505', null, 'names stay unique');
insert into cr_run select 'target', r.id, r.key from public.create_custom_role('Targetolog', 'smm_manager') r;
select throws_ok($$select public.create_custom_role('Rahbar 2', 'system_owner')$$, '22023', null, 'nobody is created at the system owner''s level');
select throws_ok($$select public.create_custom_role('Targetolog', 'editor')$$, '23505', null, 'a second role with the same name is refused');
select lives_ok($$select public.change_staff_role(pg_temp.id('worker'), (select rkey from cr_run where key = 'target'))$$, 'the new role is assigned like any other');
select throws_ok($$select public.delete_custom_role((select id from cr_run where key = 'target'))$$, '22023', null, 'a role in use is not deleted');
select throws_ok($$select public.delete_custom_role((select id from public.roles where key = 'editor'))$$, '22023', null, 'built-in roles are never deleted');
reset role;

select is((select key from public.roles where name = 'Video montajchi'), 'editor', 'renaming keeps the internal key');
select ok((select key from public.roles where id = (select id from cr_run where key = 'target')) ~ '^custom_[0-9a-f]{12}$', 'new roles get their own key');
select is((select rank from public.roles where id = (select id from cr_run where key = 'target')), (select rank from public.roles where key = 'smm_manager'),
  'a new role sits at its base role''s level');
select set_eq($$select permission_key from public.role_permissions where role_id = (select id from cr_run where key = 'target')$$,
              $$select rp.permission_key from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'smm_manager'$$,
  'it starts with the base role''s permissions');

set local role authenticated;
select pg_temp.login('worker');
select ok(private.has_permission('analytics.manage'), 'and the person really gets them');
select pg_temp.login('sys');
select lives_ok($$select public.change_staff_role(pg_temp.id('worker'), 'editor')$$, 'moved back');
select lives_ok($$select public.delete_custom_role((select id from cr_run where key = 'target'))$$, 'an unused new role is deleted');
reset role;

select * from finish();
rollback;
