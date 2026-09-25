-- Approval center: a version sent to the client becomes visible with an approval deadline,
-- per-role queue counts, timecoded revision comments on the client stage. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table ap_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on ap_ids to authenticated, anon;
insert into ap_ids (key) values ('pm'), ('editor'), ('client_owner'), ('client_emp'), ('client');

create function pg_temp.ap(p_key text) returns uuid language sql stable as $$ select id from ap_ids where key = p_key $$;
grant execute on function pg_temp.ap(text) to authenticated, anon;
create function pg_temp.ap_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ap(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.ap_login(text) to authenticated, anon;
create function pg_temp.ap_upload(p_key text, p_name text) returns void language plpgsql as $$
begin
  perform pg_temp.ap_login('editor');
  insert into ap_ids (key, id)
  select p_key, id from public.create_file_upload(p_name, 'video/mp4', 1048576, pg_temp.ap('client'),
    (select id from public.folders where client_id = pg_temp.ap('client') and kind = 'edited'), pg_temp.ap('content'));
  reset role;
  insert into storage.objects (bucket_id, name, owner, metadata)
  select bucket, storage_path, uploaded_by, '{"size": 1048576, "mimetype": "video/mp4"}'::jsonb from public.files where id = pg_temp.ap(p_key);
  perform pg_temp.ap_login('editor');
  perform public.complete_file_upload(pg_temp.ap(p_key), 42000, 1080, 1920);
  reset role;
end $$;
grant execute on function pg_temp.ap_upload(text, text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@approval-tests.local',
       jsonb_build_object('full_name', 'Approval ' || key), '{}'
from ap_ids where key in ('pm', 'editor', 'client_owner', 'client_emp');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from ap_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' else i.key end
where i.key in ('pm', 'editor');
insert into public.employees (user_id) select id from ap_ids where key in ('pm', 'editor');
insert into public.clients (id, name, code) values (pg_temp.ap('client'), 'Approval client', 'AP' || upper(left(replace(pg_temp.ap('client')::text, '-', ''), 10)));
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.ap('client'), pg_temp.ap(k), r.id
from (values ('client_owner', 'client_owner'), ('client_emp', 'client_employee')) m(k, role_key)
join public.roles r on r.key = m.role_key;
insert into public.client_team_members (client_id, user_id, team_role) values
  (pg_temp.ap('client'), pg_temp.ap('pm'), 'project_manager'),
  (pg_temp.ap('client'), pg_temp.ap('editor'), 'editor');

-- Hidden content with an already-expired approval deadline
select pg_temp.ap_login('pm');
insert into ap_ids (key, id)
select 'content', public.save_content(null, jsonb_build_object(
  'client_id', pg_temp.ap('client'), 'title', 'Approval reel', 'content_type', 'reel', 'is_client_visible', false,
  'team', jsonb_build_object('editor', pg_temp.ap('editor'))
));
reset role;
update public.content_items set status = 'editing', client_approval_due_at = now() - interval '1 day' where id = pg_temp.ap('content');

select pg_temp.ap_upload('cut1', 'cut v1.mp4');
select pg_temp.ap_login('editor');
insert into ap_ids (key, id) select 'v1', id from public.submit_content_version(pg_temp.ap('content'), pg_temp.ap('cut1'), 'Birinchi variant');
select is((public.get_approval_counts() ->> 'my_in_review')::int, 1, 'editor sees own version in review');
select is((public.get_approval_counts() ->> 'to_review')::int, 0, 'editor has nothing to review');
reset role;

select pg_temp.ap_login('pm');
select is((public.get_approval_counts() ->> 'to_review')::int, 1, 'PM sees one version to review internally');
reset role;

select pg_temp.ap_login('client_owner');
select is((public.get_approval_counts() ->> 'to_review')::int, 0, 'client queue is empty during internal review');
reset role;

select is((select is_client_visible from public.content_items where id = pg_temp.ap('content')), false, 'content stays hidden during internal review');

select pg_temp.ap_login('pm');
select lives_ok($$select public.review_content_version(pg_temp.ap('v1'), 'approved')$$, 'PM approves internally');
select is((public.get_approval_counts() ->> 'waiting_client')::int, 1, 'PM sees the version waiting on the client');
reset role;

select ok((select is_client_visible from public.content_items where id = pg_temp.ap('content')), 'sending to the client makes the content visible');
select ok((select client_approval_due_at between now() + interval '47 hours' and now() + interval '49 hours' from public.content_items where id = pg_temp.ap('content')),
  'an expired approval deadline is replaced by now + the configured window');

select pg_temp.ap_login('client_owner');
select is((public.get_approval_counts() ->> 'to_review')::int, 1, 'client owner has one version to review');
select is((select count(*)::int from public.content_versions where content_id = pg_temp.ap('content')), 1, 'client reads the version');
select is((select count(*)::int from public.files where id = pg_temp.ap('cut1')), 1, 'client reads the cut file');
select lives_ok($$select public.review_content_version(pg_temp.ap('v1'), 'changes_requested', 'Ikki joy',
  '[{"timecode_ms": 3000, "body": "Logo kattaroq"}, {"timecode_ms": 15500, "body": "Musiqa pastroq"}]'::jsonb)$$, 'client requests changes with timecodes');
select lives_ok($$insert into public.revision_comments (revision_id, timecode_ms, body)
  select id, 20000, 'Yana bitta' from public.revisions where content_id = pg_temp.ap('content')$$, 'client adds a comment to the open revision');
select throws_ok($$update public.revision_comments set is_resolved = true where timecode_ms = 3000$$, '42501', null, 'client cannot resolve comments');
reset role;

select pg_temp.ap_login('client_emp');
select is((public.get_approval_counts() ->> 'to_review')::int, 0, 'client employee without approve permission has no queue');
select is((select count(*)::int from public.revision_comments rc join public.revisions r on r.id = rc.revision_id where r.content_id = pg_temp.ap('content')), 3,
  'client employee still reads the client-stage comments');
reset role;

select pg_temp.ap_login('editor');
select is((public.get_approval_counts() ->> 'my_revisions')::int, 1, 'editor sees one open revision');
select lives_ok($$update public.revisions set status = 'in_progress' where content_id = pg_temp.ap('content')$$, 'editor starts the revision');
select lives_ok($$update public.revision_comments set is_resolved = true where timecode_ms = 3000$$, 'editor resolves a comment');
reset role;
select ok((select resolved_by = pg_temp.ap('editor') from public.revision_comments where timecode_ms = 3000 and body = 'Logo kattaroq'), 'resolver recorded');

-- A manager-set future deadline is kept when the next version goes to the client
update public.content_items set client_approval_due_at = now() + interval '5 days' where id = pg_temp.ap('content');
select pg_temp.ap_upload('cut2', 'cut v2.mp4');
select pg_temp.ap_login('pm');
insert into ap_ids (key, id) select 'v2', id from public.submit_content_version(pg_temp.ap('content'), pg_temp.ap('cut2'), 'Tuzatildi', 'client');
reset role;
select ok((select client_approval_due_at > now() + interval '4 days' from public.content_items where id = pg_temp.ap('content')), 'future deadline kept');
select is((select status::text from public.revisions where content_id = pg_temp.ap('content')), 'resolved', 'a new version resolves the open revision');

select pg_temp.ap_login('editor');
select is((public.get_approval_counts() ->> 'my_revisions')::int, 0, 'no open revisions left');
reset role;

select pg_temp.ap_login('client_owner');
select lives_ok($$select public.review_content_version(pg_temp.ap('v2'), 'approved', 'Zo''r')$$, 'client approves v2');
select is((public.get_approval_counts() ->> 'to_review')::int, 0, 'client queue cleared');
reset role;
select is((select status::text from public.content_items where id = pg_temp.ap('content')), 'approved', 'content approved');

select pg_temp.ap_login('client_owner');
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$select public.get_approval_counts()$$, '42501', null, 'a request without a user cannot read counts');
reset role;

-- The approval window setting is validated in the database too
select throws_ok($$update public.app_settings set value = '0' where key = 'approvals.client_window_hours'$$, '22023', null, 'approval window below 1 hour is rejected');
select throws_ok($$update public.app_settings set value = '"48"' where key = 'approvals.client_window_hours'$$, '22023', null, 'approval window must be a number');
select lives_ok($$update public.app_settings set value = '72' where key = 'approvals.client_window_hours'$$, 'a valid window is accepted');

select * from finish();
rollback;
