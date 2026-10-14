-- Daily attendance and posts: KELDIM every day once, the employee's confirmation kept apart from corrections,
-- nobody edits or deletes their own day, a post is confirmed only with its link. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table da_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into da_ids(key) values ('rahbar'), ('admin'), ('emp'), ('smm'), ('client');
grant select, insert on da_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from da_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@da-tests.local',
       jsonb_build_object('full_name', initcap(key)), '{}'
from da_ids;
insert into public.user_roles(user_id, role_id)
select pg_temp.id(k), r.id from (values ('rahbar', 'owner'), ('admin', 'admin'), ('emp', 'staff'), ('smm', 'smm_manager')) v(k, rk) join public.roles r on r.key = v.rk;
insert into public.employees(user_id, work_start_time, work_end_time) select pg_temp.id(k), '10:00', '18:00' from unnest(array['rahbar', 'admin', 'emp', 'smm']) k;
insert into public.clients(id, name, code, status) values (pg_temp.id('client'), 'DA Test Client', 'DAT', 'active');
update public.app_settings set value = '"00:00"' where key = 'attendance.check_in_from';

-- Yesterday's day never blocks today's.
insert into public.attendance(user_id, work_date, status, arrived_at) values (pg_temp.id('emp'), (now() at time zone 'Asia/Tashkent')::date - 1, 'present', '09:58');
set local role authenticated;
select pg_temp.login('emp');
select lives_ok($$select public.check_in()$$, 'yesterday’s record does not stop today’s KELDIM');
select throws_ok($$select public.check_in()$$, '23505', 'ALREADY_CHECKED_IN', 'a second KELDIM the same day is refused');
reset role;
select is((select count(*) from public.attendance where user_id = pg_temp.id('emp')), 2::bigint, 'one record per day: yesterday and today');
select is((select source from public.attendance where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date), 'self',
  'today’s record says the employee confirmed it');
select ok((select checked_in_at is not null from public.attendance where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date),
  'with the server time of the press');

-- A correction is a correction.
set local role authenticated;
select pg_temp.login('rahbar');
select lives_ok($$update public.attendance set arrived_at = '10:20', status = 'late', correction_note = 'Kartadan tekshirildi'
  where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date$$, 'the Rahbar corrects the arrival time');
reset role;
select is((select array[source, corrected_by::text, late_minutes::text] from public.attendance where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date),
  array['self', pg_temp.id('rahbar')::text, '20'], 'it stays the employee’s confirmation, marked as corrected, lateness from their own start time');
select ok((select checked_in_at is not null from public.attendance where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date),
  'and the original KELDIM time is kept');
select ok((select count(*) from public.attendance_history h join public.attendance a on a.id = h.attendance_id where a.user_id = pg_temp.id('emp')) >= 2,
  'the history keeps every change');

set local role authenticated;
select pg_temp.login('rahbar');
select throws_ok($$insert into public.attendance(user_id, work_date, status) values (pg_temp.id('smm'), (now() at time zone 'Asia/Tashkent')::date, 'present')$$,
  '22023', 'ATTENDANCE_REASON_REQUIRED', 'nobody marks a colleague “came” without the time and a reason (no bulk “everyone present”)');
select lives_ok($$insert into public.attendance(user_id, work_date, status) values (pg_temp.id('smm'), (now() at time zone 'Asia/Tashkent')::date, 'vacation')$$,
  'a vacation day is set by the Rahbar');
select throws_ok($$delete from public.attendance where user_id = pg_temp.id('emp') and work_date = (now() at time zone 'Asia/Tashkent')::date$$,
  '42501', 'SELF_ATTENDANCE_KEPT', 'a self-confirmed day is not deleted');
select lives_ok($$select public.check_in()$$, 'the Rahbar presses KELDIM for himself');
select throws_ok($$update public.attendance set arrived_at = '09:00' where user_id = pg_temp.id('rahbar')$$, '42501', 'OWN_ATTENDANCE_LOCKED',
  'but cannot change his own day');
select pg_temp.login('emp');
select is((select count(*) from public.attendance where user_id = pg_temp.id('rahbar')), 0::bigint, 'an employee does not see others’ days');
reset role;

-- The roster shows schedule, source and correction.
set local role authenticated;
select pg_temp.login('rahbar');
select is((select array[source, corrected_by_name, work_end_time::text] from public.get_attendance_day((now() at time zone 'Asia/Tashkent')::date) where user_id = pg_temp.id('emp')),
  array['self', 'Rahbar', '18:00:00'], 'the roster tells the Rahbar who confirmed and who corrected');

-- Posts: planned platforms, confirmed by hand with the link.
insert into da_ids(key, id) select 'content', public.create_content_task(jsonb_build_object(
  'title', 'Post sinovi', 'topic', 'Mavzu', 'client_id', pg_temp.id('client'), 'content_type', 'post', 'post_at', now() + interval '1 day',
  'responsible_ids', jsonb_build_array(pg_temp.id('smm')), 'platforms', jsonb_build_array('instagram', 'telegram')));
reset role;
select set_eq($$select platform::text from public.content_publications where content_id = pg_temp.id('content')$$, array['instagram', 'telegram'], 'both platforms are planned');
select is((select count(*) from public.content_publications where content_id = pg_temp.id('content') and status = 'scheduled'), 2::bigint, 'with the post time');
set local role authenticated;
select pg_temp.login('smm');
select throws_ok($$update public.tasks set status = 'done' where content_id = pg_temp.id('content') and stage = 'publishing'$$, '42501', null,
  'a post is not marked done without its link');
select throws_ok($$select public.confirm_publication(pg_temp.id('content'), '{"instagram": "instagram"}')$$, '22023', 'POST_LINK_INVALID', 'the link must be a real link');
select lives_ok($$select public.confirm_publication(pg_temp.id('content'), '{"instagram": "https://instagram.com/p/abc"}')$$, 'one platform confirmed');
reset role;
select is((select status::text from public.tasks where content_id = pg_temp.id('content') and stage = 'publishing'), 'in_progress', 'the stage waits for the other platform');
set local role authenticated;
select pg_temp.login('smm');
select lives_ok($$select public.confirm_publication(pg_temp.id('content'), '{"telegram": "https://t.me/brend/12"}')$$, 'the second platform confirmed');
reset role;
select is((select status::text from public.tasks where content_id = pg_temp.id('content') and stage = 'publishing'), 'done', 'then the post stage is done');
select is((select status::text from public.content_items where id = pg_temp.id('content')), 'published', 'and the content is published');
select is((select post_url from public.content_publications where content_id = pg_temp.id('content') and platform = 'instagram'), 'https://instagram.com/p/abc', 'links are kept');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.id('rahbar') and type = 'content.published'), 'the Rahbar is told');

select * from finish();
rollback;
