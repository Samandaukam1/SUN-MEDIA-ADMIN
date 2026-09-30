-- Meta CRM and access requests: leads are idempotent, routed to one client, reach the client only after an
-- admin delivers them, and never leak across clients. Seed-safe, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated, anon;
select * from no_plan();

create temp table crm_ids (key text primary key, id uuid not null default gen_random_uuid());
grant select on crm_ids to authenticated, anon, service_role;
insert into crm_ids (key) values
  ('admin'), ('rahbar'), ('editor'), ('client_a_user'), ('client_b_user'), ('google'),
  ('client_a'), ('client_b'), ('connection');
create function pg_temp.c(p_key text) returns uuid language sql stable as $$ select id from crm_ids where key = p_key $$;
grant execute on function pg_temp.c(text) to authenticated, anon, service_role;
create function pg_temp.c_login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.c(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.c_login(text) to authenticated, anon, service_role;
create function pg_temp.c_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function pg_temp.c_service() to authenticated, anon, service_role;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       key || '.' || left(id::text, 8) || '@crm-tests.local', jsonb_build_object('full_name', key), '{}', now() - interval '1 day'
from crm_ids where key in ('admin', 'rahbar', 'editor', 'client_a_user', 'client_b_user', 'google');
-- The Google login was created long ago (not a fresh admin-made login).
update auth.users set created_at = now() - interval '3 days' where id = pg_temp.c('google');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), pg_temp.c('google'), 'google-' || pg_temp.c('google'), 'google', jsonb_build_object('sub', 'x'), now(), now(), now());

insert into public.user_roles (user_id, role_id)
select i.id, r.id from crm_ids i join public.roles r on r.key = case i.key when 'admin' then 'admin' when 'rahbar' then 'owner' else 'editor' end
where i.key in ('admin', 'rahbar', 'editor');
insert into public.employees (user_id) select id from crm_ids where key in ('admin', 'rahbar', 'editor');

insert into public.clients (id, name, code) values
  (pg_temp.c('client_a'), 'CRM Test A', 'CRMTA'), (pg_temp.c('client_b'), 'CRM Test B', 'CRMTB');
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.c('client_a'), pg_temp.c('client_a_user'), id from public.roles where key = 'client_owner';
insert into public.client_members (client_id, user_id, role_id)
select pg_temp.c('client_b'), pg_temp.c('client_b_user'), id from public.roles where key = 'client_owner';

-- ---------------------------------------------------------------------------
-- Connection and assets
-- ---------------------------------------------------------------------------
select pg_temp.c_login('client_a_user');
select throws_ok($$select public.meta_save_connection('111', 'x', 'tok', null, '{}', null)$$, '42501', null, 'app users cannot store Meta tokens');
select throws_ok($$select public.meta_read_token('connection', gen_random_uuid())$$, '42501', null, 'app users cannot read Meta tokens');
select throws_ok($$select public.ingest_meta_lead('1', '2')$$, '42501', null, 'app users cannot inject leads');
reset role;

select pg_temp.c_service();
select ok(public.meta_save_connection('9001', 'SUN MEDIA Ads', 'user-token-1', now() + interval '60 days', '{leads_retrieval}', null) is not null,
  'the service role stores a Meta connection');
select is(public.meta_read_token('connection', (select id from public.meta_connections where meta_user_id = '9001')), 'user-token-1',
  'the connection token is kept in Vault');
select lives_ok($$select public.meta_save_connection('9001', 'SUN MEDIA Ads', 'user-token-2', null, '{leads_retrieval}', null)$$, 'reconnecting updates the same row');
select is(public.meta_read_token('connection', (select id from public.meta_connections where meta_user_id = '9001')), 'user-token-2',
  'the token is replaced, not duplicated');
reset role;
update crm_ids set id = (select id from public.meta_connections where meta_user_id = '9001') where key = 'connection';

select pg_temp.c_login('editor');
select throws_ok($$select * from public.save_meta_assets(pg_temp.c('client_a'), pg_temp.c('connection'), '[]')$$, '42501', null,
  'an editor cannot connect Meta assets');
reset role;

select pg_temp.c_login('admin');
select is((select count(*)::int from public.save_meta_assets(pg_temp.c('client_a'), pg_temp.c('connection'), $$[
  {"type": "page", "external_id": "501", "name": "Page A"},
  {"type": "lead_form", "external_id": "701", "name": "Form A", "parent_external_id": "501"},
  {"type": "instagram", "external_id": "801", "name": "client_a_ig", "parent_external_id": "501", "details": {"username": "client_a_ig"}}
]$$)), 3, 'the admin connects a page, a lead form and Instagram to client A');
select is((select connection::text from public.social_accounts where client_id = pg_temp.c('client_a') and external_id = '801'), 'connected',
  'the Instagram account becomes a connected social account of the client');
select throws_ok($$select * from public.save_meta_assets(pg_temp.c('client_b'), pg_temp.c('connection'), '[{"type": "page", "external_id": "501", "name": "Page A"}]')$$,
  '23505', null, 'one page cannot route leads to two clients');
select is((select count(*)::int from public.save_meta_assets(pg_temp.c('client_b'), pg_temp.c('connection'), '[{"type": "page", "external_id": "502", "name": "Page B"}]')),
  1, 'client B gets its own page');
reset role;

-- ---------------------------------------------------------------------------
-- Ingestion: idempotent, routed, complete
-- ---------------------------------------------------------------------------
select pg_temp.c_service();
select is(public.ingest_meta_lead('3001', '501', '701', '9', '8', now()) ->> 'status', 'created', 'a new lead is created');
select is(public.ingest_meta_lead('3001', '501', '701', '9', '8', now()) ->> 'status', 'duplicate', 'a retried webhook creates nothing');
select is(public.ingest_meta_lead('3002', '999', null) ->> 'status', 'unrouted', 'leads of unknown pages are ignored');
select is(public.ingest_meta_lead('3003', '501', '555') ->> 'status', 'created', 'an unlisted form of a connected page routes by the page');
select is(public.ingest_meta_lead('4001', '502') ->> 'status', 'created', 'client B receives its own lead');
select is((select count(*)::int from public.leads where meta_lead_id = '3001'), 1, 'exactly one row per Meta lead');
select is((select client_id from public.leads where meta_lead_id = '3001'), pg_temp.c('client_a'), 'the lead belongs to client A');

-- Meta's own time format, one hour ago: the lead stays "new" (last 24 hours) whenever the suite runs.
select lives_ok($$select public.complete_meta_lead((select id from public.leads where meta_lead_id = '3001'), jsonb_build_object('created_time',
  to_char((now() - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+0000"')) || '{
  "campaign_name": "Kuzgi aksiya", "ad_name": "Reel 1", "adset_name": "Toshkent", "platform": "ig",
  "field_data": [
    {"name": "full_name", "values": ["Ali Valiyev"]},
    {"name": "phone_number", "values": ["+998901234567"]},
    {"name": "qaysi_filial", "values": ["Chilonzor"]}
  ]}'::jsonb)$$, 'Graph details complete the lead');
select is((select full_name || '|' || phone || '|' || campaign_name from public.leads where meta_lead_id = '3001'),
  'Ali Valiyev|+998901234567|Kuzgi aksiya', 'name, phone and campaign are taken from the answers');
select is((select fields ->> 'qaysi_filial' from public.leads where meta_lead_id = '3001'), 'Chilonzor', 'custom answers are kept');
select is((select meta_created_at from public.leads where meta_lead_id = '3001'), date_trunc('second', now() - interval '1 hour'), 'Meta time format is parsed');
select lives_ok($$select public.complete_meta_lead((select id from public.leads where meta_lead_id = '4001'),
  '{"field_data": [{"name": "first_name", "values": ["Olim"]}, {"name": "last_name", "values": ["Karimov"]}, {"name": "phone", "values": ["+998911112233"]}]}')$$,
  'client B lead completes');
select is((select full_name from public.leads where meta_lead_id = '4001'), 'Olim Karimov', 'first and last name are joined');
select lives_ok($$select public.fail_meta_lead((select id from public.leads where meta_lead_id = '3003'), 'token expired')$$, 'a failed fetch is recorded');
select is((select fetch_status::text || fetch_attempts from public.leads where meta_lead_id = '3003'), 'pending1', 'and retried later');
select is((select count(*)::int from public.meta_leads_to_fetch()), 1, 'the retry queue holds the unfinished lead');
reset role;

-- Nothing reaches the client before delivery.
select pg_temp.c_login('client_a_user');
select is(jsonb_array_length(public.get_client_leads(pg_temp.c('client_a'), 'all') -> 'leads'), 0, 'the client sees no undelivered lead');
select is((select count(*)::int from public.leads), 0, 'clients cannot read the leads table directly');
select throws_ok($$select public.deliver_leads(pg_temp.c('client_a'))$$, '42501', null, 'a client cannot deliver leads');
select throws_ok($$select public.get_leads('pending')$$, '42501', null, 'a client cannot open the admin CRM');
reset role;

-- Rahbar: oversight only.
select pg_temp.c_login('rahbar');
select is((public.get_crm_summary() ->> 'pending')::int, 3, 'the Rahbar sees pending leads');
select throws_ok($$select public.deliver_leads(pg_temp.c('client_a'))$$, '42501', null, 'the Rahbar cannot deliver');
reset role;

select pg_temp.c_login('editor');
select throws_ok($$select public.get_crm_summary()$$, '42501', null, 'an editor has no CRM access');
reset role;

-- ---------------------------------------------------------------------------
-- Delivery and isolation
-- ---------------------------------------------------------------------------
select pg_temp.c_login('admin');
select is((select count(*)::int from public.get_leads('new', pg_temp.c('client_a'))), 2, 'the admin sees client A''s new leads');
select is((public.deliver_leads(pg_temp.c('client_a')) ->> 'delivered')::int, 1, 'bulk delivery sends only complete leads');
select is((public.deliver_leads(pg_temp.c('client_a')) ->> 'delivered')::int, 0, 'delivering again sends nothing twice');
select is(public.discard_leads(array[(select id from public.leads where meta_lead_id = '4001')], 'test'), 1, 'a spam lead can be discarded');
reset role;

select pg_temp.c_login('client_a_user');
select is(jsonb_array_length(public.get_client_leads(pg_temp.c('client_a'), 'all') -> 'leads'), 1, 'the client sees the delivered lead');
select is(public.get_client_leads(pg_temp.c('client_a'), 'all') -> 'leads' -> 0 ->> 'phone', '+998901234567', 'with the phone number');
select is(public.get_client_leads(pg_temp.c('client_a'), 'all') -> 'leads' -> 0 -> 'fields', '{}'::jsonb, 'the standard template hides custom answers');
select throws_ok($$select public.get_client_leads(pg_temp.c('client_b'), 'all')$$, '42501', null, 'client A cannot open client B''s leads');
select is((select count(*)::int from public.notifications where user_id = pg_temp.c('client_a_user') and type = 'crm.leads_delivered'), 1,
  'the client is notified once per delivery');
reset role;

select pg_temp.c_login('client_b_user');
select is(jsonb_array_length(public.get_client_leads(pg_temp.c('client_b'), 'all') -> 'leads'), 0, 'a discarded lead never reaches the client');
reset role;

-- ---------------------------------------------------------------------------
-- CRM report and admin alerts
-- ---------------------------------------------------------------------------
select pg_temp.c_login('admin');
select is((public.preview_crm_report(pg_temp.c('client_a'), private.agency_today() - 30, private.agency_today()) ->> 'total')::int, 2, 'the report counts the period''s leads');
select ok(public.send_crm_report(pg_temp.c('client_a'), 'monthly', private.agency_today() - 29, private.agency_today()) is not null, 'the admin sends a CRM report');
select throws_ok($$select public.send_crm_report(pg_temp.c('client_a'), 'custom', private.agency_today(), private.agency_today() + 3)$$, '22023', null, 'future periods are refused');
reset role;

select pg_temp.c_login('client_a_user');
select is((select count(*)::int from public.crm_reports), 1, 'the client reads its own CRM report');
reset role;
select pg_temp.c_login('client_b_user');
select is((select count(*)::int from public.crm_reports), 0, 'and no other client does');
reset role;

select ok(private.notify_new_leads() >= 1, 'admins get one alert per client with new leads');
select is(private.notify_new_leads(), 0, 'and no repeat for the same leads');

-- ---------------------------------------------------------------------------
-- Access requests (first Google sign-in)
-- ---------------------------------------------------------------------------
select pg_temp.c_login('google');
select is(public.get_my_context() ->> 'status', 'pending', 'an unknown Google account gets no role');
select is(public.request_access() ->> 'status', 'pending', 'it asks for access');
select is((select count(*)::int from public.leads), 0, 'and sees nothing meanwhile');
reset role;

select pg_temp.c_login('admin');
select ok((select count(*) from public.get_access_requests() where user_id = pg_temp.c('google')) = 1, 'the admin sees the request');
select lives_ok($$select public.provision_staff_member(pg_temp.c('google'), 'Gugl', 'Xodim', 'editor')$$, 'the admin grants a staff role');
select ok((select count(*) from public.get_access_requests() where user_id = pg_temp.c('google')) = 0, 'the request is gone');
select throws_ok($$select public.provision_staff_member(pg_temp.c('editor'), 'X', 'Y', 'admin')$$, '22023', null,
  'an existing employee can never be re-provisioned');
reset role;

select pg_temp.c_login('google');
select is(public.get_my_context() ->> 'interface', 'employee', 'the Google account now opens the employee app');
select is((public.get_my_context() ->> 'temporary_password')::boolean, false, 'a Google-only account is never asked to change a password');
reset role;

select * from finish();
rollback;
