-- SUN MEDIA — voice and round video messages ride the existing chat: members only, one message per file, no edits.
begin;

create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table cv_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select, insert on cv_ids to authenticated, anon;
insert into cv_ids (key) values ('ali'), ('vali'), ('guli');

create function pg_temp.cv(p_key text) returns uuid language sql stable as $$ select id from cv_ids where key = p_key $$;
grant execute on function pg_temp.cv(text) to authenticated, anon;
create function pg_temp.cv_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.cv(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.cv_login(text) to authenticated, anon;
-- The bytes "landed" in storage (what the browser upload does), as the storage service would record them.
create function pg_temp.landed(p_file text, p_mime text) returns void language sql security definer as $$
  insert into storage.objects (bucket_id, name, owner, metadata)
  select f.bucket, f.storage_path, f.uploaded_by, jsonb_build_object('size', f.size_bytes, 'mimetype', p_mime) from public.files f where f.id = pg_temp.cv(p_file)
$$;
grant execute on function pg_temp.landed(text, text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@voice-tests.local',
       jsonb_build_object('full_name', initcap(key)), '{}'
from cv_ids;
insert into public.user_roles (user_id, role_id) select i.id, r.id from cv_ids i join public.roles r on r.key = 'editor';
insert into public.employees (user_id) select id from cv_ids;

select pg_temp.cv_login('ali');
insert into cv_ids (key, id) select 'room', public.create_group_chat('Ovoz test', array[pg_temp.cv('vali')]);
insert into cv_ids (key, id) select 'voice', (public.create_file_upload('ovozli-xabar.m4a', 'audio/mp4', 4096, p_chat_room_id => pg_temp.cv('room'))).id;
select pg_temp.landed('voice', 'audio/mp4');
select lives_ok($$select public.complete_file_upload(pg_temp.cv('voice'), 4200)$$, 'the upload is confirmed with its duration');

insert into cv_ids (key, id) select 'msg', (public.send_media_message(pg_temp.cv('room'), pg_temp.cv('voice'), 'voice', array[10, 60, 100]::smallint[])).id;
select is((select kind from public.messages where id = pg_temp.cv('msg')), 'voice', 'a voice message');
select is((select body from public.messages where id = pg_temp.cv('msg')), '', 'with no text');
select is((public.send_media_message(pg_temp.cv('room'), pg_temp.cv('voice'), 'voice')).id, pg_temp.cv('msg'), 'a retry returns the same message (no duplicate)');
select is((select count(*) from public.message_attachments where file_id = pg_temp.cv('voice')), 1::bigint, 'the file is attached once');
select is((select waveform from public.files where id = pg_temp.cv('voice')), array[10, 60, 100]::smallint[], 'the waveform is stored with the file');
insert into cv_ids (key, id) select 'voice2', (public.create_file_upload('ikkinchi.m4a', 'audio/mp4', 2048, p_chat_room_id => pg_temp.cv('room'))).id;
select pg_temp.landed('voice2', 'audio/mp4');
select lives_ok($$select public.complete_file_upload(pg_temp.cv('voice2'), 3000)$$, 'a second recording is uploaded');
select throws_ok($$select public.send_media_message(pg_temp.cv('room'), pg_temp.cv('voice2'), 'round_video')$$, '22023', null, 'an audio file is not a round video');
select throws_ok($$select public.send_media_message(pg_temp.cv('room'), pg_temp.cv('voice2'), 'voice', array[101]::smallint[])$$, '22023', null, 'a waveform outside 0–100 is refused');
select throws_ok($$update public.messages set body = 'matn' where id = pg_temp.cv('msg')$$, '22023', null, 'a voice message cannot be edited into text');

select pg_temp.cv_login('vali');
select is((select count(*) from public.files where id = pg_temp.cv('voice')), 1::bigint, 'a member can open the recording');
select is((select body from public.notifications where user_id = pg_temp.cv('vali') and entity_id = pg_temp.cv('room') and type = 'chat.message'),
          'Ali: 🎤 Ovozli xabar', 'the push text names the kind, no link');

select pg_temp.cv_login('guli');
select is((select count(*) from public.files where id = pg_temp.cv('voice')), 0::bigint, 'a non-member cannot see the recording');
select throws_ok($$select public.send_media_message(pg_temp.cv('room'), pg_temp.cv('voice'), 'voice')$$, null, null, 'nor send into the chat');

-- A deleted media message takes its recording with it.
select pg_temp.cv_login('ali');
update public.messages set deleted_at = now() where id = pg_temp.cv('msg');
select pg_temp.cv_login('vali');
select is((select count(*) from public.files where id = pg_temp.cv('voice')), 0::bigint, 'after deletion other members cannot open it');

-- An upload that never became a message is discarded by its owner.
select pg_temp.cv_login('ali');
insert into cv_ids (key, id) select 'unsent', (public.create_file_upload('video-xabar.mp4', 'video/mp4', 8192, p_chat_room_id => pg_temp.cv('room'))).id;
select lives_ok($$select public.discard_chat_upload(pg_temp.cv('unsent'))$$, 'the owner discards an unsent upload');
reset role;
select ok((select deleted_at is not null from public.files where id = pg_temp.cv('unsent')), 'it is gone');

select * from finish();
rollback;
