-- "Mijoz tahlili" — adaptive client interviews (additive: prospects and prospect_analyses stay as they are).
--   * A manager starts a session; the client answers on a separate, token-scoped page (/suhbat) that never uses the
--     staff session. Only the sha256 of the token is stored; it expires and is cleared on completion.
--   * Each answer is saved at once with the question exactly as shown (text, options, version, source), so editing
--     the bank later never rewrites a finished interview. A revision number makes double clicks and two tabs safe.
--   * Reports keep the deterministic part and the AI part apart; a manager's correction is stored beside the
--     original, never over it. AI suggestions are kept with their provenance, accepted or rejected.
-- Staff with prospects.manage read and manage everything through RLS; the client's page reaches only its own session
-- through the server (service role) after the token check. anon has no access to any of it.

-- ---------------------------------------------------------------------------------------------------------------
-- Question bank edits (the built-in library lives in code; every edit here is a new immutable version)
-- ---------------------------------------------------------------------------------------------------------------
create table public.brief_question_versions (
  key text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,3}$' and char_length(key) <= 80),
  version integer not null check (version between 1 and 10000),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  active boolean not null default true,
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (key, version)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------------------------------------------
create table public.brief_sessions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete set null,
  -- ready: created, not started; active: answering; completed: submitted; abandoned: closed by a manager.
  status text not null default 'ready' check (status in ('ready', 'active', 'completed', 'abandoned')),
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  company_hint text check (char_length(company_hint) <= 160),
  contact_hint text check (char_length(contact_hint) <= 160),
  industry text check (char_length(industry) <= 40),
  sub_industry text check (char_length(sub_industry) <= 40),
  -- { industry, sub, confidence, source: keywords | ai | choice, matched? }
  classification jsonb,
  answer_order text[] not null default '{}',
  current_key text check (char_length(current_key) <= 80),
  revision integer not null default 0,
  consent_at timestamptz,
  started_at timestamptz,
  last_seen_at timestamptz,
  completed_at timestamptz,
  -- Per-session request limiter (the client page): requests in the current minute.
  req_window timestamptz,
  req_count integer not null default 0,
  ai_calls integer not null default 0,
  ai_input_tokens integer not null default 0,
  ai_output_tokens integer not null default 0,
  ai_cost_usd numeric(12, 6),
  review_status text not null default 'new' check (review_status in ('new', 'reviewing', 'reviewed')),
  manager_notes text check (char_length(manager_notes) <= 8000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or token_hash is null)
);
create index brief_sessions_created_idx on public.brief_sessions (created_at desc);
create index brief_sessions_status_idx on public.brief_sessions (status, created_at desc);
create index brief_sessions_prospect_idx on public.brief_sessions (prospect_id) where prospect_id is not null;

create trigger brief_sessions_updated_at before update on public.brief_sessions
  for each row execute function private.set_updated_at();

create table public.brief_answers (
  session_id uuid not null references public.brief_sessions (id) on delete cascade,
  question_key text not null check (char_length(question_key) <= 80),
  question_version integer not null default 1,
  -- The question as the client saw it: { text, type, stage, category, purpose, options[], source, provenance? }.
  question jsonb not null check (jsonb_typeof(question) = 'object'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  stage text not null check (stage in ('identity', 'industry', 'marketing', 'website_gate', 'website', 'wrapup')),
  source text not null default 'curated' check (source in ('curated', 'bank', 'ai', 'rule')),
  edit_count integer not null default 0,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, question_key)
);

create table public.brief_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.brief_sessions (id) on delete cascade,
  -- One per trigger (e.g. "followup:id.offer", "gaps:marketing"): a repeated click never asks twice.
  trigger_key text not null check (char_length(trigger_key) <= 120),
  kind text not null check (kind in ('classify', 'followup', 'gaps')),
  status text not null default 'pending' check (status in ('pending', 'asked', 'rejected', 'none')),
  question jsonb,
  decision jsonb,
  reject_reason text check (char_length(reject_reason) <= 500),
  model text check (char_length(model) <= 80),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  unique (session_id, trigger_key)
);

create table public.brief_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.brief_sessions (id) on delete cascade,
  version integer not null check (version >= 1),
  -- pending: being prepared; ready: AI analysis done; no_ai: answers-only report, AI analysis awaited; failed: AI failed.
  status text not null default 'pending' check (status in ('pending', 'ready', 'no_ai', 'failed')),
  facts jsonb not null default '{}',
  analysis jsonb,
  model text check (char_length(model) <= 80),
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  error text check (char_length(error) <= 500),
  -- A manager's correction, beside the original (which is never rewritten).
  correction jsonb,
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, version)
);
create index brief_reports_session_idx on public.brief_reports (session_id, version desc);

create trigger brief_reports_updated_at before update on public.brief_reports
  for each row execute function private.set_updated_at();

create table public.brief_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.brief_sessions (id) on delete cascade,
  kind text not null check (char_length(kind) <= 60),
  detail jsonb not null default '{}',
  actor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index brief_events_session_idx on public.brief_events (session_id, id);

-- ---------------------------------------------------------------------------------------------------------------
-- Client-page functions (service role only; the server calls them after hashing the cookie's token)
-- ---------------------------------------------------------------------------------------------------------------

-- The session behind a token, if it may still be used; counts the request (at most p_limit per minute).
create or replace function public.brief_client_open(p_hash text, p_limit integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.brief_sessions;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  select * into r from public.brief_sessions where token_hash = p_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if r.status not in ('ready', 'active') or r.token_expires_at is null or r.token_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if r.req_window is null or r.req_window < now() - interval '1 minute' then
    update public.brief_sessions set req_window = now(), req_count = 1, last_seen_at = now() where id = r.id;
  elsif r.req_count >= p_limit then
    return jsonb_build_object('ok', false, 'code', 'rate');
  else
    update public.brief_sessions set req_count = req_count + 1, last_seen_at = now() where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status, 'revision', r.revision);
end;
$$;

create or replace function public.brief_client_begin(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.brief_sessions
  set status = 'active', consent_at = coalesce(consent_at, now()), started_at = coalesce(started_at, now())
  where id = p_session and status in ('ready', 'active');
$$;

-- Saves one answer (with the question as shown) and the new order, only if nobody saved in between (revision).
-- Answers that no longer apply after an earlier change leave the active set; their last values stay in the events.
create or replace function public.brief_save_answer(
  p_session uuid,
  p_revision integer,
  p_key text,
  p_answer jsonb,
  p_order text[],
  p_current text,
  p_drop text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.brief_sessions;
  v_old jsonb;
begin
  select * into r from public.brief_sessions where id = p_session for update;
  if not found or r.status not in ('ready', 'active') then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;
  if r.revision <> p_revision then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'revision', r.revision);
  end if;

  select value into v_old from public.brief_answers where session_id = p_session and question_key = p_key;
  insert into public.brief_answers (session_id, question_key, question_version, question, value, stage, source)
  values (
    p_session, p_key, coalesce((p_answer->>'version')::integer, 1), p_answer->'question', p_answer->'value',
    p_answer->>'stage', coalesce(p_answer->>'source', 'curated')
  )
  on conflict (session_id, question_key) do update
    set value = excluded.value, question = excluded.question, question_version = excluded.question_version,
        stage = excluded.stage, source = excluded.source, updated_at = now(),
        edit_count = public.brief_answers.edit_count + case when public.brief_answers.value is distinct from excluded.value then 1 else 0 end;
  if v_old is not null and v_old is distinct from p_answer->'value' then
    insert into public.brief_events (session_id, kind, detail) values (p_session, 'answer_changed', jsonb_build_object('key', p_key, 'previous', v_old));
  end if;

  if coalesce(array_length(p_drop, 1), 0) > 0 then
    insert into public.brief_events (session_id, kind, detail)
    select p_session, 'answer_dropped', jsonb_build_object('key', a.question_key, 'value', a.value, 'question', a.question->>'text')
    from public.brief_answers a where a.session_id = p_session and a.question_key = any(p_drop);
    delete from public.brief_answers where session_id = p_session and question_key = any(p_drop);
  end if;

  update public.brief_sessions
  set answer_order = p_order, current_key = p_current, revision = revision + 1, status = 'active',
      started_at = coalesce(started_at, now())
  where id = p_session;
  return jsonb_build_object('ok', true, 'revision', r.revision + 1);
end;
$$;

-- Moves the client's place (back navigation) without changing answers.
create or replace function public.brief_set_current(p_session uuid, p_revision integer, p_current text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  update public.brief_sessions set current_key = p_current, revision = revision + 1
  where id = p_session and revision = p_revision and status = 'active'
  returning revision into v;
  if v is null then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  return jsonb_build_object('ok', true, 'revision', v);
end;
$$;

-- Submission: once only. The token stops working, a report row is opened for the analysis.
create or replace function public.brief_complete(p_session uuid, p_revision integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.brief_sessions;
begin
  select * into r from public.brief_sessions where id = p_session for update;
  if not found then
    return 'missing';
  end if;
  if r.status = 'completed' then
    return 'done';
  end if;
  if r.status <> 'active' then
    return 'closed';
  end if;
  if r.revision <> p_revision then
    return 'conflict';
  end if;
  update public.brief_sessions
  set status = 'completed', completed_at = now(), token_hash = null, token_expires_at = null, current_key = null, revision = revision + 1
  where id = p_session;
  insert into public.brief_reports (session_id, version, status) values (p_session, 1, 'pending') on conflict do nothing;
  insert into public.brief_events (session_id, kind, detail) values (p_session, 'completed', jsonb_build_object('answers', coalesce(array_length(r.answer_order, 1), 0)));
  return 'ok';
end;
$$;

-- AI budget per session: reserves one call if under the limit (two clicks cannot both pass the check).
create or replace function public.brief_ai_reserve(p_session uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  update public.brief_sessions set ai_calls = ai_calls + 1 where id = p_session and ai_calls < p_limit returning ai_calls into v;
  return v is not null;
end;
$$;

create or replace function public.brief_ai_usage(p_session uuid, p_input integer, p_output integer, p_cost numeric default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.brief_sessions
  set ai_input_tokens = ai_input_tokens + greatest(coalesce(p_input, 0), 0),
      ai_output_tokens = ai_output_tokens + greatest(coalesce(p_output, 0), 0),
      ai_cost_usd = case when p_cost is null then ai_cost_usd else coalesce(ai_cost_usd, 0) + p_cost end
  where id = p_session;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------------------------------
alter table public.brief_question_versions enable row level security;
alter table public.brief_sessions enable row level security;
alter table public.brief_answers enable row level security;
alter table public.brief_ai_suggestions enable row level security;
alter table public.brief_reports enable row level security;
alter table public.brief_events enable row level security;

revoke all on public.brief_question_versions, public.brief_sessions, public.brief_answers, public.brief_ai_suggestions,
  public.brief_reports, public.brief_events from public, anon, authenticated;
grant all on public.brief_question_versions, public.brief_sessions, public.brief_answers, public.brief_ai_suggestions,
  public.brief_reports, public.brief_events to service_role;

-- Staff with the permission: read everything; manage sessions (never the token or the answers), reports
-- (corrections and new versions), notes and the bank.
grant select on public.brief_question_versions, public.brief_answers, public.brief_ai_suggestions, public.brief_events to authenticated;
grant select, insert, delete on public.brief_sessions to authenticated;
grant update (status, review_status, manager_notes, prospect_id, company_hint, contact_hint) on public.brief_sessions to authenticated;
grant select, insert on public.brief_reports to authenticated;
grant update (correction, corrected_by, corrected_at) on public.brief_reports to authenticated;
grant insert on public.brief_question_versions to authenticated;
grant insert on public.brief_events to authenticated;

create policy "brief staff read" on public.brief_sessions for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief staff add" on public.brief_sessions for insert to authenticated with check ((select private.has_permission('prospects.manage')) and token_hash is null);
create policy "brief staff edit" on public.brief_sessions for update to authenticated
  using ((select private.has_permission('prospects.manage'))) with check ((select private.has_permission('prospects.manage')));
create policy "brief staff delete" on public.brief_sessions for delete to authenticated using ((select private.has_permission('prospects.manage')));

create policy "brief answers read" on public.brief_answers for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief suggestions read" on public.brief_ai_suggestions for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief events read" on public.brief_events for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief events add" on public.brief_events for insert to authenticated
  with check ((select private.has_permission('prospects.manage')) and actor = (select auth.uid()));

create policy "brief reports read" on public.brief_reports for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief reports add" on public.brief_reports for insert to authenticated with check ((select private.has_permission('prospects.manage')));
create policy "brief reports correct" on public.brief_reports for update to authenticated
  using ((select private.has_permission('prospects.manage'))) with check ((select private.has_permission('prospects.manage')));

create policy "brief bank read" on public.brief_question_versions for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "brief bank add" on public.brief_question_versions for insert to authenticated
  with check ((select private.has_permission('prospects.manage')) and created_by = (select auth.uid()));

revoke all on function public.brief_client_open(text, integer), public.brief_client_begin(uuid),
  public.brief_save_answer(uuid, integer, text, jsonb, text[], text, text[]), public.brief_set_current(uuid, integer, text),
  public.brief_complete(uuid, integer), public.brief_ai_reserve(uuid, integer), public.brief_ai_usage(uuid, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.brief_client_open(text, integer), public.brief_client_begin(uuid),
  public.brief_save_answer(uuid, integer, text, jsonb, text[], text, text[]), public.brief_set_current(uuid, integer, text),
  public.brief_complete(uuid, integer), public.brief_ai_reserve(uuid, integer), public.brief_ai_usage(uuid, integer, integer, numeric)
  to service_role;
