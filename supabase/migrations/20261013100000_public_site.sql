-- Public website on the panel's domain (landing + pages), managed from the admin "Sayt" section.
-- * Content tables are written by site.manage holders only; the site is rendered on the server from
--   public.get_site_content() (service role, published rows only).
-- * The footer gate: a 6-digit code (bcrypt hash, never stored in plain text or in git) opens the panel
--   login. Checked by the panel's server with the service role, rate limited per visitor and globally.
-- * Applications ("Ariza qoldirish"): written by the panel's server with the service role (rate limited),
--   read and archived by site.manage holders. No CRM: a plain inbox.
-- Additive.

insert into public.permissions (key, module, name, scope) values
  ('site.manage', 'website', 'Sayt: sahifalar, kontent va arizalar', 'staff')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_key)
select id, 'site.manage' from public.roles where key = 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id boolean primary key default true check (id),
  hero_eyebrow text not null default '' check (char_length(hero_eyebrow) <= 80),
  hero_title text not null check (char_length(hero_title) between 1 and 160),
  hero_subtitle text not null default '' check (char_length(hero_subtitle) <= 400),
  primary_cta_label text not null default 'Ariza qoldirish' check (char_length(primary_cta_label) between 1 and 40),
  secondary_cta_label text not null default 'Keyslarni ko‘rish' check (char_length(secondary_cta_label) between 1 and 40),
  about_title text not null default '' check (char_length(about_title) <= 160),
  about_body text not null default '' check (char_length(about_body) <= 3000),
  cta_title text not null default '' check (char_length(cta_title) <= 160),
  cta_subtitle text not null default '' check (char_length(cta_subtitle) <= 400),
  phone_primary text check (phone_primary is null or phone_primary ~ '^\+?[0-9]{9,15}$'),
  phone_secondary text check (phone_secondary is null or phone_secondary ~ '^\+?[0-9]{9,15}$'),
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (char_length(address) <= 200),
  working_hours text check (char_length(working_hours) <= 80),
  map_url text check (map_url is null or (char_length(map_url) <= 600 and map_url ~ '^https://')),
  telegram_url text check (telegram_url is null or (char_length(telegram_url) <= 300 and telegram_url ~ '^https://')),
  instagram_url text check (instagram_url is null or (char_length(instagram_url) <= 300 and instagram_url ~ '^https://')),
  youtube_url text check (youtube_url is null or (char_length(youtube_url) <= 300 and youtube_url ~ '^https://')),
  tiktok_url text check (tiktok_url is null or (char_length(tiktok_url) <= 300 and tiktok_url ~ '^https://')),
  facebook_url text check (facebook_url is null or (char_length(facebook_url) <= 300 and facebook_url ~ '^https://')),
  linkedin_url text check (linkedin_url is null or (char_length(linkedin_url) <= 300 and linkedin_url ~ '^https://')),
  form_title text not null default 'Ariza qoldiring' check (char_length(form_title) between 1 and 120),
  form_subtitle text not null default '' check (char_length(form_subtitle) <= 300),
  form_button_label text not null default 'Ariza qoldirish' check (char_length(form_button_label) between 1 and 40),
  form_link_label text not null default 'Havola' check (char_length(form_link_label) between 1 and 60),
  form_link_placeholder text not null default '' check (char_length(form_link_placeholder) <= 120),
  form_success_title text not null default 'Arizangiz qabul qilindi' check (char_length(form_success_title) between 1 and 120),
  form_success_text text not null default '' check (char_length(form_success_text) <= 300),
  footer_note text not null default '' check (char_length(footer_note) <= 200),
  gate_label text not null default 'Xodimlar uchun' check (char_length(gate_label) between 1 and 40),
  seo_title text not null default '' check (char_length(seo_title) <= 80),
  seo_description text not null default '' check (char_length(seo_description) <= 200),
  updated_at timestamptz not null default now()
);

create table public.site_pages (
  key text primary key check (key in ('home', 'services', 'cases', 'partners', 'about', 'contact')),
  path text not null unique check (path ~ '^/[a-z-]*$'),
  nav_label text not null check (char_length(nav_label) between 1 and 30),
  title text not null check (char_length(title) between 1 and 160),
  subtitle text not null default '' check (char_length(subtitle) <= 400),
  seo_title text not null default '' check (char_length(seo_title) <= 80),
  seo_description text not null default '' check (char_length(seo_description) <= 200),
  is_published boolean not null default true,
  show_in_nav boolean not null default true,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now(),
  -- The landing page is the site itself.
  check (key <> 'home' or is_published)
);

-- Blocks of the landing page: which ones show, in what order, under what heading.
create table public.site_sections (
  key text primary key check (key in ('marquee', 'stats', 'services', 'cases', 'benefits', 'process', 'partners', 'testimonials', 'faq', 'cta')),
  eyebrow text not null default '' check (char_length(eyebrow) <= 40),
  title text not null default '' check (char_length(title) <= 160),
  subtitle text not null default '' check (char_length(subtitle) <= 400),
  is_visible boolean not null default true,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now()
);

create table public.site_stats (
  id uuid primary key default gen_random_uuid(),
  value text not null check (char_length(value) between 1 and 16),
  label text not null check (char_length(label) between 1 and 60),
  description text not null default '' check (char_length(description) <= 160),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_services (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 300),
  details text not null default '' check (char_length(details) <= 2000),
  bullets text[] not null default '{}' check (cardinality(bullets) <= 8),
  icon text not null default 'spark' check (icon ~ '^[a-z]{2,20}$'),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  logo_url text check (logo_url is null or (char_length(logo_url) <= 600 and logo_url ~ '^https?://')),
  since_year smallint check (since_year between 1990 and 2100),
  industry text not null default '' check (char_length(industry) <= 60),
  highlight text not null default '' check (char_length(highlight) <= 80),
  description text not null default '' check (char_length(description) <= 500),
  website_url text check (website_url is null or (char_length(website_url) <= 300 and website_url ~ '^https://')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 120),
  partner_id uuid references public.site_partners (id) on delete set null,
  client_name text not null default '' check (char_length(client_name) <= 80),
  category text not null default '' check (char_length(category) <= 40),
  year smallint check (year between 1990 and 2100),
  summary text not null check (char_length(summary) between 1 and 300),
  challenge text not null default '' check (char_length(challenge) <= 2000),
  solution text not null default '' check (char_length(solution) <= 2000),
  results jsonb not null default '[]' check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 6),
  cover_url text check (cover_url is null or (char_length(cover_url) <= 600 and cover_url ~ '^https?://')),
  gallery text[] not null default '{}' check (cardinality(gallery) <= 12),
  video_url text check (video_url is null or (char_length(video_url) <= 300 and video_url ~ '^https://')),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_cases_partner_idx on public.site_cases (partner_id);

create table public.site_testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(quote) between 1 and 600),
  author_name text not null check (char_length(author_name) between 1 and 80),
  author_role text not null default '' check (char_length(author_role) <= 80),
  partner_id uuid references public.site_partners (id) on delete set null,
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 600 and avatar_url ~ '^https?://')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_testimonials_partner_idx on public.site_testimonials (partner_id);

create table public.site_benefits (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 300),
  icon text not null default 'spark' check (icon ~ '^[a-z]{2,20}$'),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_steps (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 300),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 200),
  answer text not null check (char_length(answer) between 1 and 1200),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9]{9,15}$'),
  company text not null default '' check (char_length(company) <= 120),
  link_url text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^https?://')),
  service text not null default '' check (char_length(service) <= 80),
  message text not null default '' check (char_length(message) <= 2000),
  source_path text not null default '/' check (char_length(source_path) <= 200),
  status text not null default 'new' check (status in ('new', 'seen', 'archived')),
  fingerprint text not null check (char_length(fingerprint) between 16 and 128),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null
);
create index site_applications_created_idx on public.site_applications (created_at desc);
create index site_applications_fingerprint_idx on public.site_applications (fingerprint, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['site_settings', 'site_pages', 'site_sections', 'site_stats', 'site_services', 'site_partners',
                           'site_cases', 'site_testimonials', 'site_benefits', 'site_steps', 'site_faqs'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end;
$$;

-- Who changed which text, logo or case — in the Tizim egasi's audit log.
create trigger audit_site_settings after update on public.site_settings for each row execute function private.audit_row('id');
create trigger audit_site_pages after update on public.site_pages for each row execute function private.audit_row('key');
create trigger audit_site_sections after update on public.site_sections for each row execute function private.audit_row('key');
do $$
declare t text;
begin
  foreach t in array array['site_stats', 'site_services', 'site_partners', 'site_cases', 'site_testimonials', 'site_benefits',
                           'site_steps', 'site_faqs'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end;
$$;

-- An application's status is stamped with who handled it and when.
create or replace function private.site_application_handled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'new' then null else now() end;
    new.handled_by := case when new.status = 'new' then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger site_applications_handled before update on public.site_applications
  for each row execute function private.site_application_handled();

-- ---------------------------------------------------------------------------
-- Access: managers only; visitors go through get_site_content()
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.site_pages enable row level security;
alter table public.site_sections enable row level security;
alter table public.site_stats enable row level security;
alter table public.site_services enable row level security;
alter table public.site_partners enable row level security;
alter table public.site_cases enable row level security;
alter table public.site_testimonials enable row level security;
alter table public.site_benefits enable row level security;
alter table public.site_steps enable row level security;
alter table public.site_faqs enable row level security;
alter table public.site_applications enable row level security;

revoke all on public.site_settings, public.site_pages, public.site_sections, public.site_stats, public.site_services,
  public.site_partners, public.site_cases, public.site_testimonials, public.site_benefits, public.site_steps, public.site_faqs,
  public.site_applications from anon, authenticated;

grant select, update on public.site_settings, public.site_pages, public.site_sections to authenticated;
grant select, insert, update, delete on public.site_stats, public.site_services, public.site_partners, public.site_cases,
  public.site_testimonials, public.site_benefits, public.site_steps, public.site_faqs to authenticated;
grant select, delete on public.site_applications to authenticated;
grant update (status) on public.site_applications to authenticated;

do $$
declare t text;
begin
  foreach t in array array['site_settings', 'site_pages', 'site_sections', 'site_stats', 'site_services', 'site_partners',
                           'site_cases', 'site_testimonials', 'site_benefits', 'site_steps', 'site_faqs', 'site_applications'] loop
    execute format(
      'create policy "site managers" on public.%I for all to authenticated using ((select private.has_permission(''site.manage''))) with check ((select private.has_permission(''site.manage'')))',
      t);
  end loop;
end;
$$;

-- Site images (partner logos, case covers, portraits) live in the existing public "branding" bucket under site/:
-- brand imagery stays the only public storage besides avatars. Only site managers write there.
create policy "sunmedia site media read" on storage.objects for select to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site' and (select private.has_permission('site.manage')));
create policy "sunmedia site media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site' and (select private.has_permission('site.manage')));
create policy "sunmedia site media replace" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site' and (select private.has_permission('site.manage')));
create policy "sunmedia site media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site' and (select private.has_permission('site.manage')));

-- ---------------------------------------------------------------------------
-- Everything a visitor sees, in one call (published rows only). Called by the panel's server with the
-- service role while rendering the site: anonymous clients still cannot call any function.
-- ---------------------------------------------------------------------------
create or replace function public.get_site_content()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with partners as (
    select p.* from public.site_partners p where p.is_published
  )
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.site_settings s where s.id),
    'pages', coalesce((select jsonb_agg(to_jsonb(p) - 'updated_at' order by p.sort_order, p.key) from public.site_pages p), '[]'),
    'sections', coalesce((select jsonb_agg(to_jsonb(x) - 'updated_at' order by x.sort_order, x.key) from public.site_sections x), '[]'),
    'stats', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'value', t.value, 'label', t.label, 'description', t.description)
      order by t.sort_order, t.created_at) from public.site_stats t where t.is_published), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'summary', t.summary, 'details', t.details,
      'bullets', to_jsonb(t.bullets), 'icon', t.icon) order by t.sort_order, t.created_at) from public.site_services t where t.is_published), '[]'),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'logoUrl', p.logo_url, 'sinceYear', p.since_year,
      'industry', p.industry, 'highlight', p.highlight, 'description', p.description, 'websiteUrl', p.website_url)
      order by p.sort_order, p.created_at) from partners p), '[]'),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title,
      'partner', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.name, 'logoUrl', p.logo_url) end,
      'clientName', c.client_name, 'category', c.category, 'year', c.year, 'summary', c.summary, 'challenge', c.challenge,
      'solution', c.solution, 'results', c.results, 'coverUrl', c.cover_url, 'gallery', to_jsonb(c.gallery), 'videoUrl', c.video_url,
      'isFeatured', c.is_featured) order by c.sort_order, c.created_at desc)
      from public.site_cases c left join partners p on p.id = c.partner_id where c.is_published), '[]'),
    'testimonials', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'quote', t.quote, 'authorName', t.author_name,
      'authorRole', t.author_role, 'avatarUrl', t.avatar_url, 'partner', case when p.id is null then null
        else jsonb_build_object('id', p.id, 'name', p.name, 'logoUrl', p.logo_url) end)
      order by t.sort_order, t.created_at) from public.site_testimonials t left join partners p on p.id = t.partner_id where t.is_published), '[]'),
    'benefits', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'description', t.description, 'icon', t.icon)
      order by t.sort_order, t.created_at) from public.site_benefits t where t.is_published), '[]'),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'description', t.description)
      order by t.sort_order, t.created_at) from public.site_steps t where t.is_published), '[]'),
    'faqs', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'question', t.question, 'answer', t.answer)
      order by t.sort_order, t.created_at) from public.site_faqs t where t.is_published), '[]')
  );
$$;

revoke all on function public.get_site_content() from public, anon, authenticated;
grant execute on function public.get_site_content() to service_role;

-- ---------------------------------------------------------------------------
-- Footer gate (6-digit code → panel login)
-- ---------------------------------------------------------------------------
create table private.site_gate (
  id boolean primary key default true check (id),
  code_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table private.site_gate_attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index site_gate_attempts_fp_idx on private.site_gate_attempts (fingerprint, created_at desc);
create index site_gate_attempts_failed_idx on private.site_gate_attempts (created_at desc) where not success;

-- Server-only (service role). 5 wrong codes per visitor per 15 minutes; 200 wrong codes per hour overall.
create or replace function public.site_gate_verify(p_code text, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_last_ok timestamptz;
  v_window_start timestamptz;
  v_failed integer;
  v_oldest timestamptz;
  v_global integer;
begin
  if p_fingerprint is null or char_length(p_fingerprint) not between 16 and 128 then
    raise exception 'Invalid fingerprint' using errcode = '22023';
  end if;
  -- One check at a time per visitor, so parallel requests cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended('site_gate:' || p_fingerprint, 0));
  delete from private.site_gate_attempts where created_at < now() - interval '7 days';

  select max(a.created_at) into v_last_ok from private.site_gate_attempts a where a.fingerprint = p_fingerprint and a.success;
  v_window_start := greatest(now() - interval '15 minutes', coalesce(v_last_ok, '-infinity'::timestamptz));
  select count(*), min(a.created_at) into v_failed, v_oldest
  from (
    select a.created_at from private.site_gate_attempts a
    where a.fingerprint = p_fingerprint and not a.success and a.created_at > v_window_start
    order by a.created_at desc limit 5
  ) a;
  if v_failed >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'retryAfter', greatest(1, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::integer));
  end if;
  select count(*) into v_global from private.site_gate_attempts a where not a.success and a.created_at > now() - interval '1 hour';
  if v_global >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retryAfter', 900);
  end if;

  select g.code_hash into v_hash from private.site_gate g where g.id;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'not_configured');
  end if;

  if p_code ~ '^[0-9]{6}$' and extensions.crypt(p_code, v_hash) = v_hash then
    insert into private.site_gate_attempts (fingerprint, success) values (p_fingerprint, true);
    return jsonb_build_object('ok', true);
  end if;
  insert into private.site_gate_attempts (fingerprint, success) values (p_fingerprint, false);
  return jsonb_build_object('ok', false, 'reason', 'invalid', 'remaining', greatest(0, 4 - v_failed));
end;
$$;

-- What the "Sayt › Xavfsizlik" page shows (never the code).
create or replace function public.site_gate_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('site.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'configured', exists (select 1 from private.site_gate g where g.id),
    'updatedAt', (select g.updated_at from private.site_gate g where g.id),
    'failedLastDay', (select count(*) from private.site_gate_attempts a where not a.success and a.created_at > now() - interval '1 day'),
    'openedLastDay', (select count(*) from private.site_gate_attempts a where a.success and a.created_at > now() - interval '1 day')
  );
end;
$$;

-- Only the Tizim egasi changes the code.
create or replace function public.site_gate_set_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('system_owner') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    raise exception 'SITE_GATE_INVALID_CODE' using errcode = '22023';
  end if;
  insert into private.site_gate (id, code_hash, updated_at, updated_by)
  values (true, extensions.crypt(p_code, extensions.gen_salt('bf', 10)), now(), auth.uid())
  on conflict (id) do update set code_hash = excluded.code_hash, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  delete from private.site_gate_attempts;
  perform private.audit_event('site.gate_code_changed', 'site_gate', 'gate');
end;
$$;

-- ---------------------------------------------------------------------------
-- Applications from the site (server-only insert)
-- ---------------------------------------------------------------------------
create or replace function public.site_submit_application(
  p_full_name text,
  p_phone text,
  p_company text,
  p_link_url text,
  p_service text,
  p_message text,
  p_source_path text,
  p_fingerprint text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if p_fingerprint is null or char_length(p_fingerprint) not between 16 and 128 then
    raise exception 'Invalid fingerprint' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('site_application:' || p_fingerprint, 0));
  if (select count(*) from public.site_applications a where a.fingerprint = p_fingerprint and a.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.site_applications a where a.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'SITE_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.site_applications (full_name, phone, company, link_url, service, message, source_path, fingerprint, user_agent)
  values (v_name, v_phone, btrim(coalesce(p_company, '')), nullif(btrim(coalesce(p_link_url, '')), ''), btrim(coalesce(p_service, '')),
          btrim(coalesce(p_message, '')), coalesce(nullif(p_source_path, ''), '/'), p_fingerprint, left(coalesce(p_user_agent, ''), 300))
  returning id into v_id;

  perform private.notify(
    private.users_with_permission('site.manage'),
    'site.application',
    'Saytdan yangi ariza: ' || v_name,
    v_phone || case when btrim(coalesce(p_service, '')) <> '' then ' · ' || btrim(p_service) else '' end,
    jsonb_build_object('application_id', v_id),
    'site_applications', v_id, null, 'high'
  );
  return v_id;
end;
$$;

revoke all on function public.site_gate_verify(text, text), public.site_submit_application(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.site_gate_verify(text, text), public.site_submit_application(text, text, text, text, text, text, text, text, text)
  to service_role;
revoke all on function public.site_gate_status(), public.site_gate_set_code(text) from public, anon;
grant execute on function public.site_gate_status(), public.site_gate_set_code(text) to authenticated;
revoke all on function private.site_application_handled() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Starting content (SUN MEDIA's own copy — editable in "Sayt"). No partners, cases, numbers or reviews:
-- those are real facts the agency enters itself; empty blocks stay hidden on the site.
-- ---------------------------------------------------------------------------
insert into public.site_settings (
  hero_eyebrow, hero_title, hero_subtitle, about_title, about_body, cta_title, cta_subtitle,
  form_title, form_subtitle, form_button_label, form_link_label, form_link_placeholder, form_success_title, form_success_text,
  footer_note, seo_title, seo_description
) values (
  'SMM · Kontent · Reklama',
  'Brendingizni *ko‘rinadigan* va *sotadigan* qilamiz',
  'Strategiya, syomka, montaj, dizayn, target reklama va shaffof hisobotlar — bitta jamoa, bitta tizimda.',
  'Natija uchun ishlaydigan jamoa',
  'SUN MEDIA brendlar uchun kontent strategiyasi, foto va video ishlab chiqarish, dizayn va reklamani bitta jarayonga birlashtiradi. Har bir loyiha kontent reja, syomka jadvali va oylik hisobot bilan boshqariladi — nima, qachon va qanday natija bilan chiqqanini doim ko‘rib turasiz.',
  'Keyingi bosqichga birga chiqamiz',
  'Ariza qoldiring — menejerimiz siz bilan bog‘lanib, brendingiz uchun yo‘l xaritasini taklif qiladi.',
  'Ariza qoldiring',
  'Ma’lumotlaringizni qoldiring — menejerimiz siz bilan bog‘lanadi.',
  'Ariza qoldirish',
  'Instagram yoki sayt havolasi',
  'https://instagram.com/brendingiz',
  'Arizangiz qabul qilindi',
  'Rahmat! Menejerimiz tez orada siz bilan bog‘lanadi.',
  'Brendlar uchun kontent, reklama va natija.',
  'SUN MEDIA — SMM, kontent va reklama agentligi',
  'SUN MEDIA brendlar uchun strategiya, foto-video syomka, montaj, dizayn, target reklama va oylik hisobotlarni bitta jamoada bajaradi.'
);

insert into public.site_pages (key, path, nav_label, title, subtitle, sort_order) values
  ('home', '/', 'Bosh sahifa', 'Brendingizni ko‘rinadigan va sotadigan qilamiz', '', 0),
  ('services', '/xizmatlar', 'Xizmatlar', 'Brendingiz uchun to‘liq xizmatlar',
   'Strategiyadan syomka, montaj, dizayn va reklamagacha — har bir bosqich bitta jamoada.', 1),
  ('cases', '/keyslar', 'Keyslar', 'Natija bilan gapiradigan loyihalar',
   'Hamkorlarimiz bilan birga qilgan ishlarimiz va ularning natijalari.', 2),
  ('partners', '/hamkorlar', 'Hamkorlar', 'Bizga ishonch bildirgan brendlar',
   'Har bir hamkorlik — uzoq muddatli natija va ishonch.', 3),
  ('about', '/biz-haqimizda', 'Biz haqimizda', 'Jamoa, jarayon va qadriyatlar',
   'SUN MEDIA qanday ishlaydi va nega brendlar bizni tanlaydi.', 4),
  ('contact', '/aloqa', 'Aloqa', 'Loyihangizni muhokama qilamiz',
   'Ariza qoldiring yoki biz bilan to‘g‘ridan-to‘g‘ri bog‘laning.', 5);
update public.site_pages set show_in_nav = false where key = 'home';

insert into public.site_sections (key, eyebrow, title, subtitle, sort_order) values
  ('marquee', '', 'Bizga ishonch bildirgan brendlar', '', 0),
  ('stats', 'Raqamlar', 'SUN MEDIA raqamlarda', '', 1),
  ('services', 'Xizmatlar', 'Bir jamoa — barcha yo‘nalishlar', 'Brendingizga kerak bo‘lgan hamma narsa: g‘oyadan tortib natijagacha.', 2),
  ('cases', 'Keyslar', 'Tanlangan loyihalar', 'Raqamlar va natijalar bilan.', 3),
  ('benefits', 'Nega SUN MEDIA', 'Brendingiz uchun real afzalliklar', '', 4),
  ('process', 'Jarayon', 'G‘oyadan natijagacha — aniq jarayon', 'Har bir bosqich rejalashtirilgan va siz uchun shaffof.', 5),
  ('partners', 'Hamkorlar', 'Bizga ishongan brendlar', 'Hamkorlik yillari va erishilgan natijalar.', 6),
  ('testimonials', 'Fikrlar', 'Hamkorlarimiz nima deydi', '', 7),
  ('faq', 'Savollar', 'Ko‘p beriladigan savollar', '', 8),
  ('cta', '', '', '', 9);

insert into public.site_services (title, summary, bullets, icon, sort_order) values
  ('SMM strategiya va boshqaruv',
   'Brendingiz ovozi, kontent reja va kundalik boshqaruv — ijtimoiy tarmoqlarda izchil va ishonchli mavjudlik.',
   array['Brend auditi va strategiya', 'Oylik kontent reja', 'Kopirayting va auditoriya bilan ishlash'], 'strategy', 0),
  ('Foto va video syomka',
   'Operator va mobilograflarimiz Reels, reklama roliklari va brend kontentini professional darajada suratga oladi.',
   array['Reels va qisqa videolar', 'Reklama roliklari', 'Mahsulot va brend fotosessiyasi'], 'camera', 1),
  ('Montaj va motion dizayn',
   'Montaj, rang korreksiyasi va motion grafika — kontentingiz birinchi soniyadan e’tiborni ushlaydi.',
   array['Dinamik montaj', 'Rang korreksiyasi', 'Motion grafika va titrlar'], 'film', 2),
  ('Grafik dizayn va brending',
   'Post, stories, banner va vizual uslub — brendingiz har bir kanalda bir xil va premium ko‘rinadi.',
   array['Vizual uslub va shablonlar', 'Post va stories dizayni', 'Reklama bannerlari'], 'design', 3),
  ('Target reklama va lidlar',
   'Meta reklama kampaniyalari va lid formalar: arizalar tekshirilib, to‘g‘ridan-to‘g‘ri savdo jamoangizga yetkaziladi.',
   array['Instagram va Facebook reklama', 'Lid formalar', 'Arizalarni yetkazish'], 'target', 4),
  ('Analitika va hisobotlar',
   'Har oy qamrov, ko‘rishlar, obunachilar va lidlar bo‘yicha aniq hisobot — natijani raqamlarda ko‘rasiz.',
   array['Oylik hisobot', 'Kontent statistikasi', 'Keyingi oy uchun tavsiyalar'], 'chart', 5);

insert into public.site_benefits (title, description, icon, sort_order) values
  ('Bitta jamoa — to‘liq sikl', 'SMM menejer, operator, mobilograf, montajchi, dizayner va kopirayter — barchasi bitta jamoada ishlaydi.', 'team', 0),
  ('Mijoz ilovasi', 'Kontent reja, syomkalar va hisobotlar — SUN MEDIA mobil ilovasida real vaqtda.', 'app', 1),
  ('Shaffof jarayon', 'Har bir kontent rejadan publikatsiyagacha qaysi bosqichda ekanini kuzatib borasiz.', 'eye', 2),
  ('Raqamlarga asoslangan qarorlar', 'Oylik natijalar va statistika asosida strategiyani doimiy kuchaytiramiz.', 'chart', 3),
  ('O‘z ishlab chiqarishimiz', 'Syomka, montaj va dizayn jamoasi o‘zimizda — tashqi pudratchilarni kutmaysiz.', 'bolt', 4),
  ('Lidlar to‘g‘ridan-to‘g‘ri sizga', 'Reklamadan kelgan arizalar tekshirilib, savdo jamoangizga yetkaziladi.', 'send', 5);

insert into public.site_steps (title, description, sort_order) values
  ('Tanishuv va brif', 'Biznesingiz, auditoriya va maqsadlaringizni o‘rganamiz.', 0),
  ('Strategiya va kontent reja', 'Yo‘nalish, rubrikalar va oylik kontent rejani tuzamiz.', 1),
  ('Syomka va ishlab chiqarish', 'Operator, mobilograf, montaj va dizayn jamoasi kontentni tayyorlaydi.', 2),
  ('Ko‘rib chiqish', 'Tayyor kontentni ko‘rib chiqasiz, kerak bo‘lsa o‘zgartiramiz.', 3),
  ('Publikatsiya va reklama', 'Kontent reja bo‘yicha chiqadi, target reklama lid olib keladi.', 4),
  ('Hisobot va o‘sish', 'Oylik natijalarni tahlil qilib, keyingi oy strategiyasini kuchaytiramiz.', 5);

insert into public.site_faqs (question, answer, sort_order) values
  ('Hamkorlik qanday boshlanadi?',
   'Saytda ariza qoldirasiz yoki bizga qo‘ng‘iroq qilasiz. Menejerimiz tanishuv uchrashuvini belgilaydi, brifdan so‘ng strategiya va tijoriy taklif tayyorlaymiz.', 0),
  ('Natijalarni qanday kuzatib boraman?',
   'SUN MEDIA mobil ilovasida kontent reja, syomkalar, publikatsiyalar va oylik hisobotlar real vaqtda ko‘rinadi.', 1),
  ('Syomkalarni kim olib boradi?',
   'O‘z jamoamiz: operatorlar, mobilograflar va montajchilar. Syomka sanasi va joyi oldindan kelishiladi.', 2),
  ('Reklama arizalari qayerga tushadi?',
   'Meta reklamadan kelgan lidlar tekshiriladi va to‘g‘ridan-to‘g‘ri sizning savdo jamoangizga yetkaziladi.', 3),
  ('Narx qanday belgilanadi?',
   'Narx xizmatlar to‘plami, kontent hajmi va reklama byudjetiga bog‘liq. Brifdan so‘ng aniq tijoriy taklif beramiz.', 4);
