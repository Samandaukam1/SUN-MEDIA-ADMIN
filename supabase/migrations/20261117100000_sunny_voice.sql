-- SUN MEDIA — Sunny 3.0: an economical, expressive Uzbek voice.
--
--   * assistant_personality gains what the owner wants to hear: sarcasm, Qitmir intensity, preferred and avoided
--     expressions, reply length, and whether Sunny may learn from the owner's "shunday gapir" feedback.
--   * public.assistant_pronunciations: the owner's pronunciation fixes ("SAFI" → "Safi"), applied to speech only.
--   * private.assistant_voice_usage: TTS characters (and cache hits) and speech-recognition time per day and
--     provider, so the free quotas (Azure F0: 0.5 M neural characters, 5 audio hours a month) are watched.
--   * app_settings 'assistant.voice': voice, fallback voice, rate, pitch, on/off, monthly character cap and whether
--     going over the free quota is allowed (never by default).
--   * storage bucket 'assistant-voice' (private): cached audio of fixed phrases only ("Eshitaman!", "Tayyor").

alter table public.assistant_personality
  add column if not exists sarcasm real not null default 0.2 check (sarcasm between 0 and 1),
  add column if not exists qitmir_intensity smallint not null default 2 check (qitmir_intensity between 1 and 3),
  add column if not exists phrases text not null default '' check (char_length(phrases) <= 2000),
  add column if not exists avoid_phrases text not null default '' check (char_length(avoid_phrases) <= 2000),
  add column if not exists reply_length text not null default 'short' check (reply_length in ('short', 'normal', 'detailed')),
  add column if not exists learn_from_feedback boolean not null default false;

create table if not exists public.assistant_pronunciations (
  id uuid primary key default gen_random_uuid(),
  word text not null check (char_length(word) between 1 and 80),
  say_as text not null check (char_length(say_as) between 1 and 120),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (word)
);
alter table public.assistant_pronunciations enable row level security;
revoke all on public.assistant_pronunciations from anon;
grant select, insert, update, delete on public.assistant_pronunciations to authenticated;
create policy assistant_pronunciations_owner on public.assistant_pronunciations
  for all to authenticated using (private.has_role('system_owner')) with check (private.has_role('system_owner'));

create table if not exists private.assistant_voice_usage (
  day date not null,
  kind text not null check (kind in ('tts', 'stt')),
  provider text not null check (char_length(provider) between 2 and 40),
  requests integer not null default 0,
  chars bigint not null default 0,
  audio_ms bigint not null default 0,
  cached integer not null default 0,
  primary key (day, kind, provider)
);
alter table private.assistant_voice_usage enable row level security;
revoke all on private.assistant_voice_usage from public, anon, authenticated;

insert into public.app_settings (key, value, description) values
  ('assistant.voice', '{}', 'Sunny ovozi: ovoz, zaxira ovoz, tezlik, ohang, oylik belgi chegarasi, pullik rejimga ruxsat (bo‘sh — standart)')
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assistant-voice', 'assistant-voice', false, 2097152, array['audio/mpeg', 'application/octet-stream'])
on conflict (id) do nothing;

create or replace function public.assistant_voice_record(p_kind text, p_provider text, p_chars integer default 0, p_audio_ms integer default 0, p_cached boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.assistant_voice_usage as u (day, kind, provider, requests, chars, audio_ms, cached)
  values ((now() at time zone private.agency_timezone())::date, p_kind, p_provider, 1, case when p_cached then 0 else greatest(coalesce(p_chars, 0), 0) end, least(greatest(coalesce(p_audio_ms, 0), 0), 600000), case when p_cached then 1 else 0 end)
  on conflict (day, kind, provider) do update
    set requests = u.requests + 1, chars = u.chars + excluded.chars, audio_ms = u.audio_ms + excluded.audio_ms, cached = u.cached + excluded.cached;
  delete from private.assistant_voice_usage where day < (now() at time zone private.agency_timezone())::date - 400;
end;
$$;

-- This month's totals per kind and provider (characters billed exclude cache hits). The server reads it to keep within
-- the free quota; the owner sees it in Sozlamalar.
create or replace function public.assistant_voice_month()
returns table (kind text, provider text, requests bigint, chars bigint, audio_ms bigint, cached bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' and ((select auth.uid()) is null or not private.has_role('system_owner')) then
    raise exception 'Only the system owner sees voice usage' using errcode = '42501';
  end if;
  return query
    select u.kind, u.provider, sum(u.requests)::bigint, sum(u.chars)::bigint, sum(u.audio_ms)::bigint, sum(u.cached)::bigint
    from private.assistant_voice_usage u
    where u.day >= date_trunc('month', now() at time zone private.agency_timezone())::date
    group by 1, 2
    order by 1, 2;
end;
$$;

revoke all on function public.assistant_voice_record(text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.assistant_voice_record(text, text, integer, integer, boolean) to service_role;
revoke all on function public.assistant_voice_month() from public, anon;
grant execute on function public.assistant_voice_month() to authenticated, service_role;
