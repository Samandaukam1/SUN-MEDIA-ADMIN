-- SUN MEDIA — Sunny's daily AI budget (docs/SUNNY_ROADMAP.md, phase 9).
--
-- The free AI quota is shared by everyone: one visitor (or a script) must not spend the whole day's share. Every
-- question that needs the AI counts once per person per Tashkent day — signed-in people by their account, public
-- visitors by the same one-way key the site's own rate limits use (never an IP or a name). Exact commands answered
-- by the system itself ("vazifalarim", "keldim", the briefing) never reach the AI and are never counted.
--   * private.assistant_usage: day, who, requests — not exposed through the API; old days are pruned by the counter.
--   * public.assistant_spend(who, member): +1 and whether this one is still within the day's limit. Server key only.
--   * Limits in app_settings (the owner changes them): assistant.daily_limit_member, assistant.daily_limit_public.

create table private.assistant_usage (
  day date not null,
  who text not null check (who ~ '^(u|v):[A-Za-z0-9_-]{8,128}$'),
  requests integer not null default 0 check (requests >= 0),
  primary key (day, who)
);
alter table private.assistant_usage enable row level security;
revoke all on private.assistant_usage from public, anon, authenticated;

insert into public.app_settings (key, value, description) values
  ('assistant.daily_limit_member', '300', 'Sunny: bir xodim yoki hamkor uchun kunlik AI savollari (aniq buyruqlar hisoblanmaydi)'),
  ('assistant.daily_limit_public', '40', 'Sunny: sayt mehmoni uchun kunlik AI savollari')
on conflict (key) do nothing;

create or replace function public.assistant_spend(p_who text, p_member boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone private.agency_timezone())::date;
  v_key text := case when p_member then 'assistant.daily_limit_member' else 'assistant.daily_limit_public' end;
  v_limit integer;
  v_used integer;
begin
  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::integer end into v_limit
  from public.app_settings s where s.key = v_key;
  v_limit := coalesce(v_limit, case when p_member then 300 else 40 end);

  insert into private.assistant_usage as u (day, who, requests) values (v_day, p_who, 1)
  on conflict (day, who) do update set requests = u.requests + 1
  returning u.requests into v_used;

  -- The first question of a person's day tidies up: only the last week is kept.
  if v_used = 1 then
    delete from private.assistant_usage where day < v_day - 7;
  end if;
  return v_used <= v_limit;
end;
$$;

revoke all on function public.assistant_spend(text, boolean) from public, anon, authenticated;
grant execute on function public.assistant_spend(text, boolean) to service_role;
