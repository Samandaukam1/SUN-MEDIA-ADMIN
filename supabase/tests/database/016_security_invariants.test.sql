-- Security invariants for the whole schema. Any new table, function, view or bucket that breaks
-- one of these rules fails the suite before it can reach production.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname = 'public' and not c.relrowsecurity),
  '{}'::text[], 'every public table has row level security');

select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname in ('public', 'private')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  '{}'::text[], 'every SECURITY DEFINER function pins its search_path');

select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '{}'::text[], 'anonymous visitors cannot call any public function');

select is(
  (select coalesce(array_agg(distinct table_name::text), '{}') from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  '{}'::text[], 'anonymous visitors have no table privileges');

select is(
  (select coalesce(array_agg(c.relname::text), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'v' and n.nspname = 'public'
     and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)),
  '{}'::text[], 'views run with the caller''s rights (security_invoker)');

select is(
  (select coalesce(array_agg(distinct table_name::text), '{}') from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon', 'authenticated')),
  '{}'::text[], 'private tables are not reachable by app users');

select is(
  (select coalesce(array_agg(id order by id), '{}') from storage.buckets where public),
  array['avatars'], 'only the avatar bucket is public');

-- Definer functions reachable by app users must check who is calling.
select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prosrc !~* '(auth\.uid\(\)|has_permission|can_manage|is_staff|is_active_user|has_client_permission|my_chat_room_ids|can_manage_task|can_view_subscription_of|accessible_client_ids)'),
  '{}'::text[], 'every SECURITY DEFINER function available to users checks the caller');

select ok(not has_function_privilege('authenticated', 'public.claim_push_deliveries(integer)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.complete_push_deliveries(jsonb)', 'EXECUTE'),
  'the push queue belongs to the dispatcher only');

select is(
  (select coalesce(array_agg(c.relname::text order by 1), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = 'public' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
     and exists (select 1 from information_schema.role_table_grants g
                 where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'authenticated')),
  '{}'::text[], 'no table is granted to users while having no policy');

select * from finish();
rollback;
