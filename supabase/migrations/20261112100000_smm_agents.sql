-- SUN MEDIA — "Agents": SMM agentlar har bir Instagram profili uchun har kuni story va kunora rasmli post tayyorlaydi,
-- inson tasdig'idan keyin rasmiy Instagram API orqali joylaydi. Additive; boshqa modullarga tegmaydi.
--
--   * agent_profiles      — profil ko'rsatmalari (Instagram, telefon, logo, faktlar, taqiqlar, jadval). O'zgarmas id.
--   * agent_assets        — logo, mahsulot rasmlari, uslub namunalari (Storage: agent-media, yopiq bucket).
--   * agent_memory        — profil xotirasi: brend qoidalari, rad etilgan g'oyalar, tuzatishlar, soha tadqiqoti (manbali).
--   * agent_items         — har kunlik story / kunora post slotlari (bitta profil+tur+sana = bitta yozuv).
--   * agent_versions      — har bir tayyorlangan variant (matn, kadrlar, QA). Tasdiq aniq versiya va hash'ga bog'lanadi.
--   * agent_publish_attempts — har kadr alohida, idempotency kaliti bilan (qisman chiqqan story boshidan takrorlanmaydi).
--   * agent_ig_connections — Instagram Login (instagram_business_content_publish); tokenlar faqat Vault'da.
--   * pg_cron → private.request_agents_worker() → https://sunmediagroup.uz/api/agents/worker (bir martalik token).
--
-- Hamma jadval faqat server (service_role) uchun: panel avval `agents.manage` ruxsatini tekshiradi.

insert into public.permissions (key, module, name, description, scope) values
  ('agents.manage', 'clients', 'SMM agentlar', 'Instagram profillari uchun AI kontent tayyorlash, tasdiqlash va joylash', 'staff')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'agents.manage' from public.roles r where r.key = 'admin'
on conflict (role_id, permission_key) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Sozlamalar (bitta qator)
-- ---------------------------------------------------------------------------------------------------------------
create table public.agent_settings (
  id integer primary key default 1 check (id = 1),
  -- Barcha avtomatik nashrlarni vaqtincha to'xtatish tugmasi (tayyorlash davom etadi).
  publishing_enabled boolean not null default true,
  -- Sinov rejimi: true bo'lsa hech narsa Instagram'ga yuborilmaydi, nashr simulyatsiya qilinadi.
  simulate boolean not null default true,
  prepare_lead_hours integer not null default 20 check (prepare_lead_hours between 1 and 72),
  late_grace_minutes integer not null default 90 check (late_grace_minutes between 5 and 1440),
  daily_ai_limit integer not null default 150 check (daily_ai_limit between 0 and 5000),
  regen_limit integer not null default 4 check (regen_limit between 1 and 20),
  research_weekday integer not null default 1 check (research_weekday between 1 and 7),
  updated_at timestamptz not null default now()
);
insert into public.agent_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Profillar
-- ---------------------------------------------------------------------------------------------------------------
create table public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  instagram_username text check (instagram_username ~ '^[a-z0-9._]{1,30}$'),
  phone text check (char_length(phone) <= 40),
  telegram text check (char_length(telegram) <= 64),
  address text check (char_length(address) <= 300),
  website text check (char_length(website) <= 200),
  business text check (char_length(business) <= 300),
  products text check (char_length(products) <= 3000),
  audience text check (char_length(audience) <= 2000),
  region text check (char_length(region) <= 200),
  language text not null default 'uz' check (language in ('uz', 'uz-cyrl', 'ru')),
  goal text check (char_length(goal) <= 1000),
  advantages text check (char_length(advantages) <= 3000),
  tone text check (char_length(tone) <= 500),
  -- Erkin ko'rsatmalar: "har doim siz deb murojaat qil", "narx yozma" va h.k.
  instructions text check (char_length(instructions) <= 6000),
  facts text check (char_length(facts) <= 6000),
  price_source text check (char_length(price_source) <= 3000),
  cta text check (char_length(cta) <= 200),
  forbidden text check (char_length(forbidden) <= 2000),
  good_examples text check (char_length(good_examples) <= 4000),
  bad_examples text check (char_length(bad_examples) <= 4000),
  -- { "primary": "#RRGGBB", "secondary": …, "bg": …, "text": … }
  colors jsonb not null default '{}' check (jsonb_typeof(colors) = 'object'),
  stories_per_day integer not null default 3 check (stories_per_day between 1 and 10),
  story_time time not null default '09:00',
  post_time time not null default '08:00',
  post_start_date date not null default ((now() at time zone 'Asia/Tashkent')::date),
  approval_mode text not null default 'manual' check (approval_mode in ('manual', 'auto')),
  auto_publish boolean not null default false,
  research_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  paused_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index agent_profiles_username_idx on public.agent_profiles (instagram_username) where instagram_username is not null and status <> 'archived';
create trigger agent_profiles_updated_at before update on public.agent_profiles for each row execute function private.set_updated_at();
create trigger audit_agent_profiles after insert or update or delete on public.agent_profiles for each row execute function private.audit_row();

create table public.agent_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('logo', 'product', 'style', 'reference')),
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text check (char_length(file_name) <= 200),
  mime text check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  width integer check (width >= 0),
  height integer check (height >= 0),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index agent_assets_profile_idx on public.agent_assets (profile_id, kind);

create table public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('brand_rule', 'preference', 'rejected_idea', 'correction', 'research', 'result', 'fact', 'plan')),
  content text not null check (char_length(content) between 1 and 4000),
  -- research: { "sources": [{ "url", "title" }], "checked_at" }; correction: { "item_id", "scope" }
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object'),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_memory_profile_idx on public.agent_memory (profile_id, kind, created_at desc);

create table public.agent_directions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 600),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index agent_directions_profile_idx on public.agent_directions (profile_id, position);

-- ---------------------------------------------------------------------------------------------------------------
-- Kontent
-- ---------------------------------------------------------------------------------------------------------------
create table public.agent_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('story', 'post')),
  target_date date not null,
  scheduled_at timestamptz not null,
  prepare_at timestamptz not null,
  status text not null default 'queued' check (status in (
    'queued', 'generating', 'qa_failed', 'pending_approval', 'approved', 'needs_fix', 'rejected', 'publishing',
    'published', 'simulated', 'partially_published', 'failed', 'needs_reschedule', 'limit_reached', 'skipped')),
  current_version_id uuid,
  regen_count integer not null default 0 check (regen_count >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  last_error text check (char_length(last_error) <= 600),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind, target_date)
);
create index agent_items_due_idx on public.agent_items (status, prepare_at);
create index agent_items_sched_idx on public.agent_items (scheduled_at);
create trigger agent_items_updated_at before update on public.agent_items for each row execute function private.set_updated_at();

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  idea jsonb not null default '{}' check (jsonb_typeof(idea) = 'object'),
  caption text not null default '' check (char_length(caption) <= 2200),
  hashtags text not null default '' check (char_length(hashtags) <= 600),
  -- [{ "role", "headline", "body", "cta", "template", "path", "warnings": [] }]
  frames jsonb not null default '[]' check (jsonb_typeof(frames) = 'array'),
  manual_notes text check (char_length(manual_notes) <= 600),
  qa jsonb not null default '{}' check (jsonb_typeof(qa) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  provider text not null default 'local' check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  note text check (char_length(note) <= 600),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, version_no)
);
alter table public.agent_items add constraint agent_items_current_version_fk
  foreign key (current_version_id) references public.agent_versions (id) on delete set null;

create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  version_id uuid references public.agent_versions (id) on delete cascade,
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('approved', 'rejected', 'fix')),
  scope text check (scope in ('once', 'rule')),
  comment text check (char_length(comment) <= 2000),
  channel text not null default 'panel' check (channel in ('panel', 'auto', 'telegram')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_approvals_item_idx on public.agent_approvals (item_id, created_at desc);

create table public.agent_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  version_id uuid not null references public.agent_versions (id) on delete cascade,
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  frame_index integer not null check (frame_index between 0 and 9),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 100),
  status text not null default 'pending' check (status in ('pending', 'container_created', 'unknown', 'published', 'failed', 'simulated')),
  container_id text check (container_id ~ '^[0-9]{1,40}$'),
  media_id text check (char_length(media_id) <= 60),
  ig_user_id text check (ig_user_id ~ '^[0-9]{1,40}$'),
  error text check (char_length(error) <= 600),
  error_kind text check (error_kind in ('auth', 'permission', 'rate', 'transient', 'bad_request')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_attempts_item_idx on public.agent_publish_attempts (item_id, frame_index);
create trigger agent_publish_attempts_updated_at before update on public.agent_publish_attempts for each row execute function private.set_updated_at();

create table public.agent_insights (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.agent_items (id) on delete cascade,
  media_id text not null check (char_length(media_id) <= 60),
  metrics jsonb not null default '{}' check (jsonb_typeof(metrics) = 'object'),
  fetched_at timestamptz not null default now()
);
create index agent_insights_item_idx on public.agent_insights (item_id, fetched_at desc);

-- AI chaqiruvlari va rasm yaratish hisobi (narx noma'lum bo'lsa cost_usd = null — "taxmin yo'q").
create table public.agent_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.agent_profiles (id) on delete set null,
  purpose text not null check (char_length(purpose) <= 40),
  provider text not null check (char_length(provider) <= 20),
  model text check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  web_searches integer not null default 0 check (web_searches >= 0),
  cost_usd numeric(12, 6),
  created_at timestamptz not null default now()
);
create index agent_usage_created_idx on public.agent_usage (created_at desc);
create index agent_usage_profile_idx on public.agent_usage (profile_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Instagram Login (nashr ruxsati bilan) — tokenlar faqat Vault'da
-- ---------------------------------------------------------------------------------------------------------------
create table public.agent_ig_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.agent_profiles (id) on delete cascade,
  ig_user_id text not null unique check (ig_user_id ~ '^[0-9]{1,40}$'),
  username text check (char_length(username) <= 64),
  account_type text check (char_length(account_type) <= 40),
  permissions text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'reauth', 'error', 'disconnected')),
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  last_error_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger agent_ig_connections_updated_at before update on public.agent_ig_connections for each row execute function private.set_updated_at();

create table public.agent_ig_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  profile_id uuid not null references public.agent_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table private.agent_ig_tokens (
  connection_id uuid primary key references public.agent_ig_connections (id) on delete cascade,
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

create or replace function public.agent_ig_token_save(p_connection uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'empty token' using errcode = '22023';
  end if;
  select vault_secret_id into v_secret from private.agent_ig_tokens where connection_id = p_connection;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'agent_ig_' || p_connection::text, 'Instagram Login token (Agents)');
    insert into private.agent_ig_tokens (connection_id, vault_secret_id) values (p_connection, v_secret);
  else
    perform vault.update_secret(v_secret, p_token);
    update private.agent_ig_tokens set updated_at = now() where connection_id = p_connection;
  end if;
end;
$$;

create or replace function public.agent_ig_token_read(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from private.agent_ig_tokens t
  join vault.decrypted_secrets s on s.id = t.vault_secret_id
  join public.agent_ig_connections c on c.id = t.connection_id
  where t.connection_id = p_connection and c.status <> 'disconnected';
$$;

create or replace function public.agent_ig_token_drop(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  delete from private.agent_ig_tokens where connection_id = p_connection returning vault_secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

create or replace function public.agent_ig_state_consume(p_hash text, p_owner uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.agent_ig_oauth_states set used_at = now()
  where state_hash = p_hash and owner_id = p_owner and used_at is null and expires_at > now()
  returning profile_id;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Rejalashtirish: har kuni story, kunora post (boshlanish sanasidan har 2 kunda — oy chegarasi ta'sir qilmaydi).
-- Bir xil profil+tur+sana faqat bir marta yaratiladi (unique), shuning uchun qayta chaqirish xavfsiz.
-- Vaqti o'tib ketgan slot yaratilmaydi; pauza yoki arxivdagi profil uchun hech narsa yaratilmaydi.
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
  for p in
    select * from public.agent_profiles where status = 'active' and (p_profile is null or id = p_profile)
  loop
    for i in 0 .. greatest(1, least(p_days, 7)) - 1 loop
      d := v_today + i;
      -- story: har kuni
      v_at := (d + p.story_time) at time zone 'Asia/Tashkent';
      if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
        insert into public.agent_items (profile_id, kind, target_date, scheduled_at, prepare_at)
        values (p.id, 'story', d, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
        on conflict (profile_id, kind, target_date) do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      -- post: kunora
      if d >= p.post_start_date and (d - p.post_start_date) % 2 = 0 then
        v_at := (d + p.post_time) at time zone 'Asia/Tashkent';
        if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
          insert into public.agent_items (profile_id, kind, target_date, scheduled_at, prepare_at)
          values (p.id, 'post', d, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
          on conflict (profile_id, kind, target_date) do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Pauza tugaganda vaqti o'tgan, hali chiqmagan materiallar birdan chiqib ketmasin: qayta rejalashtirishga o'tadi.
create or replace function public.agents_resume(p_profile uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  update public.agent_profiles set status = 'active', paused_at = null where id = p_profile and status = 'paused';
  update public.agent_items set status = 'needs_reschedule', last_error = 'Pauza paytida vaqti o‘tdi — qayta rejalashtiring.'
  where profile_id = p_profile and scheduled_at < now()
    and status in ('queued', 'pending_approval', 'approved', 'qa_failed', 'needs_fix');
  get diagnostics v = row_count;
  perform public.agents_plan(p_profile, 3);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Worker: bir martalik tokenlar va pg_cron chaqiruvi (ish bo'lsagina).
-- ---------------------------------------------------------------------------------------------------------------
create table public.agent_worker_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);

create or replace function public.agent_consume_worker_token(p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  delete from public.agent_worker_tokens where expires_at < now() - interval '1 hour';
  delete from public.agent_worker_tokens where token_hash = p_hash and expires_at > now() returning true into v;
  return coalesce(v, false);
end;
$$;

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
  perform public.agents_plan(null, 3);
  select * into v_settings from public.agent_settings where id = 1;
  if not exists (select 1 from public.agent_items i join public.agent_profiles p on p.id = i.profile_id
                 where i.status = 'queued' and i.prepare_at <= now() and p.status = 'active')
     and not exists (select 1 from public.agent_items where status in ('generating', 'publishing') and lease_until < now())
     and not (v_settings.publishing_enabled and exists (
       select 1 from public.agent_items i join public.agent_profiles p on p.id = i.profile_id
       where i.status in ('approved', 'partially_published') and i.scheduled_at <= now() and p.status = 'active' and p.auto_publish))
     and not exists (
       select 1 from public.agent_profiles p
       where p.status = 'active' and p.research_enabled
         and extract(isodow from (now() at time zone 'Asia/Tashkent')) = v_settings.research_weekday
         and not exists (select 1 from public.agent_memory m where m.profile_id = p.id and m.kind = 'research' and m.created_at > now() - interval '6 days'))
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
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'agents worker request failed: %', sqlerrm;
end;
$$;

select cron.schedule('sunmedia-agents-worker', '*/2 * * * *', $$select private.request_agents_worker()$$);

-- ---------------------------------------------------------------------------------------------------------------
-- Storage: yopiq bucket. Panel imzolangan havola orqali ko'rsatadi; Instagram ham qisqa muddatli imzolangan havoladan oladi.
-- ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-media', 'agent-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Kirish: faqat server
-- ---------------------------------------------------------------------------------------------------------------
alter table public.agent_settings enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.agent_assets enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_directions enable row level security;
alter table public.agent_items enable row level security;
alter table public.agent_versions enable row level security;
alter table public.agent_approvals enable row level security;
alter table public.agent_publish_attempts enable row level security;
alter table public.agent_insights enable row level security;
alter table public.agent_usage enable row level security;
alter table public.agent_ig_connections enable row level security;
alter table public.agent_ig_oauth_states enable row level security;
alter table public.agent_worker_tokens enable row level security;
alter table private.agent_ig_tokens enable row level security;

revoke all on public.agent_settings, public.agent_profiles, public.agent_assets, public.agent_memory, public.agent_directions,
  public.agent_items, public.agent_versions, public.agent_approvals, public.agent_publish_attempts, public.agent_insights,
  public.agent_usage, public.agent_ig_connections, public.agent_ig_oauth_states, public.agent_worker_tokens
  from public, anon, authenticated;
grant all on public.agent_settings, public.agent_profiles, public.agent_assets, public.agent_memory, public.agent_directions,
  public.agent_items, public.agent_versions, public.agent_approvals, public.agent_publish_attempts, public.agent_insights,
  public.agent_usage, public.agent_ig_connections, public.agent_ig_oauth_states, public.agent_worker_tokens
  to service_role;
revoke all on private.agent_ig_tokens from public, anon, authenticated, service_role;

revoke all on function public.agent_ig_token_save(uuid, text), public.agent_ig_token_read(uuid), public.agent_ig_token_drop(uuid),
  public.agent_ig_state_consume(text, uuid), public.agents_plan(uuid, integer), public.agents_resume(uuid),
  public.agent_consume_worker_token(text)
  from public, anon, authenticated;
grant execute on function public.agent_ig_token_save(uuid, text), public.agent_ig_token_read(uuid), public.agent_ig_token_drop(uuid),
  public.agent_ig_state_consume(text, uuid), public.agents_plan(uuid, integer), public.agents_resume(uuid),
  public.agent_consume_worker_token(text)
  to service_role;
revoke all on function private.request_agents_worker() from public, anon, authenticated;
