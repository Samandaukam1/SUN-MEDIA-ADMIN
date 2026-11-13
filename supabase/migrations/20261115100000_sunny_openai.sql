-- SUN MEDIA — Sunny 2.0 on OpenAI: speed measured on every reply, model settings the owner can change.
--
--   * private.assistant_replies: one row per Sunny reply (AI or the system's own exact command): which path answered
--     (local = no AI call, primary / complex model), how long until the first streamed word, the whole reply, the
--     preparation (database reads for the prompt), the tools (database reads and changes), and whether it failed or the
--     person stopped it. Real timings only; kept 60 days; not exposed through the API.
--   * public.assistant_reply_record(...): the server writes one row (server key only).
--   * public.assistant_latency_report(days): P50 / P95 per path and model, error and stop rates — system owner only.
--   * app_settings:
--       assistant.config   {"enabled", "primary", "complex", "escalation", "max_output", "max_output_data",
--                           "max_history", "max_input_tokens"} — empty keys fall back to the server's SUNNY_* env.
--       ai.models_status   the server's own check of which OpenAI models the key can use (written by the worker).

create table private.assistant_replies (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  audience text not null check (audience in ('public', 'staff', 'client')),
  path text not null check (path in ('local', 'primary', 'complex')),
  provider text check (provider is null or char_length(provider) between 2 and 40),
  model text check (model is null or char_length(model) between 2 and 120),
  first_ms integer check (first_ms is null or first_ms >= 0),
  total_ms integer not null check (total_ms >= 0),
  prep_ms integer check (prep_ms is null or prep_ms >= 0),
  api_ms integer check (api_ms is null or api_ms >= 0),
  tool_ms integer check (tool_ms is null or tool_ms >= 0),
  tool_calls smallint not null default 0 check (tool_calls >= 0),
  rounds smallint not null default 0 check (rounds >= 0),
  failed boolean not null default false,
  stopped boolean not null default false
);
create index assistant_replies_at_idx on private.assistant_replies (at);
alter table private.assistant_replies enable row level security;
revoke all on private.assistant_replies from public, anon, authenticated;

insert into public.app_settings (key, value, description) values
  ('assistant.config', '{}', 'Sunny: OpenAI modellari va chegaralar (bo‘sh — serverdagi SUNNY_* sozlamalari)'),
  ('ai.models_status', '{}', 'OpenAI modellari mavjudligi (server tekshiruvi)')
on conflict (key) do nothing;

create or replace function public.assistant_reply_record(
  p_audience text,
  p_path text,
  p_provider text,
  p_model text,
  p_first_ms integer,
  p_total_ms integer,
  p_prep_ms integer default null,
  p_api_ms integer default null,
  p_tool_ms integer default null,
  p_tool_calls integer default 0,
  p_rounds integer default 0,
  p_failed boolean default false,
  p_stopped boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.assistant_replies (audience, path, provider, model, first_ms, total_ms, prep_ms, api_ms, tool_ms, tool_calls, rounds, failed, stopped)
  values (
    p_audience, p_path, nullif(p_provider, ''), nullif(p_model, ''),
    case when p_first_ms >= 0 then least(p_first_ms, 600000) end,
    least(greatest(coalesce(p_total_ms, 0), 0), 600000),
    case when p_prep_ms >= 0 then least(p_prep_ms, 600000) end,
    case when p_api_ms >= 0 then least(p_api_ms, 600000) end,
    case when p_tool_ms >= 0 then least(p_tool_ms, 600000) end,
    least(greatest(coalesce(p_tool_calls, 0), 0), 100),
    least(greatest(coalesce(p_rounds, 0), 0), 100),
    coalesce(p_failed, false),
    coalesce(p_stopped, false)
  );
  delete from private.assistant_replies where at < now() - interval '60 days';
end;
$$;

create or replace function public.assistant_latency_report(p_days integer default 7)
returns table (
  path text,
  model text,
  replies bigint,
  failed bigint,
  stopped bigint,
  first_p50 integer,
  first_p95 integer,
  total_p50 integer,
  total_p95 integer,
  prep_p50 integer,
  tool_p50 integer,
  with_tools bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_role('system_owner') then
    raise exception 'Only the system owner sees Sunny speed' using errcode = '42501';
  end if;
  return query
    select r.path, coalesce(r.model, '—'), count(*), count(*) filter (where r.failed), count(*) filter (where r.stopped),
           (percentile_cont(0.5) within group (order by r.first_ms))::integer,
           (percentile_cont(0.95) within group (order by r.first_ms))::integer,
           (percentile_cont(0.5) within group (order by r.total_ms))::integer,
           (percentile_cont(0.95) within group (order by r.total_ms))::integer,
           (percentile_cont(0.5) within group (order by r.prep_ms))::integer,
           (percentile_cont(0.5) within group (order by r.tool_ms) filter (where r.tool_calls > 0))::integer,
           count(*) filter (where r.tool_calls > 0)
    from private.assistant_replies r
    where r.at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 60))
    group by 1, 2
    order by 1, 2;
end;
$$;

revoke all on function public.assistant_reply_record(text, text, text, text, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.assistant_reply_record(text, text, text, text, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) to service_role;
revoke all on function public.assistant_latency_report(integer) from public, anon;
grant execute on function public.assistant_latency_report(integer) to authenticated;
