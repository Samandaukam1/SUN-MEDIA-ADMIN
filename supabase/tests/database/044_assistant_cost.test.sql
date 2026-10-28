-- Sunny's AI cost accounting (20261029100000) and partners' own notes: recorded by the server only, priced only by the
-- owner's price list, a monthly cap, the report for the system owner only; a partner's personal notes are theirs alone.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

delete from private.assistant_calls;
update public.app_settings set value = '{}' where key = 'assistant.pricing';
update public.app_settings set value = '0' where key = 'assistant.monthly_budget_usd';

set local role service_role;
select is(public.assistant_record('u:00000000-0000-0000-0000-000000000001', 'staff', 'gemini', 'gemini-x', 1000, 100, 200, 20), null, 'no price for the model: recorded without a cost');
reset role;
select is((select input_tokens || '|' || output_tokens || '|' || cached_tokens || '|' || thought_tokens from private.assistant_calls), '1000|100|200|20', 'tokens as the provider reported them');

update public.app_settings set value = '{"gemini-x": {"input": 0.1, "output": 0.4, "cached": 0.025}}' where key = 'assistant.pricing';
set local role service_role;
-- (800 × 0.1 + 200 × 0.025 + 120 × 0.4) / 1e6
select is(public.assistant_record('v:visitor-key-1234', 'public', 'gemini', 'gemini-x', 1000, 100, 200, 20), 0.000133::numeric, 'priced by the owner’s list');
-- (0 × 0.1 + 10 × 0.025 + 10 × 0.4) / 1e6, kept to six decimals
select is(public.assistant_record('v:visitor-key-1234', 'public', 'gemini', 'gemini-x', 10, 10, 50, 0), 0.000004::numeric, 'cached never exceeds the input');
select is(public.assistant_money_ok(), true, 'no monthly cap: always within');
reset role;

update public.app_settings set value = '0.0001' where key = 'assistant.monthly_budget_usd';
set local role service_role;
select is(public.assistant_money_ok(), false, 'over this month’s cap');
select throws_ok($$select public.assistant_record('nobody', 'staff', 'gemini', 'gemini-x', 1, 1)$$, '23514', null, 'only a well-formed key is recorded');
reset role;

-- Nobody but the server records or checks; the report is for the system owner only.
set local role authenticated;
select throws_ok($$select public.assistant_record('u:00000000-0000-0000-0000-000000000001', 'staff', 'gemini', 'm', 1, 1)$$, '42501', null, 'signed-in people cannot record');
select throws_ok($$select public.assistant_money_ok()$$, '42501', null, 'nor read the cap');
select throws_ok($$select * from private.assistant_calls$$, '42501', null, 'nor read the calls');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'system@sunmedia.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq(
  $$select model, requests::int, input_tokens::int from public.assistant_usage_report(30)$$,
  $$values ('gemini-x'::text, 3, 2010)$$,
  'the owner sees use per day and model'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'operator@sunmedia.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select * from public.assistant_usage_report(30)$$, '42501', null, 'another employee does not');
reset role;

-- A partner's personal notes: saved by them, seen and changed only by them.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'safi@client.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$insert into public.assistant_memories (scope, user_id, body) values ('personal', auth.uid(), 'Postlar faqat o‘zbek tilida')$$, 'a partner saves their own note');
select throws_ok($$insert into public.assistant_memories (scope, body) values ('company', 'Hamma dam olsin')$$, '42501', null, 'but never a company rule');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'wedrink@client.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.assistant_memories where body = 'Postlar faqat o‘zbek tilida'), 0, 'another partner does not see it');
delete from public.assistant_memories where body = 'Postlar faqat o‘zbek tilida';
reset role;
select is((select count(*)::int from public.assistant_memories where body = 'Postlar faqat o‘zbek tilida'), 1, 'nor delete it');
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'system@sunmedia.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.assistant_memories where body = 'Postlar faqat o‘zbek tilida'), 0, 'nor does the agency, not even the system owner');
reset role;

select * from finish();
rollback;
