-- A page per partner (/hamkorlar/<slug>): the full story of the work, what was done, results, a timeline of
-- the partnership and photos from the shoots — all edited in Sayt › Hamkorlar. Additive.

alter table public.site_partners
  add column slug text,
  add column cover_url text check (cover_url is null or (char_length(cover_url) <= 600 and cover_url ~ '^https?://')),
  add column story text not null default '' check (char_length(story) <= 6000),
  add column services text[] not null default '{}' check (cardinality(services) <= 12),
  add column results jsonb not null default '[]' check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 6),
  add column timeline jsonb not null default '[]' check (jsonb_typeof(timeline) = 'array' and jsonb_array_length(timeline) <= 12),
  add column gallery text[] not null default '{}' check (cardinality(gallery) <= 24);

-- Readable addresses for the partners that already exist ("SAFI" → safi), unique.
do $$
declare
  r record;
  base text;
  candidate text;
  n integer;
begin
  for r in select id, name from public.site_partners order by sort_order, created_at loop
    base := trim(both '-' from regexp_replace(lower(translate(r.name, '‘’ʻʼ''`', '')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'hamkor-' || left(r.id::text, 8); end if;
    base := left(base, 72);
    candidate := base;
    n := 2;
    while exists (select 1 from public.site_partners p where p.slug = candidate) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update public.site_partners set slug = candidate where id = r.id;
  end loop;
end;
$$;

alter table public.site_partners alter column slug set not null;
alter table public.site_partners add constraint site_partners_slug_key unique (slug);
alter table public.site_partners add constraint site_partners_slug_check
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80);

-- Published site content: partners now carry their page.
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
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'logoUrl', p.logo_url,
      'sinceYear', p.since_year, 'industry', p.industry, 'highlight', p.highlight, 'description', p.description,
      'websiteUrl', p.website_url, 'coverUrl', p.cover_url, 'story', p.story, 'services', to_jsonb(p.services),
      'results', p.results, 'timeline', p.timeline, 'gallery', to_jsonb(p.gallery))
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
      order by t.sort_order, t.created_at) from public.site_faqs t where t.is_published), '[]'),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name, 'description', pl.description,
      'price', pl.price, 'currency', pl.currency, 'priceMode', pl.price_mode, 'billingPeriod', pl.billing_period,
      'isFeatured', pl.is_featured,
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity, 'note', i.note)
        order by i.sort_order, i.created_at) from public.site_plan_items i where i.plan_id = pl.id), '[]'))
      order by pl.sort_order, pl.created_at) from public.site_plans pl where pl.is_published), '[]')
  );
$$;

revoke all on function public.get_site_content() from public, anon, authenticated;
grant execute on function public.get_site_content() to service_role;
