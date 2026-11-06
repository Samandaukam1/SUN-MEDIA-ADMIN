-- SUN MEDIA — Smm Api tables: nobody reaches them through the API; provider numbers are unique per kind only.
begin;

create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table sm_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on sm_ids to authenticated, anon;
insert into sm_ids (key) values ('owner'), ('admin');
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', key || '.' || left(id::text, 8) || '@smm-tests.local', jsonb_build_object('full_name', key), '{}'
from sm_ids;
insert into public.user_roles (user_id, role_id) select i.id, r.id from sm_ids i join public.roles r on r.key = case i.key when 'owner' then 'system_owner' else 'admin' end;

-- As the server (service role): one SMM, one gift and one donat order with the same provider number.
set local role service_role;
insert into public.neosmm_orders (id, owner_id, kind, state, provider_order_id, item_id, item_name, price, target)
select gen_random_uuid(), (select id from sm_ids where key = 'owner'), k, 'accepted', 12345, 1, 'x', '1500.00', 'https://instagram.com/x'
from unnest(array['smm', 'gift', 'donat']) k;
select is((select count(*) from public.neosmm_orders where provider_order_id = 12345), 3::bigint, 'the same number in three kinds is three different orders');
select throws_ok($$insert into public.neosmm_orders (id, owner_id, kind, state, provider_order_id, item_id, item_name, price, target)
  select gen_random_uuid(), (select id from sm_ids where key = 'owner'), 'smm', 'accepted', 12345, 2, 'y', '1.00', 'z'$$, '23505', null, 'but twice in one kind is refused');
create temp table tok as select gen_random_uuid() as id;
grant select on tok to service_role;
insert into public.neosmm_orders (id, owner_id, kind, item_id, item_name, price, target) select id, (select id from sm_ids where key = 'owner'), 'smm', 1, 'x', '1.00', 'z' from tok;
select throws_ok($$insert into public.neosmm_orders (id, owner_id, kind, item_id, item_name, price, target) select id, (select id from sm_ids where key = 'owner'), 'smm', 1, 'x', '1.00', 'z' from tok$$,
  '23505', null, 'one submission token, one row (the lock before the provider call)');
select throws_ok($$insert into public.neosmm_orders (id, owner_id, kind, item_id, item_name, price, target) values (gen_random_uuid(), (select id from sm_ids where key = 'owner'), 'smm', 1, 'x', '1,5', 'z')$$,
  '23514', null, 'the tariff is stored as an exact decimal string');
reset role;

-- Through the API as any signed-in person (the system owner included) or a visitor: nothing.
create function pg_temp.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select id from sm_ids where key = p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
select pg_temp.as_user('admin');
select throws_ok($$select count(*) from public.neosmm_orders$$, '42501', null, 'an admin cannot read Smm Api orders');
select throws_ok($$select count(*) from public.neosmm_catalog_cache$$, '42501', null, 'nor the catalogue copy');
select pg_temp.as_user('owner');
select throws_ok($$select count(*) from public.neosmm_orders$$, '42501', null, 'not even the owner through the API: only the server, after its own check');
select throws_ok($$insert into public.neosmm_orders (id, owner_id, kind, item_id, item_name, price, target) values (gen_random_uuid(), auth.uid(), 'smm', 1, 'x', '1', 'z')$$, '42501', null, 'and nobody writes them through the API');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.neosmm_orders$$, '42501', null, 'a visitor cannot read them');
reset role;

select * from finish();
rollback;
