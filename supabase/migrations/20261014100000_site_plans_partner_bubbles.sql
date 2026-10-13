-- Site tariffs ("Tariflar") managed in Sayt, the "Hamkorlarimiz" call to action, and safer site images. Additive.
-- Site tariffs are the agency's public offers. They are separate from public.plans, which hold client subscriptions
-- and drive the mobile app's quotas.

-- ---------------------------------------------------------------------------
-- Tariffs and their services
-- ---------------------------------------------------------------------------
create table public.site_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  price numeric(14, 2) check (price >= 0 and price < 1000000000000),
  currency text not null default 'UZS' check (currency in ('UZS', 'USD', 'EUR')),
  -- fixed: "5 000 000 so‘m"; from: "5 000 000 so‘mdan"; negotiable: "Kelishiladi" (no price).
  price_mode text not null default 'fixed' check (price_mode in ('fixed', 'from', 'negotiable')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'one_time')),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_mode = 'negotiable' or price is not null)
);
-- One "Tavsiya etiladi" tariff at most.
create unique index site_plans_one_featured on public.site_plans ((true)) where is_featured;

create table public.site_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.site_plans (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity text not null default '' check (char_length(quantity) <= 40),
  note text not null default '' check (char_length(note) <= 160),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_plan_items_plan_idx on public.site_plan_items (plan_id, sort_order);

create trigger site_plans_updated_at before update on public.site_plans for each row execute function private.set_updated_at();
create trigger site_plan_items_updated_at before update on public.site_plan_items for each row execute function private.set_updated_at();
create trigger audit_site_plans after insert or update or delete on public.site_plans for each row execute function private.audit_row();
create trigger audit_site_plan_items after insert or update or delete on public.site_plan_items for each row execute function private.audit_row();

alter table public.site_plans enable row level security;
alter table public.site_plan_items enable row level security;
revoke all on public.site_plans, public.site_plan_items from anon, authenticated;
grant select, insert, update, delete on public.site_plans, public.site_plan_items to authenticated;
create policy "site managers" on public.site_plans for all to authenticated
  using ((select private.has_permission('site.manage'))) with check ((select private.has_permission('site.manage')));
create policy "site managers" on public.site_plan_items for all to authenticated
  using ((select private.has_permission('site.manage'))) with check ((select private.has_permission('site.manage')));

-- Saves a tariff with its services in one transaction (the caller's own rights: RLS applies).
-- p_items: [{id?, name, quantity, note}] in display order; services missing from the list are removed.
create or replace function public.site_save_plan(p_plan jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_mode text := coalesce(p_plan ->> 'price_mode', 'fixed');
  v_price numeric := case when coalesce(p_plan ->> 'price_mode', 'fixed') = 'negotiable' then null else nullif(p_plan ->> 'price', '')::numeric end;
  v_featured boolean := coalesce((p_plan ->> 'is_featured')::boolean, false);
  v_items jsonb := coalesce(p_items, '[]');
  v_item jsonb;
  v_item_id uuid;
  v_keep uuid[] := '{}';
  v_pos integer := 0;
begin
  if not private.has_permission('site.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 30 then
    raise exception 'SITE_PLAN_INVALID' using errcode = '22023';
  end if;
  if v_featured then
    update public.site_plans set is_featured = false where is_featured and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.site_plans (name, description, price, currency, price_mode, billing_period, is_featured, is_published, sort_order)
    values (btrim(p_plan ->> 'name'), btrim(coalesce(p_plan ->> 'description', '')), v_price, coalesce(p_plan ->> 'currency', 'UZS'), v_mode,
            coalesce(p_plan ->> 'billing_period', 'monthly'), v_featured, coalesce((p_plan ->> 'is_published')::boolean, true),
            coalesce((select max(sort_order) + 1 from public.site_plans), 0))
    returning id into v_id;
  else
    update public.site_plans
    set name = btrim(p_plan ->> 'name'),
        description = btrim(coalesce(p_plan ->> 'description', '')),
        price = v_price,
        currency = coalesce(p_plan ->> 'currency', 'UZS'),
        price_mode = v_mode,
        billing_period = coalesce(p_plan ->> 'billing_period', 'monthly'),
        is_featured = v_featured,
        is_published = coalesce((p_plan ->> 'is_published')::boolean, is_published)
    where id = v_id;
    if not found then
      raise exception 'SITE_PLAN_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_item_id := nullif(v_item ->> 'id', '')::uuid;
    if v_item_id is not null and exists (select 1 from public.site_plan_items i where i.id = v_item_id and i.plan_id = v_id) then
      update public.site_plan_items
      set name = btrim(v_item ->> 'name'), quantity = btrim(coalesce(v_item ->> 'quantity', '')),
          note = btrim(coalesce(v_item ->> 'note', '')), sort_order = v_pos
      where id = v_item_id;
    else
      insert into public.site_plan_items (plan_id, name, quantity, note, sort_order)
      values (v_id, btrim(v_item ->> 'name'), btrim(coalesce(v_item ->> 'quantity', '')), btrim(coalesce(v_item ->> 'note', '')), v_pos)
      returning id into v_item_id;
    end if;
    v_keep := v_keep || v_item_id;
    v_pos := v_pos + 1;
  end loop;
  delete from public.site_plan_items i where i.plan_id = v_id and i.id <> all (v_keep);
  return v_id;
end;
$$;

revoke all on function public.site_save_plan(jsonb, jsonb) from public, anon;
grant execute on function public.site_save_plan(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- "Tariflar" page and landing block
-- ---------------------------------------------------------------------------
alter table public.site_pages drop constraint site_pages_key_check;
alter table public.site_pages add constraint site_pages_key_check
  check (key in ('home', 'services', 'cases', 'partners', 'plans', 'about', 'contact'));
update public.site_pages set sort_order = sort_order + 1 where key in ('about', 'contact');
insert into public.site_pages (key, path, nav_label, title, subtitle, sort_order) values
  ('plans', '/tariflar', 'Tariflar', 'Brendingizga mos tarif',
   'Xizmatlar tarkibi, hajmi va narxi — tanlang yoki o‘zingizga moslashtirish uchun ariza qoldiring.', 4);

alter table public.site_sections drop constraint site_sections_key_check;
alter table public.site_sections add constraint site_sections_key_check
  check (key in ('marquee', 'stats', 'services', 'cases', 'benefits', 'process', 'partners', 'plans', 'testimonials', 'faq', 'cta'));
update public.site_sections set sort_order = sort_order + 1 where key in ('testimonials', 'faq', 'cta');
insert into public.site_sections (key, eyebrow, title, subtitle, sort_order) values
  ('plans', 'Tariflar', 'Brendingizga mos tarif', 'Xizmatlar tarkibi va narxi.', 7);

-- The header and hero buttons now lead to the partners page.
alter table public.site_settings alter column primary_cta_label set default 'Hamkorlarimiz';
update public.site_settings set primary_cta_label = 'Hamkorlarimiz' where primary_cta_label = 'Ariza qoldirish';

-- ---------------------------------------------------------------------------
-- Published site content: now with tariffs
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

-- ---------------------------------------------------------------------------
-- Site images: raster only. The editor turns SVG into PNG in the browser; storage refuses .svg under site/.
-- ---------------------------------------------------------------------------
drop policy "sunmedia site media write" on storage.objects;
drop policy "sunmedia site media replace" on storage.objects;
create policy "sunmedia site media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and (select private.has_permission('site.manage')));
create policy "sunmedia site media replace" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site' and (select private.has_permission('site.manage')))
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = 'site'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and (select private.has_permission('site.manage')));
