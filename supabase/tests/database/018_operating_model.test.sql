-- Operating model: the Tizim egasi is untouchable from below and web-only; the Rahbar only observes;
-- clients cannot approve anything. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table om_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on om_ids to authenticated, anon;
insert into om_ids (key) values ('system'), ('rahbar'), ('admin');
create function pg_temp.om(p_key text) returns uuid language sql stable as $$ select id from om_ids where key = p_key $$;
grant execute on function pg_temp.om(text) to authenticated, anon;
create function pg_temp.om_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.om(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.om_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@model-tests.local', jsonb_build_object('full_name', key), '{}'
from om_ids;
insert into public.user_roles (user_id, role_id)
select i.id, r.id from om_ids i join public.roles r on r.key = case i.key when 'system' then 'system_owner' when 'rahbar' then 'owner' else 'admin' end;
insert into public.employees (user_id) select id from om_ids;

select pg_temp.om_login('admin');
select throws_ok($$select public.set_account_status(pg_temp.om('system'), 'suspended', 'x')$$, '42501', null, 'admin cannot block the Tizim egasi');
select throws_ok($$select public.authorize_password_reset(pg_temp.om('system'))$$, '42501', null, 'admin cannot reset the Tizim egasi password');
select throws_ok($$select public.change_staff_role(pg_temp.om('system'), 'editor')$$, '42501', null, 'admin cannot change the Tizim egasi role');
select throws_ok($$select public.set_staff_permissions(pg_temp.om('system'), '{}')$$, '42501', null, 'admin cannot change the Tizim egasi permissions');
select throws_ok(
  $$delete from public.role_permissions rp using public.roles r where r.id = rp.role_id and r.key = 'operator' and rp.permission_key = 'files.upload'$$,
  '42501', null, 'only the Tizim egasi changes what a whole role may do');
select throws_ok($$select public.system_sessions()$$, '42501', null, 'admins do not see sessions');
reset role;

select pg_temp.om_login('system');
select is(public.get_my_context() ->> 'interface', null, 'the Tizim egasi has no mobile interface');
select ok((public.get_my_context() -> 'permissions') ? 'employees.manage', 'the Tizim egasi holds every permission');
select lives_ok($$select public.system_sessions()$$, 'the Tizim egasi sees sessions');
reset role;

select pg_temp.om_login('rahbar');
select is(public.get_my_context() ->> 'interface', 'management', 'the Rahbar uses the management app');
select ok(not ((public.get_my_context() -> 'permissions') ? 'tasks.manage'), 'the Rahbar only observes (no task management)');
select ok((public.get_my_context() -> 'permissions') ? 'chat.observe', 'the Rahbar reads client chats');
reset role;

select is(private.client_stage_enabled(), false, 'the client approval stage is off');

select * from finish();
rollback;
