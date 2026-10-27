-- Sunny's daily AI budget (20261028100000): counted per person per day, within the owner's limit, server only.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

update public.app_settings set value = '3' where key = 'assistant.daily_limit_public';
update public.app_settings set value = '5' where key = 'assistant.daily_limit_member';

set local role service_role;
select is(public.assistant_spend('v:visitor-key-1234', false), true, 'a visitor’s 1st question');
select is(public.assistant_spend('v:visitor-key-1234', false), true, '2nd');
select is(public.assistant_spend('v:visitor-key-1234', false), true, '3rd: the limit');
select is(public.assistant_spend('v:visitor-key-1234', false), false, '4th: over the day’s limit');
select is(public.assistant_spend('v:another-visitor-99', false), true, 'another visitor has their own count');
select is(public.assistant_spend('u:00000000-0000-0000-0000-000000000001', true), true, 'a signed-in person has the member limit');
reset role;
select is((select requests from private.assistant_usage where who = 'v:visitor-key-1234'), 4, 'every question counted once');

set local role service_role;
select throws_ok($$select public.assistant_spend('v:x', false)$$, '23514', null, 'only a well-formed key is counted');
reset role;

-- Old days are pruned when a new day starts for someone.
insert into private.assistant_usage (day, who, requests) values (current_date - 30, 'v:old-visitor-key', 9);
delete from private.assistant_usage where who = 'v:fresh-visitor-key';
set local role service_role;
select public.assistant_spend('v:fresh-visitor-key', false);
reset role;
select is((select count(*)::int from private.assistant_usage where who = 'v:old-visitor-key'), 0, 'older than a week: gone');

-- Nobody but the server counts or reads.
set local role authenticated;
select throws_ok($$select public.assistant_spend('u:00000000-0000-0000-0000-000000000001', true)$$, '42501', null, 'signed-in people cannot spend or reset the budget');
reset role;
set local role anon;
select throws_ok($$select public.assistant_spend('v:visitor-key-1234', false)$$, '42501', null, 'nor can visitors');
reset role;

select * from finish();
rollback;
