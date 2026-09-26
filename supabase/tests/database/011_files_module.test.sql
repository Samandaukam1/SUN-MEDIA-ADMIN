-- Files module: task attachments follow task visibility, moving files stays within the client and
-- adopts the folder's visibility, soft removal rules, folder read models. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table fm_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on fm_ids to authenticated, anon;
insert into fm_ids (key) values ('pm'), ('editor'), ('other_editor'), ('client_user'), ('client'), ('other_client');

create function pg_temp.fm(p_key text) returns uuid language sql stable as $$ select id from fm_ids where key = p_key $$;
grant execute on function pg_temp.fm(text) to authenticated, anon;
create function pg_temp.fm_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.fm(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.fm_login(text) to authenticated, anon;
create function pg_temp.fm_store(p_key text) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  select bucket, storage_path, uploaded_by, jsonb_build_object('size', size_bytes, 'mimetype', mime_type) from public.files where id = pg_temp.fm(p_key);
end $$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@files-tests.local',
       jsonb_build_object('full_name', 'Files ' || key), '{}'
from fm_ids where key in ('pm', 'editor', 'other_editor', 'client_user');
insert into public.user_roles (user_id, role_id)
select i.id, r.id from fm_ids i join public.roles r on r.key = case i.key when 'pm' then 'project_manager' else 'editor' end
where i.key in ('pm', 'editor', 'other_editor');
insert into public.employees (user_id) select id from fm_ids where key in ('pm', 'editor', 'other_editor');
insert into public.clients (id, name, code)
select id, 'Files ' || key, 'FM' || upper(left(replace(id::text, '-', ''), 10)) from fm_ids where key in ('client', 'other_client');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.fm('client'), pg_temp.fm('client_user'), id from public.roles where key = 'client_owner';
insert into public.client_team_members (client_id, user_id, team_role) values (pg_temp.fm('client'), pg_temp.fm('pm'), 'project_manager');

-- A client task assigned to the editor
select pg_temp.fm_login('pm');
insert into fm_ids (key, id)
select 'task', public.save_task(null, jsonb_build_object('client_id', pg_temp.fm('client'), 'title', 'Montaj fayllari', 'task_type', 'editing',
  'assignees', jsonb_build_array(pg_temp.fm('editor'))));
reset role;

-- Task attachments
select pg_temp.fm_login('editor');
select lives_ok($$insert into fm_ids (key, id) select 'att', id from public.create_file_upload('brief.pdf', 'application/pdf', 2048, p_task_id => pg_temp.fm('task'))$$,
  'assignee attaches a file to the task');
reset role;
select is((select visibility::text from public.files where id = pg_temp.fm('att')), 'internal', 'task attachments are internal');
select is((select client_id from public.files where id = pg_temp.fm('att')), pg_temp.fm('client'), 'attachment belongs to the task client');
select ok((select storage_path like pg_temp.fm('client')::text || '/tasks/%' from public.files where id = pg_temp.fm('att')), 'stored under the client task area');
select pg_temp.fm_store('att');
select pg_temp.fm_login('editor');
select is((public.complete_file_upload(pg_temp.fm('att'))).status::text, 'uploaded', 'attachment upload completes');
reset role;

select pg_temp.fm_login('other_editor');
select throws_ok($$select public.create_file_upload('x.pdf', 'application/pdf', 10, p_task_id => pg_temp.fm('task'))$$, '42501', null,
  'an editor outside the task cannot attach files');
select is((select count(*)::int from public.files where id = pg_temp.fm('att')), 0, 'an editor outside the task cannot read its attachments');
reset role;

select pg_temp.fm_login('pm');
select is((select count(*)::int from public.files where id = pg_temp.fm('att')), 1, 'the task manager reads the attachment');
reset role;

select pg_temp.fm_login('client_user');
select throws_ok($$select public.create_file_upload('x.pdf', 'application/pdf', 10, p_task_id => pg_temp.fm('task'))$$, '42501', null,
  'clients cannot attach files to tasks');
select is((select count(*)::int from public.files where id = pg_temp.fm('att')), 0, 'clients never see task attachments');
reset role;

select throws_ok($$update public.files set visibility = 'client' where id = pg_temp.fm('att')$$, '22023', null, 'task attachments cannot be shared with the client');

-- Folder uploads and moves
insert into fm_ids (key, id) select 'foreign_folder', id from public.folders where client_id = pg_temp.fm('other_client') and kind = 'photos';
select pg_temp.fm_login('pm');
insert into fm_ids (key, id)
select 'raw', id from public.create_file_upload('raw.mov', 'video/quicktime', 4096, pg_temp.fm('client'),
  (select id from public.folders where client_id = pg_temp.fm('client') and kind = 'raw'));
reset role;
select pg_temp.fm_store('raw');
select pg_temp.fm_login('pm');
select public.complete_file_upload(pg_temp.fm('raw'));
select is((select visibility::text from public.files where id = pg_temp.fm('raw')), 'internal', 'RAW uploads are internal');
select throws_ok($$update public.files set folder_id = pg_temp.fm('foreign_folder') where id = pg_temp.fm('raw')$$,
  '22023', null, 'a file cannot move to another client''s folder');
select lives_ok($$update public.files set folder_id = (select id from public.folders where client_id = pg_temp.fm('client') and kind = 'photos') where id = pg_temp.fm('raw')$$,
  'manager moves the file to PHOTOS');
reset role;
select is((select visibility::text from public.files where id = pg_temp.fm('raw')), 'client', 'the file adopts the shared folder''s visibility');

select pg_temp.fm_login('client_user');
select is((select file_count::int from public.get_client_folders(pg_temp.fm('client')) where kind = 'photos'), 1, 'client folder grid counts the shared file');
select is((select count(*)::int from public.get_client_folders(pg_temp.fm('client')) where kind in ('raw', 'edited')), 0, 'internal folders are hidden from the client');
select is((select file_count::int from public.get_files_overview() where client_id = pg_temp.fm('client')), 1, 'overview counts the client''s visible files');
select is((select count(*)::int from public.get_files_overview() where client_id = pg_temp.fm('other_client')), 0, 'other clients are not listed');
select throws_ok($$select public.remove_file(pg_temp.fm('raw'))$$, '42501', null, 'clients cannot remove staff files');
reset role;

-- Removal
select pg_temp.fm_login('other_editor');
select throws_ok($$select public.remove_file(pg_temp.fm('att'))$$, '42501', null, 'an editor outside the task cannot remove its attachment');
reset role;
select pg_temp.fm_login('editor');
select lives_ok($$select public.remove_file(pg_temp.fm('att'))$$, 'the uploader removes the attachment');
reset role;
select ok((select deleted_at is not null from public.files where id = pg_temp.fm('att')), 'removal is a soft delete');
select ok(exists (select 1 from public.audit_logs where action = 'file.removed' and entity_id = pg_temp.fm('att')::text), 'removal is audited');

-- A file used as a content version stays
select pg_temp.fm_login('pm');
insert into fm_ids (key, id) select 'content', public.save_content(null, jsonb_build_object('client_id', pg_temp.fm('client'), 'title', 'Versiya', 'content_type', 'reel'));
reset role;
update public.content_items set status = 'editing' where id = pg_temp.fm('content');
select pg_temp.fm_login('pm');
insert into fm_ids (key, id)
select 'cut', id from public.create_file_upload('cut.mp4', 'video/mp4', 4096, pg_temp.fm('client'),
  (select id from public.folders where client_id = pg_temp.fm('client') and kind = 'edited'), pg_temp.fm('content'));
reset role;
select pg_temp.fm_store('cut');
select pg_temp.fm_login('pm');
select public.complete_file_upload(pg_temp.fm('cut'));
select public.submit_content_version(pg_temp.fm('content'), pg_temp.fm('cut'));
select throws_ok($$select public.remove_file(pg_temp.fm('cut'))$$, '22023', null, 'a content version file cannot be removed');
reset role;

select * from finish();
rollback;
