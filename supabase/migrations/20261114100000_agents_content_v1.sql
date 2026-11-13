-- SUN MEDIA — AI Content Agent 1.0 (extends 20261112100000_smm_agents; the agent tables are empty in production, so
-- the constraint changes below touch no records). What changes:
--   * Content: one Story per slot (stories_per_day slots a day, each approved on its own) and a carousel (default
--     4 slides, 4:5) every carousel_every_days days. Versions form a chain (parent, change kind, instruction, models,
--     references, cost); an approval binds to one version — any edit makes a new version that needs a new approval.
--   * Background jobs (agent_jobs): generation, edits, single-slide regeneration, research — claimed one at a time per
--     client, leased, retried with backoff, never duplicated (idempotency key). pg_cron calls the worker as before.
--   * Brand DNA, an asset library, campaigns, trend records with sources, manual performance metrics, export records,
--     budgets (per client and agency), notifications in the panel's own notification centre.
--   * No automatic Instagram publishing in 1.0: the worker no longer publishes; files are exported for manual posting.
--     The Instagram connection tables from the previous step stay unused for a future publishing module.

-- ---------------------------------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_settings
  add column if not exists automation_enabled boolean not null default true,
  add column if not exists monthly_budget_usd numeric(10, 2) check (monthly_budget_usd >= 0),
  add column if not exists monthly_image_limit integer not null default 600 check (monthly_image_limit between 0 and 100000),
  add column if not exists daily_image_limit integer not null default 80 check (daily_image_limit between 0 and 10000),
  add column if not exists revision_warn integer not null default 5 check (revision_warn between 1 and 100),
  add column if not exists story_safe_top integer not null default 250 check (story_safe_top between 0 and 600),
  add column if not exists story_safe_bottom integer not null default 340 check (story_safe_bottom between 0 and 700);
update public.agent_settings set publishing_enabled = false, simulate = true where id = 1;

-- ---------------------------------------------------------------------------------------------------------------
-- Client profiles: Brand DNA, cadence, budget
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_profiles
  add column if not exists industry text check (char_length(industry) <= 80),
  -- { typography: {heading, body, fallback}, palette: {...}, gradients: [], forbidden_colors: [], color_tolerance,
  --   style, slogans: [], positioning, copy_rules, cta_rules, disclaimers, forbidden_words: [], hashtags: [],
  --   contacts: {phones: [], telegram, instagram, website, address, hours}, logo_position, show_contacts }
  add column if not exists brand_dna jsonb not null default '{}' check (jsonb_typeof(brand_dna) = 'object'),
  add column if not exists carousel_slides integer not null default 4 check (carousel_slides between 2 and 10),
  add column if not exists carousel_every_days integer not null default 2 check (carousel_every_days between 1 and 14),
  add column if not exists active_weekdays integer[] not null default '{1,2,3,4,5,6,7}',
  add column if not exists paused_until date,
  add column if not exists emergency_pause boolean not null default false,
  add column if not exists monthly_budget_usd numeric(10, 2) check (monthly_budget_usd >= 0),
  add column if not exists monthly_image_limit integer not null default 120 check (monthly_image_limit between 0 and 10000),
  add column if not exists image_quality text not null default 'medium' check (image_quality in ('low', 'medium', 'high')),
  add column if not exists image_tier text not null default 'premium' check (image_tier in ('premium', 'fast')),
  add column if not exists brief_session_id uuid references public.brief_sessions (id) on delete set null;
alter table public.agent_profiles alter column stories_per_day set default 1;
alter table public.agent_profiles drop constraint if exists agent_profiles_active_weekdays_check;
alter table public.agent_profiles add constraint agent_profiles_active_weekdays_check
  check (active_weekdays <@ '{1,2,3,4,5,6,7}'::integer[] and cardinality(active_weekdays) between 1 and 7);

-- ---------------------------------------------------------------------------------------------------------------
-- Asset library (originals are never overwritten: a replacement is a new row; the old one is archived)
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_assets drop constraint if exists agent_assets_kind_check;
alter table public.agent_assets add constraint agent_assets_kind_check check (kind in (
  'logo', 'logo_light', 'logo_dark', 'product', 'packaging', 'service', 'venue', 'people', 'illustration',
  'previous_design', 'reference', 'campaign', 'typography', 'style', 'font'));
alter table public.agent_assets drop constraint if exists agent_assets_mime_check;
alter table public.agent_assets add constraint agent_assets_mime_check check (mime in ('image/png', 'image/jpeg', 'image/webp', 'font/ttf', 'font/otf'));
alter table public.agent_assets
  add column if not exists title text check (char_length(title) <= 160),
  add column if not exists product_name text check (char_length(product_name) <= 160),
  add column if not exists version integer not null default 1 check (version >= 1),
  add column if not exists source text check (char_length(source) <= 300),
  add column if not exists usage_approved boolean not null default true,
  add column if not exists has_alpha boolean,
  add column if not exists tags text[] not null default '{}',
  add column if not exists sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists campaign_id uuid,
  add column if not exists replaced_by uuid references public.agent_assets (id) on delete set null,
  add column if not exists archived_at timestamptz;
create index if not exists agent_assets_active_idx on public.agent_assets (profile_id, kind) where archived_at is null;

create table if not exists public.agent_campaigns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  -- Only confirmed terms: what may be said about the offer, its dates and price.
  terms text check (char_length(terms) <= 3000),
  starts_on date,
  ends_on date,
  priority integer not null default 0 check (priority between 0 and 10),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists agent_campaigns_profile_idx on public.agent_campaigns (profile_id, active);
alter table public.agent_assets drop constraint if exists agent_assets_campaign_fk;
alter table public.agent_assets add constraint agent_assets_campaign_fk foreign key (campaign_id) references public.agent_campaigns (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------------
-- Content items, versions, approvals
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_items drop constraint if exists agent_items_kind_check;
alter table public.agent_items add constraint agent_items_kind_check check (kind in ('story', 'carousel', 'post'));
alter table public.agent_items drop constraint if exists agent_items_status_check;
alter table public.agent_items add constraint agent_items_status_check check (status in (
  'queued', 'generating', 'regenerating', 'qa_failed', 'pending_approval', 'needs_fix', 'approved', 'export_ready',
  'exported', 'published_manual', 'rejected', 'failed', 'needs_reschedule', 'limit_reached', 'skipped', 'archived',
  -- Previous step (automatic publishing), kept readable:
  'publishing', 'published', 'simulated', 'partially_published'));
alter table public.agent_items
  add column if not exists slot integer not null default 1 check (slot between 1 and 10),
  -- The content plan: objective, audience, concept, message, hook, cta, visual direction, products, trend, campaign.
  add column if not exists plan jsonb not null default '{}' check (jsonb_typeof(plan) = 'object'),
  add column if not exists campaign_id uuid references public.agent_campaigns (id) on delete set null,
  add column if not exists approved_version_id uuid references public.agent_versions (id) on delete set null,
  add column if not exists exported_at timestamptz,
  add column if not exists published_manually_at timestamptz,
  add column if not exists published_by uuid references public.profiles (id) on delete set null,
  add column if not exists publish_note text check (char_length(publish_note) <= 600);
alter table public.agent_items drop constraint if exists agent_items_profile_id_kind_target_date_key;
create unique index if not exists agent_items_slot_key on public.agent_items (profile_id, kind, target_date, slot);

alter table public.agent_versions
  add column if not exists parent_id uuid references public.agent_versions (id) on delete set null,
  add column if not exists change_kind text not null default 'generate' check (change_kind in (
    'generate', 'regenerate', 'text_edit', 'layout_edit', 'image_edit', 'slide_regen', 'restore', 'reorder', 'manual')),
  add column if not exists instruction text check (char_length(instruction) <= 2000),
  -- The structured creative brief (per slide: concept, subject, composition, lighting, palette, zones, prompt).
  add column if not exists spec jsonb not null default '{}' check (jsonb_typeof(spec) = 'object'),
  add column if not exists prompt_version text check (char_length(prompt_version) <= 40),
  add column if not exists text_model text check (char_length(text_model) <= 80),
  add column if not exists image_model text check (char_length(image_model) <= 80),
  add column if not exists reference_asset_ids uuid[] not null default '{}',
  add column if not exists caption_alt text check (char_length(caption_alt) <= 2200),
  add column if not exists cost_usd numeric(12, 6),
  add column if not exists images integer not null default 0 check (images >= 0),
  add column if not exists archived_at timestamptz;

create table if not exists public.agent_review_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  version_id uuid references public.agent_versions (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  author uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_review_comments_item_idx on public.agent_review_comments (item_id, created_at);

-- ---------------------------------------------------------------------------------------------------------------
-- Jobs (persistent queue)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.agent_items (id) on delete cascade,
  profile_id uuid references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('generate', 'regenerate', 'edit', 'slide', 'research')),
  -- { instruction, slides: [0..], scope, bgs: {index: path} (finished backgrounds — a retry does not pay twice) }
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  priority integer not null default 0,
  attempts integer not null default 0 check (attempts >= 0),
  -- A long job continues over several worker calls (each a claim); real failures are counted apart (max 3).
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  progress text check (char_length(progress) <= 300),
  error text check (char_length(error) <= 1000),
  result jsonb,
  idempotency_key text not null unique check (char_length(idempotency_key) <= 160),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists agent_jobs_due_idx on public.agent_jobs (status, run_after);
create index if not exists agent_jobs_profile_idx on public.agent_jobs (profile_id, status);
create index if not exists agent_jobs_item_idx on public.agent_jobs (item_id, created_at desc);
drop trigger if exists agent_jobs_updated_at on public.agent_jobs;
create trigger agent_jobs_updated_at before update on public.agent_jobs for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Trends (each with a source the research actually returned, or an admin-supplied link), metrics, exports, usage
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.agent_trends (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_url text check (source_url ~ '^https?://' and char_length(source_url) <= 1000),
  source_title text check (char_length(source_title) <= 300),
  source_platform text check (char_length(source_platform) <= 60),
  industry text check (char_length(industry) <= 80),
  content_format text check (char_length(content_format) <= 80),
  visual_direction text check (char_length(visual_direction) <= 600),
  why text check (char_length(why) <= 1000),
  adaptation text check (char_length(adaptation) <= 1000),
  freshness text check (freshness in ('fresh', 'recent', 'evergreen', 'unknown')),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  -- research: from the web search (source verified against the search's own sources); admin: added by a person.
  origin text not null default 'research' check (origin in ('research', 'admin')),
  verified boolean not null default false,
  status text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  used_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_trends_profile_idx on public.agent_trends (profile_id, created_at desc);

create table if not exists public.agent_metrics (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  period_start date,
  period_end date,
  reach integer check (reach >= 0),
  impressions integer check (impressions >= 0),
  views integer check (views >= 0),
  likes integer check (likes >= 0),
  comments integer check (comments >= 0),
  shares integer check (shares >= 0),
  saves integer check (saves >= 0),
  profile_visits integer check (profile_visits >= 0),
  website_clicks integer check (website_clicks >= 0),
  leads integer check (leads >= 0),
  sales integer check (sales >= 0),
  source text not null default 'instagram_insights' check (source in ('instagram_insights', 'meta_business', 'crm', 'manual_other')),
  note text check (char_length(note) <= 600),
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_metrics_profile_idx on public.agent_metrics (profile_id, created_at desc);

create table if not exists public.agent_exports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  version_id uuid not null references public.agent_versions (id) on delete cascade,
  kind text not null check (kind in ('file', 'zip')),
  file_name text not null check (char_length(file_name) <= 200),
  bytes integer check (bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  downloaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_exports_item_idx on public.agent_exports (item_id, created_at desc);

alter table public.agent_usage
  add column if not exists item_id uuid references public.agent_items (id) on delete set null,
  add column if not exists kind text not null default 'text' check (kind in ('text', 'image', 'image_edit', 'vision', 'research')),
  add column if not exists images integer not null default 0 check (images >= 0);
create index if not exists agent_usage_kind_idx on public.agent_usage (kind, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Planning: Story slots every active weekday; a carousel every N days from the start date. One row per client, kind,
-- date and slot (unique) — calling it again never duplicates. Paused / emergency-stopped clients get nothing new.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.agents_plan(p_profile uuid default null, p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.agent_settings;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_count integer := 0;
  v_rows integer;
  p record;
  d date;
  v_at timestamptz;
begin
  select * into v_settings from public.agent_settings where id = 1;
  if not coalesce(v_settings.automation_enabled, true) and p_profile is null then
    return 0;
  end if;
  for p in
    select * from public.agent_profiles
    where status = 'active' and not emergency_pause and (p_profile is null or id = p_profile)
  loop
    for i in 0 .. greatest(1, least(p_days, 14)) - 1 loop
      d := v_today + i;
      continue when p.paused_until is not null and d <= p.paused_until;
      continue when not (extract(isodow from d)::integer = any (p.active_weekdays));
      for s in 1 .. p.stories_per_day loop
        -- Several Stories a day are spread 3 hours apart from the configured time.
        v_at := (d + p.story_time + make_interval(hours => 3 * (s - 1))) at time zone 'Asia/Tashkent';
        if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
          insert into public.agent_items (profile_id, kind, target_date, slot, scheduled_at, prepare_at)
          values (p.id, 'story', d, s, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
          on conflict (profile_id, kind, target_date, slot) do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end loop;
      if d >= p.post_start_date and (d - p.post_start_date) % p.carousel_every_days = 0 then
        v_at := (d + p.post_time) at time zone 'Asia/Tashkent';
        if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
          insert into public.agent_items (profile_id, kind, target_date, slot, scheduled_at, prepare_at)
          values (p.id, 'carousel', d, 1, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
          on conflict (profile_id, kind, target_date, slot) do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Due slots become generation jobs (one per item; the key makes a retry or a second worker harmless).
create or replace function public.agents_enqueue_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into public.agent_jobs (item_id, profile_id, kind, idempotency_key)
  select i.id, i.profile_id, 'generate', 'generate:' || i.id::text || ':' || i.regen_count::text
  from public.agent_items i
  join public.agent_profiles p on p.id = i.profile_id
  join public.agent_settings s on s.id = 1
  where i.status = 'queued' and i.prepare_at <= now() and p.status = 'active' and not p.emergency_pause and s.automation_enabled
  on conflict (idempotency_key) do nothing;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Claims one runnable job: at most one running job per client (concurrency), oldest first, skip-locked.
create or replace function public.agent_claim_job(p_lease_seconds integer default 280)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select j.id into v_id
  from public.agent_jobs j
  where j.status = 'queued' and j.run_after <= now()
    and not exists (
      select 1 from public.agent_jobs r
      where r.profile_id is not distinct from j.profile_id and r.status = 'running' and r.lease_until > now())
  order by j.priority desc, j.created_at
  limit 1
  for update skip locked;
  if v_id is null then
    return;
  end if;
  return query
  update public.agent_jobs
  set status = 'running', attempts = attempts + 1, lease_until = now() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(started_at, now()), error = null
  where id = v_id
  returning *;
end;
$$;

-- Finishes a job: done; or a passing failure retried later (bounded); or failed for good.
create or replace function public.agent_finish_job(p_job uuid, p_ok boolean, p_error text default null, p_retry_seconds integer default null, p_result jsonb default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.agent_jobs;
begin
  select * into j from public.agent_jobs where id = p_job for update;
  if not found or j.status <> 'running' then
    return 'not_running';
  end if;
  if p_ok then
    update public.agent_jobs set status = 'done', finished_at = now(), lease_until = null, result = p_result, progress = null where id = p_job;
    return 'done';
  end if;
  if p_retry_seconds is not null and j.attempts < j.max_attempts then
    update public.agent_jobs set status = 'queued', lease_until = null, error = left(p_error, 1000),
      run_after = now() + make_interval(secs => p_retry_seconds) where id = p_job;
    return 'retry';
  end if;
  update public.agent_jobs set status = 'failed', finished_at = now(), lease_until = null, error = left(p_error, 1000) where id = p_job;
  return 'failed';
end;
$$;

-- After a crash or a deployment: running jobs whose lease ran out go back (with backoff) or fail after max attempts;
-- their items leave "generating". Nothing is re-created — a retried job continues from its saved backgrounds.
create or replace function public.agent_recover()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
begin
  update public.agent_jobs
  set status = case when attempts < max_attempts then 'queued' else 'failed' end,
      run_after = now() + make_interval(secs => 60 * power(2, least(attempts, 6))::integer),
      finished_at = case when attempts < max_attempts then null else now() end,
      error = coalesce(error, 'Ish uzilib qoldi (server qayta ishga tushgan bo‘lishi mumkin)'),
      lease_until = null
  where status = 'running' and lease_until < now();
  get diagnostics k = row_count;
  n := n + k;
  -- Items of failed jobs: failed (with the job's error); items without an active job: back to their last state.
  update public.agent_items i
  set status = 'failed', last_error = left(coalesce(j.error, 'Tayyorlash muvaffaqiyatsiz'), 600), lease_until = null
  from public.agent_jobs j
  where j.item_id = i.id and j.status = 'failed' and i.status in ('generating', 'regenerating')
    and not exists (select 1 from public.agent_jobs a where a.item_id = i.id and a.status in ('queued', 'running'));
  get diagnostics k = row_count;
  n := n + k;
  update public.agent_items i
  set status = case when i.current_version_id is null then 'queued' else 'pending_approval' end, lease_until = null
  where i.status in ('generating', 'regenerating') and (i.lease_until is null or i.lease_until < now())
    and not exists (select 1 from public.agent_jobs a where a.item_id = i.id and a.status in ('queued', 'running'));
  get diagnostics k = row_count;
  n := n + k;
  delete from public.agent_worker_tokens where expires_at < now() - interval '1 hour';
  return n;
end;
$$;

-- Panel notifications for everyone with agents.manage (the existing notification centre; no Telegram).
create or replace function public.agent_notify(p_type text, p_title text, p_body text, p_route text, p_entity uuid default null, p_priority text default 'normal')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.notify(
    private.users_with_permission('agents.manage'),
    p_type,
    p_title,
    p_body,
    jsonb_build_object('route', p_route),
    'agent_item',
    p_entity,
    null,
    (case when p_priority in ('low', 'normal', 'high') then p_priority else 'normal' end)::public.notification_priority,
    true
  );
exception when others then
  raise warning 'agent notification failed: %', sqlerrm;
  return 0;
end;
$$;

-- The scheduler: every 2 minutes, only when there is work, one call to the deployed worker with a one-time token.
create or replace function private.request_agents_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_settings public.agent_settings;
begin
  select * into v_settings from public.agent_settings where id = 1;
  if not exists (select 1 from public.agent_items i join public.agent_profiles p on p.id = i.profile_id
                 where i.status = 'queued' and i.prepare_at <= now() and p.status = 'active' and not p.emergency_pause
                   and v_settings.automation_enabled)
     and not exists (select 1 from public.agent_jobs where status = 'queued' and run_after <= now())
     and not exists (select 1 from public.agent_jobs where status = 'running' and lease_until < now())
     and not exists (select 1 from public.agent_items where status in ('generating', 'regenerating') and lease_until < now())
     and not exists (
       select 1 from public.agent_profiles p
       where p.status = 'active' and p.research_enabled and v_settings.automation_enabled
         and extract(isodow from (now() at time zone 'Asia/Tashkent')) = v_settings.research_weekday
         and not exists (select 1 from public.agent_trends t where t.profile_id = p.id and t.origin = 'research' and t.created_at > now() - interval '6 days')
         and not exists (select 1 from public.agent_jobs j where j.profile_id = p.id and j.kind = 'research' and j.created_at > now() - interval '6 days'))
     -- Plan the next days once an hour even when nothing else is due.
     and extract(minute from now()) >= 2
  then
    return;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.agent_worker_tokens (token_hash, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '5 minutes');
  perform net.http_post(
    url := 'https://sunmediagroup.uz/api/agents/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agents-worker', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
exception when others then
  raise warning 'agents worker request failed: %', sqlerrm;
end;
$$;

-- "Hozir yaratish" / edits: wake the worker now instead of waiting for the next cron tick.
create or replace function public.agents_kick()
returns void
language sql
security definer
set search_path = ''
as $$ select private.request_agents_worker(); $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Storage: AI backgrounds (PNG) and uploaded fonts need more room and two more types.
-- ---------------------------------------------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 15728640, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'font/ttf', 'font/otf']
where id = 'agent-media';

-- ---------------------------------------------------------------------------------------------------------------
-- Access: server only (the panel checks agents.manage first), as for the rest of the agent tables.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_campaigns enable row level security;
alter table public.agent_review_comments enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.agent_trends enable row level security;
alter table public.agent_metrics enable row level security;
alter table public.agent_exports enable row level security;
revoke all on public.agent_campaigns, public.agent_review_comments, public.agent_jobs, public.agent_trends,
  public.agent_metrics, public.agent_exports from public, anon, authenticated;
grant all on public.agent_campaigns, public.agent_review_comments, public.agent_jobs, public.agent_trends,
  public.agent_metrics, public.agent_exports to service_role;

revoke all on function public.agents_plan(uuid, integer), public.agents_enqueue_due(), public.agent_claim_job(integer),
  public.agent_finish_job(uuid, boolean, text, integer, jsonb), public.agent_recover(),
  public.agent_notify(text, text, text, text, uuid, text), public.agents_kick() from public, anon, authenticated;
grant execute on function public.agents_plan(uuid, integer), public.agents_enqueue_due(), public.agent_claim_job(integer),
  public.agent_finish_job(uuid, boolean, text, integer, jsonb), public.agent_recover(),
  public.agent_notify(text, text, text, text, uuid, text), public.agents_kick() to service_role;
revoke all on function private.request_agents_worker() from public, anon, authenticated;
