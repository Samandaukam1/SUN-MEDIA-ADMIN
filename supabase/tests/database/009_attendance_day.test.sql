-- Daily attendance: office-only marking, automatic lateness from the work start + grace, roster
-- for any day, history kept. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table at_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on at_ids to authenticated, anon;
insert into at_ids (key) values ('admin'), ('editor'), ('operator');

create function pg_temp.at(p_key text) returns uuid language sql stable as $$ select id from at_ids where key = p_key $$;
grant execute on function pg_temp.at(text) to authenticated, anon;
create function pg_temp.at_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.at(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.at_login(text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@att-tests.local',
       jsonb_build_object('full_name', 'Att ' || key), '{}'
from at_ids;
insert into public.user_roles (user_id, role_id) select i.id, r.id from at_ids i join public.roles r on r.key = i.key;
insert into public.employees (user_id, work_start_time, work_days) select id, '09:00', '{1,2,3,4,5,6}' from at_ids;

-- 2026-09-28 is a Monday
select pg_temp.at_login('admin');
select lives_ok($$insert into public.attendance (user_id, work_date, status, arrived_at) values (pg_temp.at('editor'), '2026-09-28', 'present', '09:40')$$,
  'admin marks the editor as arrived at 09:40');
select lives_ok($$insert into public.attendance (user_id, work_date, status, arrived_at) values (pg_temp.at('operator'), '2026-09-28', 'late', '09:05')$$,
  'admin marks the operator late at 09:05');
reset role;
select is((select status::text || ':' || late_minutes from public.attendance where user_id = pg_temp.at('editor') and work_date = '2026-09-28'), 'late:40',
  'an arrival after start + grace becomes late with minutes');
select is((select status::text || ':' || late_minutes from public.attendance where user_id = pg_temp.at('operator') and work_date = '2026-09-28'), 'present:0',
  'an arrival within the grace period is on time');

select pg_temp.at_login('admin');
select is((select count(*)::int from public.get_attendance_day('2026-09-28') d where d.user_id in (select id from at_ids)), 3, 'roster lists every scheduled employee');
select is((select d.status::text from public.get_attendance_day('2026-09-28') d where d.user_id = pg_temp.at('admin')), null, 'unmarked employees appear without a status');
select is((select d.marked_by_name from public.get_attendance_day('2026-09-28') d where d.user_id = pg_temp.at('editor')), 'Att admin', 'who marked is shown');
select is((select count(*)::int from public.get_attendance_day('2026-09-27') d where d.user_id in (select id from at_ids)), 0, 'Sunday is a day off by default');
reset role;

select pg_temp.at_login('editor');
select throws_ok($$select * from public.get_attendance_day('2026-09-28')$$, '42501', null, 'employees cannot read the office roster');
select throws_ok($$insert into public.attendance (user_id, work_date, status) values (pg_temp.at('editor'), '2026-09-29', 'present')$$, '42501', null, 'no self check-in');
select is((select count(*)::int from public.attendance where user_id = pg_temp.at('editor')), 1, 'but they see their own record');
reset role;

select pg_temp.at_login('admin');
select lives_ok($$update public.attendance set status = 'excused', note = 'Shifokorda' where user_id = pg_temp.at('editor') and work_date = '2026-09-28'$$, 'admin corrects to excused');
reset role;
select is((select count(*)::int from public.attendance_history where user_id = pg_temp.at('editor')), 2, 'both marks are kept in history');
select is((select arrived_at from public.attendance where user_id = pg_temp.at('editor') and work_date = '2026-09-28'), null::time, 'excused clears the arrival time');

select * from finish();
rollback;
