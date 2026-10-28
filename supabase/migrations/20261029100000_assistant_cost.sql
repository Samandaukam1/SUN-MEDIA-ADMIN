-- SUN MEDIA — Sunny's AI cost accounting (docs/SUNNY_ROADMAP.md, completion phase F).
--
-- The daily request budget (20261028100000) counts questions; this adds what each AI call really used, so the owner
-- sees tokens and — when prices are set — money, and may cap the month.
--   * private.assistant_calls: one row per AI reply — when, whose (the same one-way key as the budget), which provider
--     and model, input / output / cached / thinking tokens as the provider reported them, and the estimated cost (null
--     when the model has no configured price: never a guessed number). Kept 120 days. Not exposed through the API.
--   * public.assistant_record(...): the server writes one row (server key only).
--   * public.assistant_money_ok(): false once this month's estimated cost reached the owner's budget (server key only).
--   * public.assistant_usage_report(days): per day and model, for the system owner only.
--   * app_settings (the owner edits them in Sozlamalar → Sunny AI):
--       assistant.pricing            {"<model>": {"input": USD per 1M, "output": USD per 1M, "cached": USD per 1M}}
--       assistant.monthly_budget_usd  0 = no cap

create table private.assistant_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text not null check (who ~ '^(u|v):[A-Za-z0-9_-]{8,128}$'),
  audience text not null check (audience in ('public', 'staff', 'client')),
  provider text not null check (char_length(provider) between 2 and 40),
  model text not null check (char_length(model) between 2 and 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  thought_tokens integer not null default 0 check (thought_tokens >= 0),
  cost_usd numeric(12, 6) check (cost_usd is null or cost_usd >= 0)
);
create index assistant_calls_at_idx on private.assistant_calls (at);
alter table private.assistant_calls enable row level security;
revoke all on private.assistant_calls from public, anon, authenticated;

insert into public.app_settings (key, value, description) values
  ('assistant.pricing', '{}', 'Sunny: AI modellari narxi, 1 mln token uchun USD ({"model": {"input": 0.1, "output": 0.4, "cached": 0.025}}). Bo‘sh — narx noma’lum'),
  ('assistant.monthly_budget_usd', '0', 'Sunny: oylik AI xarajati chegarasi, USD (0 — chegara yo‘q)')
on conflict (key) do nothing;

create or replace function public.assistant_record(
  p_who text,
  p_audience text,
  p_provider text,
  p_model text,
  p_input integer,
  p_output integer,
  p_cached integer default 0,
  p_thoughts integer default 0
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price jsonb;
  v_cost numeric;
  v_cached integer := least(greatest(coalesce(p_cached, 0), 0), greatest(coalesce(p_input, 0), 0));
begin
  select s.value -> p_model into v_price from public.app_settings s where s.key = 'assistant.pricing' and jsonb_typeof(s.value) = 'object';
  -- Priced only when the owner set this model's input and output prices; cached input falls back to the input price.
  if jsonb_typeof(v_price -> 'input') = 'number' and jsonb_typeof(v_price -> 'output') = 'number' then
    v_cost := (
      (greatest(coalesce(p_input, 0), 0) - v_cached) * (v_price ->> 'input')::numeric
      + v_cached * coalesce(case when jsonb_typeof(v_price -> 'cached') = 'number' then (v_price ->> 'cached')::numeric end, (v_price ->> 'input')::numeric)
      + (greatest(coalesce(p_output, 0), 0) + greatest(coalesce(p_thoughts, 0), 0)) * (v_price ->> 'output')::numeric
    ) / 1000000;
  end if;

  insert into private.assistant_calls (who, audience, provider, model, input_tokens, output_tokens, cached_tokens, thought_tokens, cost_usd)
  values (p_who, p_audience, p_provider, p_model, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0), v_cached, greatest(coalesce(p_thoughts, 0), 0), v_cost)
  returning cost_usd into v_cost;

  delete from private.assistant_calls where at < now() - interval '120 days';
  return v_cost;
end;
$$;

create or replace function public.assistant_money_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_budget numeric;
  v_month timestamptz := date_trunc('month', now() at time zone private.agency_timezone()) at time zone private.agency_timezone();
begin
  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end into v_budget
  from public.app_settings s where s.key = 'assistant.monthly_budget_usd';
  if coalesce(v_budget, 0) <= 0 then
    return true;
  end if;
  return coalesce((select sum(c.cost_usd) from private.assistant_calls c where c.at >= v_month), 0) < v_budget;
end;
$$;

create or replace function public.assistant_usage_report(p_days integer default 30)
returns table (
  day date,
  model text,
  requests bigint,
  input_tokens bigint,
  output_tokens bigint,
  cached_tokens bigint,
  thought_tokens bigint,
  cost_usd numeric,
  unpriced bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_role('system_owner') then
    raise exception 'Only the system owner sees AI usage' using errcode = '42501';
  end if;
  return query
    select (c.at at time zone private.agency_timezone())::date, c.model, count(*), sum(c.input_tokens)::bigint, sum(c.output_tokens)::bigint,
           sum(c.cached_tokens)::bigint, sum(c.thought_tokens)::bigint, sum(c.cost_usd), count(*) filter (where c.cost_usd is null)
    from private.assistant_calls c
    where c.at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 120))
    group by 1, 2
    order by 1 desc, 2;
end;
$$;

revoke all on function public.assistant_record(text, text, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.assistant_record(text, text, text, text, integer, integer, integer, integer) to service_role;
revoke all on function public.assistant_money_ok() from public, anon, authenticated;
grant execute on function public.assistant_money_ok() to service_role;
revoke all on function public.assistant_usage_report(integer) from public, anon;
grant execute on function public.assistant_usage_report(integer) to authenticated;
