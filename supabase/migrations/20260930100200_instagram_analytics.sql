-- SUN MEDIA — Instagram analytics from the Meta Graph API, client results and honest tariff forecasts (additive).
--
-- meta-sync (Edge Function, daily) writes one snapshot per account per day, month-to-date totals into the existing
-- social_metrics table and per-post insights. Nothing is estimated here: NULL means "Meta did not give it".
-- Growth for 7 / 30 / 90 days is read from the stored history, so it is only as long as the history is.

create table public.social_daily_snapshots (
  social_account_id uuid not null,
  client_id uuid not null,
  snapshot_date date not null,
  followers integer check (followers >= 0),
  media_count integer check (media_count >= 0),
  views bigint check (views >= 0),
  reach bigint check (reach >= 0),
  interactions bigint check (interactions >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  profile_links_taps bigint check (profile_links_taps >= 0),
  accounts_engaged bigint check (accounts_engaged >= 0),
  -- Unique accounts reached in the 7 / 30 days ending on this date (reach does not add up day by day).
  reach_7d bigint check (reach_7d >= 0),
  reach_30d bigint check (reach_30d >= 0),
  source public.metric_source not null default 'api',
  synced_at timestamptz not null default now(),
  primary key (social_account_id, snapshot_date),
  foreign key (social_account_id, client_id) references public.social_accounts (id, client_id) on delete cascade
);

create index social_daily_snapshots_client_idx on public.social_daily_snapshots (client_id, snapshot_date desc);

-- Instagram posts, Reels and Stories with their latest insights; optionally linked to the SUN MEDIA content item.
create table public.social_media_items (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null,
  client_id uuid not null,
  external_id text not null check (external_id ~ '^[0-9]{1,40}$'),
  media_type text check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  product_type text check (product_type in ('FEED', 'REELS', 'STORY', 'AD')),
  permalink text check (char_length(permalink) <= 500),
  thumbnail_url text check (char_length(thumbnail_url) <= 2000),
  caption text check (char_length(caption) <= 500),
  posted_at timestamptz,
  views bigint check (views >= 0),
  reach bigint check (reach >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  interactions bigint check (interactions >= 0),
  content_id uuid references public.content_items (id) on delete set null,
  metrics_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, external_id),
  foreign key (social_account_id, client_id) references public.social_accounts (id, client_id) on delete cascade
);

create index social_media_items_client_idx on public.social_media_items (client_id, posted_at desc);
create index social_media_items_content_idx on public.social_media_items (content_id) where content_id is not null;

create trigger social_media_items_updated_at
  before update on public.social_media_items
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Service role (meta-sync)
-- ---------------------------------------------------------------------------

-- Connected Instagram accounts to sync, with the page asset whose token reads them.
create or replace function public.ig_accounts_to_sync(p_client uuid default null)
returns table (
  asset_id uuid, social_account_id uuid, client_id uuid, ig_user_id text, token_asset_id uuid,
  connection_id uuid, last_snapshot date
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.social_account_id, a.client_id, a.external_id,
         (select p.id from public.meta_assets p
          where p.client_id = a.client_id and p.asset_type = 'page' and p.external_id = a.parent_external_id
            and p.status <> 'disconnected'),
         a.connection_id,
         (select max(s.snapshot_date) from public.social_daily_snapshots s where s.social_account_id = a.social_account_id)
  from public.meta_assets a
  join public.clients c on c.id = a.client_id and c.deleted_at is null and c.status in ('active', 'paused')
  where a.asset_type = 'instagram' and a.status <> 'disconnected' and a.social_account_id is not null
    and (p_client is null or a.client_id = p_client);
$$;

-- One day of account insights. Values Meta did not return stay NULL (and never overwrite a known value).
create or replace function public.ig_save_snapshot(p_social_account uuid, p_date date, p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.social_accounts where id = p_social_account;
  if v_client is null then
    raise exception 'Social account not found' using errcode = 'P0002';
  end if;
  insert into public.social_daily_snapshots (
    social_account_id, client_id, snapshot_date, followers, media_count, views, reach, interactions, likes, comments,
    shares, saves, profile_links_taps, accounts_engaged, reach_7d, reach_30d, source, synced_at
  )
  values (
    p_social_account, v_client, p_date,
    (p_metrics ->> 'followers')::integer, (p_metrics ->> 'media_count')::integer,
    (p_metrics ->> 'views')::bigint, (p_metrics ->> 'reach')::bigint, (p_metrics ->> 'interactions')::bigint,
    (p_metrics ->> 'likes')::bigint, (p_metrics ->> 'comments')::bigint, (p_metrics ->> 'shares')::bigint,
    (p_metrics ->> 'saves')::bigint, (p_metrics ->> 'profile_links_taps')::bigint, (p_metrics ->> 'accounts_engaged')::bigint,
    (p_metrics ->> 'reach_7d')::bigint, (p_metrics ->> 'reach_30d')::bigint, 'api', now()
  )
  on conflict (social_account_id, snapshot_date) do update
  set followers = coalesce(excluded.followers, public.social_daily_snapshots.followers),
      media_count = coalesce(excluded.media_count, public.social_daily_snapshots.media_count),
      views = coalesce(excluded.views, public.social_daily_snapshots.views),
      reach = coalesce(excluded.reach, public.social_daily_snapshots.reach),
      interactions = coalesce(excluded.interactions, public.social_daily_snapshots.interactions),
      likes = coalesce(excluded.likes, public.social_daily_snapshots.likes),
      comments = coalesce(excluded.comments, public.social_daily_snapshots.comments),
      shares = coalesce(excluded.shares, public.social_daily_snapshots.shares),
      saves = coalesce(excluded.saves, public.social_daily_snapshots.saves),
      profile_links_taps = coalesce(excluded.profile_links_taps, public.social_daily_snapshots.profile_links_taps),
      accounts_engaged = coalesce(excluded.accounts_engaged, public.social_daily_snapshots.accounts_engaged),
      reach_7d = coalesce(excluded.reach_7d, public.social_daily_snapshots.reach_7d),
      reach_30d = coalesce(excluded.reach_30d, public.social_daily_snapshots.reach_30d),
      synced_at = now();
end;
$$;

-- Month-to-date (or a closed month) totals into the monthly social_metrics used by monthly reports.
create or replace function public.ig_save_period(p_social_account uuid, p_start date, p_end date, p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.social_accounts where id = p_social_account;
  if v_client is null then
    raise exception 'Social account not found' using errcode = 'P0002';
  end if;
  insert into public.social_metrics (
    social_account_id, client_id, period_start, period_end, followers_start, followers_end, reach, views,
    profile_visits, likes, comments, shares, saves, source, synced_at
  )
  values (
    p_social_account, v_client, p_start, p_end,
    (p_metrics ->> 'followers_start')::integer, (p_metrics ->> 'followers_end')::integer,
    (p_metrics ->> 'reach')::bigint, (p_metrics ->> 'views')::bigint, (p_metrics ->> 'profile_links_taps')::bigint,
    (p_metrics ->> 'likes')::bigint, (p_metrics ->> 'comments')::bigint, (p_metrics ->> 'shares')::bigint,
    (p_metrics ->> 'saves')::bigint, 'api', now()
  )
  on conflict (social_account_id, period_start, period_end) do update
  set followers_start = coalesce(public.social_metrics.followers_start, excluded.followers_start),
      followers_end = coalesce(excluded.followers_end, public.social_metrics.followers_end),
      reach = coalesce(excluded.reach, public.social_metrics.reach),
      views = coalesce(excluded.views, public.social_metrics.views),
      profile_visits = coalesce(excluded.profile_visits, public.social_metrics.profile_visits),
      likes = coalesce(excluded.likes, public.social_metrics.likes),
      comments = coalesce(excluded.comments, public.social_metrics.comments),
      shares = coalesce(excluded.shares, public.social_metrics.shares),
      saves = coalesce(excluded.saves, public.social_metrics.saves),
      source = 'api',
      synced_at = now();
end;
$$;

-- Posts with insights. A post whose permalink matches a SUN MEDIA publication is linked to that content item and
-- its publication metrics are refreshed from the API.
create or replace function public.ig_save_media(p_social_account uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_item jsonb;
  v_link text;
  v_pub public.content_publications;
  v_count integer := 0;
begin
  select client_id into v_client from public.social_accounts where id = p_social_account;
  if v_client is null then
    raise exception 'Social account not found' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_link := rtrim(v_item ->> 'permalink', '/');
    v_pub := null;
    if v_link is not null then
      select * into v_pub from public.content_publications p
      where p.client_id = v_client and p.status <> 'cancelled'
        and (p.external_post_id = v_item ->> 'id' or rtrim(p.post_url, '/') = v_link)
      order by p.published_at desc nulls last
      limit 1;
    end if;

    insert into public.social_media_items (
      social_account_id, client_id, external_id, media_type, product_type, permalink, thumbnail_url, caption, posted_at,
      views, reach, likes, comments, shares, saves, interactions, content_id, metrics_synced_at
    )
    values (
      p_social_account, v_client, v_item ->> 'id', v_item ->> 'media_type', v_item ->> 'media_product_type',
      left(v_item ->> 'permalink', 500), left(v_item ->> 'thumbnail_url', 2000), left(v_item ->> 'caption', 500),
      (v_item ->> 'timestamp')::timestamptz,
      (v_item ->> 'views')::bigint, (v_item ->> 'reach')::bigint, (v_item ->> 'likes')::bigint,
      (v_item ->> 'comments')::bigint, (v_item ->> 'shares')::bigint, (v_item ->> 'saves')::bigint,
      (v_item ->> 'interactions')::bigint, v_pub.content_id, now()
    )
    on conflict (social_account_id, external_id) do update
    set media_type = excluded.media_type, product_type = excluded.product_type, permalink = excluded.permalink,
        thumbnail_url = coalesce(excluded.thumbnail_url, public.social_media_items.thumbnail_url),
        caption = excluded.caption, posted_at = coalesce(excluded.posted_at, public.social_media_items.posted_at),
        views = coalesce(excluded.views, public.social_media_items.views),
        reach = coalesce(excluded.reach, public.social_media_items.reach),
        likes = coalesce(excluded.likes, public.social_media_items.likes),
        comments = coalesce(excluded.comments, public.social_media_items.comments),
        shares = coalesce(excluded.shares, public.social_media_items.shares),
        saves = coalesce(excluded.saves, public.social_media_items.saves),
        interactions = coalesce(excluded.interactions, public.social_media_items.interactions),
        content_id = coalesce(public.social_media_items.content_id, excluded.content_id),
        metrics_synced_at = now();

    if v_pub.id is not null then
      insert into public.content_metrics (publication_id, content_id, client_id, views, reach, likes, comments, shares, saves, source, captured_at)
      values (v_pub.id, v_pub.content_id, v_client, (v_item ->> 'views')::bigint, (v_item ->> 'reach')::bigint,
              (v_item ->> 'likes')::bigint, (v_item ->> 'comments')::bigint, (v_item ->> 'shares')::bigint,
              (v_item ->> 'saves')::bigint, 'api', now())
      on conflict (publication_id) do update
      set views = coalesce(excluded.views, public.content_metrics.views),
          reach = coalesce(excluded.reach, public.content_metrics.reach),
          likes = coalesce(excluded.likes, public.content_metrics.likes),
          comments = coalesce(excluded.comments, public.content_metrics.comments),
          shares = coalesce(excluded.shares, public.content_metrics.shares),
          saves = coalesce(excluded.saves, public.content_metrics.saves),
          source = 'api', captured_at = now();
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.ig_mark_synced(p_asset_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_social uuid;
begin
  update public.meta_assets
  set last_synced_at = case when p_error is null then now() else last_synced_at end,
      sync_error = left(p_error, 1000),
      status = case when p_error is null then 'active'::public.integration_status else 'error'::public.integration_status end
  where id = p_asset_id
  returning social_account_id into v_social;
  if v_social is not null then
    update public.social_accounts
    set last_synced_at = case when p_error is null then now() else last_synced_at end,
        sync_error = left(p_error, 1000),
        connection = case when p_error is null then 'connected'::public.social_connection else 'error'::public.social_connection end
    where id = v_social;
  end if;
end;
$$;

revoke all on function public.ig_accounts_to_sync(uuid) from public, anon, authenticated;
revoke all on function public.ig_save_snapshot(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.ig_save_period(uuid, date, date, jsonb) from public, anon, authenticated;
revoke all on function public.ig_save_media(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ig_mark_synced(uuid, text) from public, anon, authenticated;
grant execute on function public.ig_accounts_to_sync(uuid) to service_role;
grant execute on function public.ig_save_snapshot(uuid, date, jsonb) to service_role;
grant execute on function public.ig_save_period(uuid, date, date, jsonb) to service_role;
grant execute on function public.ig_save_media(uuid, jsonb) to service_role;
grant execute on function public.ig_mark_synced(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reading results (client: Akkaunt → Natijalar; staff: client page)
-- ---------------------------------------------------------------------------
create or replace function private.can_see_results(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_client_permission(p_client, 'client.results.view')
      or (private.is_staff() and (private.sees_all_clients() or p_client = any (private.staff_client_ids())));
$$;

grant execute on function private.can_see_results(uuid) to authenticated;

-- Instagram summary for the last p_days (7 / 30 / 90) against the period before, from stored history only.
create or replace function public.get_instagram_summary(p_client uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts;
  v_today date := private.agency_today();
  v_from date;
  v_prev_from date;
  v_first public.social_daily_snapshots;
  v_last public.social_daily_snapshots;
  v_cur jsonb;
  v_prev jsonb;
begin
  if not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'Choose 7, 30 or 90 days' using errcode = '22023';
  end if;
  v_from := v_today - p_days;
  v_prev_from := v_from - p_days;

  select * into v_account from public.social_accounts s
  where s.client_id = p_client and s.platform = 'instagram' and s.deleted_at is null
  order by (s.connection = 'connected') desc, s.last_synced_at desc nulls last
  limit 1;
  if v_account.id is null then
    return jsonb_build_object('connected', false);
  end if;

  select * into v_first from public.social_daily_snapshots
  where social_account_id = v_account.id and snapshot_date >= v_from and followers is not null
  order by snapshot_date limit 1;
  select * into v_last from public.social_daily_snapshots
  where social_account_id = v_account.id and snapshot_date >= v_from
  order by snapshot_date desc limit 1;

  select jsonb_build_object(
    'days_with_data', count(*),
    'views', sum(views), 'interactions', sum(interactions), 'likes', sum(likes), 'comments', sum(comments),
    'shares', sum(shares), 'saves', sum(saves), 'profile_links_taps', sum(profile_links_taps)
  ) into v_cur
  from public.social_daily_snapshots
  where social_account_id = v_account.id and snapshot_date > v_from and snapshot_date <= v_today;

  select jsonb_build_object('days_with_data', count(*), 'views', sum(views), 'interactions', sum(interactions))
  into v_prev
  from public.social_daily_snapshots
  where social_account_id = v_account.id and snapshot_date > v_prev_from and snapshot_date <= v_from;

  return jsonb_build_object(
    'connected', v_account.connection = 'connected',
    'account', jsonb_build_object('handle', v_account.handle, 'url', v_account.url, 'last_synced_at', v_account.last_synced_at,
                                  'sync_error', v_account.sync_error is not null),
    'days', p_days,
    'history_from', (select min(snapshot_date) from public.social_daily_snapshots where social_account_id = v_account.id),
    'followers', v_last.followers,
    -- Growth covers only the stored part of the period (growth_since tells from when).
    'followers_growth', case when v_first.followers is not null and v_last.followers is not null and v_last.snapshot_date > v_first.snapshot_date
                             then v_last.followers - v_first.followers end,
    'growth_since', case when v_last.snapshot_date > v_first.snapshot_date then v_first.snapshot_date end,
    'reach', case p_days when 7 then v_last.reach_7d when 30 then v_last.reach_30d end,
    'current', v_cur,
    'previous', case when (v_prev ->> 'days_with_data')::int >= greatest(p_days / 2, 1) then v_prev end,
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', snapshot_date, 'views', views, 'reach', reach, 'interactions', interactions,
                                          'followers', followers) order by snapshot_date)
      from public.social_daily_snapshots
      where social_account_id = v_account.id and snapshot_date > v_from and snapshot_date <= v_today
    ), '[]'::jsonb)
  );
end;
$$;

-- "Eng yaxshi kontentlar": posted in the period, best first by the chosen metric.
create or replace function public.get_top_media(p_client uuid, p_days integer default 30, p_limit integer default 10, p_sort text default 'views')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_sort not in ('views', 'reach', 'likes', 'shares', 'saves', 'comments') then
    raise exception 'Unknown sort' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.metric desc nulls last, x.posted_at desc)
    from (
      select m.id, m.external_id, m.media_type, m.product_type, m.permalink, m.thumbnail_url, m.caption, m.posted_at,
             m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.interactions, m.content_id,
             ci.title as content_title,
             case p_sort when 'views' then m.views when 'reach' then m.reach when 'likes' then m.likes
                         when 'shares' then m.shares when 'saves' then m.saves else m.comments end as metric
      from public.social_media_items m
      left join public.content_items ci on ci.id = m.content_id and ci.deleted_at is null
      where m.client_id = p_client and m.posted_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
        and coalesce(m.product_type, '') <> 'AD'
      order by metric desc nulls last, m.posted_at desc
      limit least(greatest(p_limit, 1), 50)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- "SUN MEDIA bu oy SAFI uchun": production counts and results for one month. Missing sources come back NULL.
create or replace function public.get_client_results(p_client uuid, p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := private.agency_timezone();
  v_month date := date_trunc('month', coalesce(p_month, private.agency_today()))::date;
  v_next date;
  v_from timestamptz;
  v_to timestamptz;
  v_account uuid;
  v_ig jsonb := null;
  v_leads jsonb := null;
  v_first integer;
  v_last integer;
  v_has_crm boolean;
begin
  if not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_next := (v_month + interval '1 month')::date;
  v_from := v_month::timestamp at time zone v_tz;
  v_to := v_next::timestamp at time zone v_tz;

  select s.id into v_account from public.social_accounts s
  where s.client_id = p_client and s.platform = 'instagram' and s.deleted_at is null
  order by (s.connection = 'connected') desc, s.last_synced_at desc nulls last limit 1;

  if v_account is not null and exists (
    select 1 from public.social_daily_snapshots d where d.social_account_id = v_account and d.snapshot_date >= v_month and d.snapshot_date < v_next
  ) then
    select d.followers into v_first from public.social_daily_snapshots d
    where d.social_account_id = v_account and d.snapshot_date >= v_month - 1 and d.snapshot_date < v_next and d.followers is not null
    order by d.snapshot_date limit 1;
    select d.followers into v_last from public.social_daily_snapshots d
    where d.social_account_id = v_account and d.snapshot_date >= v_month and d.snapshot_date < v_next and d.followers is not null
    order by d.snapshot_date desc limit 1;
    select jsonb_build_object(
      'views', sum(d.views),
      'interactions', sum(d.interactions),
      'reach', (select m.reach from public.social_metrics m where m.social_account_id = v_account and m.period_start = v_month and m.source = 'api'
                order by m.period_end desc limit 1),
      'followers', v_last,
      'followers_growth', case when v_first is not null and v_last is not null then v_last - v_first end,
      'days_with_data', count(*)
    ) into v_ig
    from public.social_daily_snapshots d
    where d.social_account_id = v_account and d.snapshot_date >= v_month and d.snapshot_date < v_next;
  end if;

  v_has_crm := exists (select 1 from public.meta_assets a where a.client_id = p_client and a.asset_type in ('page', 'lead_form') and a.status <> 'disconnected')
            or exists (select 1 from public.leads l where l.client_id = p_client);
  if v_has_crm then
    select jsonb_build_object('delivered', count(*)) into v_leads
    from public.leads l where l.client_id = p_client and l.delivery_status = 'delivered' and l.lead_at >= v_from and l.lead_at < v_to;
  end if;

  return jsonb_build_object(
    'month', v_month,
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code) from public.clients c where c.id = p_client),
    'production', (
      select jsonb_build_object(
        'reels', count(*) filter (where ci.content_type = 'reel'),
        'stories', count(*) filter (where ci.content_type = 'story'),
        'posts', count(*) filter (where ci.content_type in ('post', 'carousel')),
        'videos', count(*) filter (where ci.content_type = 'video'),
        'designs', count(*) filter (where ci.content_type in ('design', 'ad_creative')),
        'published', count(*)
      )
      from public.content_items ci
      where ci.client_id = p_client and ci.deleted_at is null and ci.status = 'published'
        and ci.published_at >= v_from and ci.published_at < v_to
    ) || jsonb_build_object(
      'shootings', (select count(*) from public.shootings s where s.client_id = p_client and s.deleted_at is null
                    and s.status = 'completed' and s.starts_at >= v_from and s.starts_at < v_to)
    ),
    'instagram', v_ig,
    'leads', v_leads
  );
end;
$$;

-- "TAXMINIY IMKONIYAT": what the next tariff could bring, as a range from this client's own history.
-- Refuses to guess without at least 30 days of Instagram history and 4 measured Reels.
create or replace function public.get_client_forecast(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_sub public.client_subscriptions;
  v_plan public.plans;
  v_next public.plans;
  v_account uuid;
  v_days integer;
  v_reels integer;
  v_p25 numeric;
  v_p75 numeric;
  v_views30 numeric;
  v_growth30 numeric;
  v_f_start integer;
  v_f_end integer;
  v_cur_reels integer;
  v_next_reels integer;
  v_extra integer;
  v_views_low numeric;
  v_views_high numeric;
  v_leads30 numeric;
  v_cur_ads integer;
  v_next_ads integer;
  v_first_lead timestamptz;
  v_result jsonb;
begin
  if not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_sub from public.client_subscriptions s where s.id = private.subscription_for_date(p_client, v_today);
  if v_sub.id is null then
    return jsonb_build_object('available', false, 'reason', 'no_plan');
  end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  select * into v_next from public.plans p
  where p.is_active and p.is_public and p.deleted_at is null and p.currency = v_plan.currency and p.price > v_plan.price
  order by p.price limit 1;
  if v_next.id is null then
    return jsonb_build_object('available', false, 'reason', 'top_plan');
  end if;

  select coalesce(sum(q.quantity) filter (where q.service_key in ('reels', 'videos')), 0),
         coalesce(sum(q.quantity) filter (where q.service_key = 'ad_creatives'), 0)
  into v_cur_reels, v_cur_ads
  from public.subscription_quotas q where q.subscription_id = v_sub.id and q.is_included;
  select coalesce(sum(f.quantity) filter (where f.service_key in ('reels', 'videos')), 0),
         coalesce(sum(f.quantity) filter (where f.service_key = 'ad_creatives'), 0)
  into v_next_reels, v_next_ads
  from public.plan_features f where f.plan_id = v_next.id and f.is_included;
  v_extra := v_next_reels - v_cur_reels;

  select s.id into v_account from public.social_accounts s
  where s.client_id = p_client and s.platform = 'instagram' and s.deleted_at is null
  order by (s.connection = 'connected') desc limit 1;

  select count(*) into v_days from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.snapshot_date > v_today - 90 and d.views is not null;
  select count(*), percentile_cont(0.25) within group (order by m.views), percentile_cont(0.75) within group (order by m.views)
  into v_reels, v_p25, v_p75
  from public.social_media_items m
  where m.social_account_id = v_account and m.product_type = 'REELS' and m.views is not null
    and m.posted_at >= now() - interval '90 days';

  if v_account is null or v_days < 30 or v_reels < 4 then
    return jsonb_build_object('available', false, 'reason', 'not_enough_data', 'days', coalesce(v_days, 0), 'reels', coalesce(v_reels, 0));
  end if;
  if v_extra <= 0 then
    return jsonb_build_object('available', false, 'reason', 'no_extra_content', 'next_plan', v_next.name);
  end if;

  select sum(d.views) into v_views30 from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.snapshot_date > v_today - 30;
  select d.followers into v_f_end from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.followers is not null order by d.snapshot_date desc limit 1;
  select d.followers into v_f_start from public.social_daily_snapshots d
  where d.social_account_id = v_account and d.followers is not null and d.snapshot_date > v_today - 31
  order by d.snapshot_date limit 1;
  v_growth30 := v_f_end - v_f_start;

  -- More Reels a month, each performing like this client's weaker (p25) to stronger (p75) Reels.
  v_views_low := v_views30 + v_extra * v_p25 * 0.8;
  v_views_high := v_views30 + v_extra * v_p75;

  v_result := jsonb_build_object(
    'available', true,
    'current_plan', v_plan.name,
    'next_plan', v_next.name,
    'extra_reels', v_extra,
    'basis', jsonb_build_object('days', v_days, 'reels', v_reels, 'views_30d', v_views30, 'reel_views_p25', round(v_p25), 'reel_views_p75', round(v_p75)),
    'views', jsonb_build_object('low', round(v_views_low, -3), 'high', round(v_views_high, -3)),
    -- Followers grow with views at the rate this account has shown over the last 30 days.
    'followers', case when coalesce(v_growth30, 0) > 0 and coalesce(v_views30, 0) > 0 then
      jsonb_build_object('low', round(v_growth30 * v_views_low / v_views30, -1), 'high', round(v_growth30 * v_views_high / v_views30, -1)) end
  );

  -- Leads only when ads are part of both tariffs and there is a full month of lead history.
  select min(l.lead_at), count(*) filter (where l.lead_at >= now() - interval '30 days')
  into v_first_lead, v_leads30
  from public.leads l where l.client_id = p_client and l.delivery_status <> 'discarded';
  if v_first_lead <= now() - interval '30 days' and v_leads30 > 0 and v_cur_ads > 0 and v_next_ads > v_cur_ads then
    v_result := v_result || jsonb_build_object('leads', jsonb_build_object(
      'low', round(v_leads30 * (1 + (v_next_ads::numeric / v_cur_ads - 1) * 0.3)),
      'high', round(v_leads30 * (1 + (v_next_ads::numeric / v_cur_ads - 1) * 0.6))
    ));
  end if;
  return v_result;
end;
$$;

-- Staff can link an Instagram post to the SUN MEDIA content item it came from.
create or replace function public.link_media_to_content(p_media_id uuid, p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.social_media_items;
begin
  select * into v_media from public.social_media_items where id = p_media_id;
  if not found or not private.can_manage_client(v_media.client_id, 'analytics.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_content_id is not null and not exists (
    select 1 from public.content_items where id = p_content_id and client_id = v_media.client_id and deleted_at is null
  ) then
    raise exception 'Content of another client' using errcode = '22023';
  end if;
  update public.social_media_items set content_id = p_content_id where id = p_media_id;
end;
$$;

grant execute on function public.get_instagram_summary(uuid, integer) to authenticated;
grant execute on function public.get_top_media(uuid, integer, integer, text) to authenticated;
grant execute on function public.get_client_results(uuid, date) to authenticated;
grant execute on function public.get_client_forecast(uuid) to authenticated;
grant execute on function public.link_media_to_content(uuid, uuid) to authenticated;
revoke all on function public.get_instagram_summary(uuid, integer) from anon;
revoke all on function public.get_top_media(uuid, integer, integer, text) from anon;
revoke all on function public.get_client_results(uuid, date) from anon;
revoke all on function public.get_client_forecast(uuid) from anon;
revoke all on function public.link_media_to_content(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- Daily sync and lead retries (Edge Function meta-sync; configured through Vault like push-dispatch)
-- ---------------------------------------------------------------------------
create or replace function private.request_meta_sync(p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sunmedia_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sunmedia_meta_sync_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- Nothing connected yet: no call.
  if p_mode = 'daily' and not exists (select 1 from public.meta_assets where asset_type = 'instagram' and status <> 'disconnected') then
    return;
  end if;
  if p_mode = 'leads' and not exists (select 1 from public.leads where fetch_status = 'pending') then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/meta-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('mode', p_mode),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'meta sync request failed: %', sqlerrm;
end;
$$;

-- 03:00 Tashkent: yesterday's insights for every connected account. Every 15 minutes: unfinished leads.
select cron.schedule('sunmedia-meta-sync-daily', '0 22 * * *', $$select private.request_meta_sync('daily')$$);
select cron.schedule('sunmedia-meta-sync-leads', '*/15 * * * *', $$select private.request_meta_sync('leads')$$);

-- ---------------------------------------------------------------------------
-- Realtime and RLS
-- ---------------------------------------------------------------------------
create trigger rt_social_daily_snapshots after insert or update on public.social_daily_snapshots
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_social_media_items after insert or update on public.social_media_items
  for each row execute function private.broadcast_change('staff', 'client');

alter table public.social_daily_snapshots enable row level security;
alter table public.social_media_items enable row level security;
revoke insert, update, delete on public.social_daily_snapshots, public.social_media_items from anon, authenticated;

create policy "read daily snapshots" on public.social_daily_snapshots
  for select to authenticated using (private.can_see_results(client_id));
create policy "read instagram media" on public.social_media_items
  for select to authenticated using (private.can_see_results(client_id));
