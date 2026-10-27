begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Sunny's memory: who reads and writes which notes (docs/SUNNY_ROADMAP.md, phase 5).
create temp table mem_ids(key text primary key, id uuid not null default gen_random_uuid());
insert into mem_ids(key) values ('sysowner'), ('editor'), ('editor2'), ('safi_user'), ('other_user'), ('safi'), ('other');
grant select on mem_ids to anon, authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql stable as $$select id from mem_ids where key = k$$;
create function pg_temp.login(k text) returns void language sql as
  $$select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(k), 'role', 'authenticated')::text, true)::text$$;
grant execute on function pg_temp.id(text), pg_temp.login(text) to anon, authenticated, service_role;
-- Rows a statement changed, run as the current (logged-in) user: RLS applies.
create function pg_temp.affected(q text) returns int language plpgsql as $$declare n int; begin execute q; get diagnostics n = row_count; return n; end$$;
grant execute on function pg_temp.affected(text) to authenticated;

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@memory-tests.local',
       jsonb_build_object('full_name', key), '{}'
from mem_ids where key not in ('safi', 'other');
insert into public.user_roles(user_id, role_id) select pg_temp.id('sysowner'), id from public.roles where key = 'system_owner';
insert into public.user_roles(user_id, role_id) select pg_temp.id('editor'), id from public.roles where key = 'editor';
insert into public.user_roles(user_id, role_id) select pg_temp.id('editor2'), id from public.roles where key = 'editor';
insert into public.employees(user_id) select id from mem_ids where key in ('sysowner', 'editor', 'editor2');
insert into public.clients (id, name, code)
select id, 'Memory ' || key, 'MM' || upper(left(replace(id::text, '-', ''), 10)) from mem_ids where key in ('safi', 'other');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.id('safi'), pg_temp.id('safi_user'), id from public.roles where key = 'client_owner'
union all
select pg_temp.id('other'), pg_temp.id('other_user'), id from public.roles where key = 'client_owner';

-- ---------------------------------------------------------------------------
-- Personal: only the person
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('editor');
select lives_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', pg_temp.id('editor'), 'Ertalab qisqa xulosa yoqadi')$$, 'a staff member saves a personal note');
select throws_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', pg_temp.id('editor'), '  ertalab   QISQA xulosa yoqadi ')$$, '23505', null, 'the same note again (case, spaces) is one note');
select throws_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', pg_temp.id('editor2'), 'birovning nomidan')$$, '42501', null, 'nobody writes a note in someone else''s name');
select throws_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', pg_temp.id('editor'), 'Instagram parol: secret123')$$, '23514', null, 'no passwords in memory');
select throws_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', pg_temp.id('editor'), 'karta 8600 1234 5678 9012')$$, '23514', null, 'no card numbers in memory');
select is((select count(*)::int from public.assistant_memories), 1, 'the person sees their own note');

select pg_temp.login('editor2');
select is((select count(*)::int from public.assistant_memories where scope = 'personal'), 0, 'a colleague does not see it');
select pg_temp.login('sysowner');
select is((select count(*)::int from public.assistant_memories where scope = 'personal'), 0, 'not even the system owner reads someone''s personal notes');
select pg_temp.login('safi_user');
select is((select count(*)::int from public.assistant_memories), 0, 'a partner does not see staff notes');

-- ---------------------------------------------------------------------------
-- Company: staff read, only the system owner writes
-- ---------------------------------------------------------------------------
select pg_temp.login('editor');
select throws_ok($$insert into public.assistant_memories (scope, body) values ('company', 'Ishonchsiz qoida')$$, '42501', null, 'staff cannot write company rules');
select pg_temp.login('sysowner');
select lives_ok($$insert into public.assistant_memories (scope, body) values ('company', 'Mijozga javob 2 soat ichida beriladi')$$, 'the system owner writes a company rule');
select pg_temp.login('editor2');
select is((select count(*)::int from public.assistant_memories where scope = 'company'), 1, 'every staff member reads company rules');
select is(pg_temp.affected($$delete from public.assistant_memories where scope = 'company'$$), 0, 'and cannot delete them');
select pg_temp.login('other_user');
select is((select count(*)::int from public.assistant_memories where scope = 'company'), 0, 'partners do not read internal rules');

-- ---------------------------------------------------------------------------
-- Partner: one client company's notes stay with that company
-- ---------------------------------------------------------------------------
select pg_temp.login('sysowner');
select lives_ok($$insert into public.assistant_memories (scope, client_id, body) values ('partner', pg_temp.id('safi'), 'SAFI postlarni kechqurun 19:00 da xohlaydi')$$, 'the owner writes a note about SAFI');
select pg_temp.login('safi_user');
select is((select count(*)::int from public.assistant_memories where scope = 'partner'), 1, 'SAFI''s own people read it');
select pg_temp.login('other_user');
select is((select count(*)::int from public.assistant_memories where scope = 'partner'), 0, 'another partner never does');
select pg_temp.login('safi_user');
select throws_ok($$insert into public.assistant_memories (scope, client_id, body) values ('partner', pg_temp.id('safi'), 'o''zimiz yozamiz')$$, '42501', null, 'partners do not write the agency''s notes about them');

-- ---------------------------------------------------------------------------
-- Forgetting: the person deletes their own notes
-- ---------------------------------------------------------------------------
select pg_temp.login('editor');
select is(pg_temp.affected($$delete from public.assistant_memories where scope = 'personal'$$), 1, 'the person deletes their own note');

-- ---------------------------------------------------------------------------
-- Personality Learning Studio and the dials: the system owner only
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.assistant_style_examples (situation, answer) values ('salom', 'Assalomu alaykum!')$$, '42501', null, 'staff cannot teach Sunny''s style');
select is(pg_temp.affected($$update public.assistant_personality set humor = 1$$), 0, 'staff cannot turn its dials');
select pg_temp.login('sysowner');
select lives_ok($$insert into public.assistant_style_examples (situation, answer) values ('Xodim: hamma ishimni qil', 'E, unda siz nima qilasiz? 😏')$$, 'the owner teaches a style example');
select is(pg_temp.affected($$update public.assistant_personality set humor = 0.8$$), 1, 'the owner turns a dial');
select throws_ok($$update public.assistant_personality set humor = 3$$, '23514', null, 'dials stay between 0 and 1');

reset role;
select * from finish();
rollback;
