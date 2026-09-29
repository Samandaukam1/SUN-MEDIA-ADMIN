-- Free vs Pro: on Free the advanced features refuse with P0402 (the app shows the upgrade sheet) while the
-- everyday basics keep working; on the internal Pro licence everything is open. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table fg_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on fg_ids to authenticated;
insert into fg_ids (key) values ('admin'), ('editor'), ('client');
create function pg_temp.f(p_key text) returns uuid language sql stable as $$ select id from fg_ids where key = p_key $$;
grant execute on function pg_temp.f(text) to authenticated;
create function pg_temp.f_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.f(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.f_login(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@gate-tests.local',
       jsonb_build_object('full_name', key), '{}'
from fg_ids where key in ('admin', 'editor');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from fg_ids i join public.roles r on r.key = case i.key when 'admin' then 'admin' else 'editor' end where i.key in ('admin', 'editor');
insert into public.employees (user_id) select id from fg_ids where key in ('admin', 'editor');
insert into public.clients (id, name, code) values (pg_temp.f('client'), 'Gate Test', 'GATET');

-- Pro (internal licence): advanced features open
select pg_temp.f_login('admin');
select lives_ok($$insert into public.projects (client_id, name) values (pg_temp.f('client'), 'Pro loyiha')$$, 'Pro: projects open');
select lives_ok($$select public.get_employee_scorecards(current_date - 7, current_date, null)$$, 'Pro: KPI open');
reset role;

-- Free
update public.workspace_subscriptions set status = 'cancelled' where source = 'internal';
select pg_temp.f_login('admin');
select throws_ok($$insert into public.projects (client_id, name) values (pg_temp.f('client'), 'Free loyiha')$$, 'P0402', null, 'Free: projects are Pro (workflow.advanced)');
select throws_ok($$insert into public.user_permissions (user_id, permission_key) values (pg_temp.f('editor'), 'tasks.manage')$$, 'P0402', null,
  'Free: extra per-person permissions are Pro');
select throws_ok($$insert into public.folders (client_id, name, kind, visibility, is_system) values (pg_temp.f('client'), 'Maxsus', 'custom', 'internal', false)$$,
  'P0402', null, 'Free: custom folders are Pro');
select throws_ok($$select public.get_employee_scorecards(current_date - 7, current_date, null)$$, 'P0402', null, 'Free: KPI is Pro');
select throws_ok($$select public.generate_monthly_report(pg_temp.f('client'), date_trunc('month', current_date - 20)::date)$$, 'P0402', null,
  'Free: monthly reports are Pro');
select is((select count(*)::int from public.audit_logs), 0, 'Free: the audit journal is closed (still recorded)');
-- Basics stay free
select lives_ok($$select public.save_task(null, jsonb_build_object('title', 'Oddiy vazifa', 'client_id', pg_temp.f('client')))$$, 'Free: tasks keep working');
select lives_ok($$select public.send_message((select id from public.chat_rooms where kind = 'internal' and is_default), 'Salom')$$, 'Free: chat keeps working');
select ok((select count(*) from public.folders where client_id = pg_temp.f('client') and is_system) > 0, 'Free: every client still gets its system folders');
reset role;

select * from finish();
rollback;
