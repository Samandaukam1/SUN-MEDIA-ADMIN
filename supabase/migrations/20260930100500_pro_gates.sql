-- SUN MEDIA Pro gates on the features that are Pro in the plan catalogue. Checked in the database, so no app can
-- skip them; the internal SUN MEDIA licence keeps everything open. Additive: function bodies unchanged otherwise.

-- Instagram analytics (agency feature) and the client's history window (client feature).
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
  perform private.require_agency_feature('analytics.instagram');
  if p_days > coalesce(private.feature_limit(private.client_workspace_id(p_client), 'client.analytics.history_days'), 100000) then
    raise exception 'PRO_REQUIRED:client.analytics.history_days' using errcode = 'P0402';
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
  perform private.require_agency_feature('analytics.instagram');
  if p_days > coalesce(private.feature_limit(private.client_workspace_id(p_client), 'client.analytics.history_days'), 100000) then
    raise exception 'PRO_REQUIRED:client.analytics.history_days' using errcode = 'P0402';
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

-- The tariff forecast is a client-side Pro feature.
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
  perform private.require_feature(private.client_workspace_id(p_client), 'client.forecast');

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

-- Meta CRM: connecting pages / forms / ad accounts, delivering leads and CRM reports need crm.meta; connecting
-- Instagram needs analytics.instagram. Service-role paths (webhook, automatic delivery) are never blocked, so no
-- lead is lost if a plan lapses.
create or replace function private.gate_meta_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.status = 'disconnected' then
    return new;
  end if;
  perform private.require_agency_feature(case when new.asset_type = 'instagram' then 'analytics.instagram' else 'crm.meta' end);
  return new;
end;
$$;

create trigger meta_assets_05_plan_gate before insert or update of status on public.meta_assets
  for each row execute function private.gate_meta_assets();

create or replace function private.gate_crm_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform private.require_agency_feature('crm.meta');
  end if;
  return new;
end;
$$;

create trigger lead_deliveries_05_plan_gate before insert on public.lead_deliveries
  for each row execute function private.gate_crm_write();
create trigger crm_reports_05_plan_gate before insert on public.crm_reports
  for each row execute function private.gate_crm_write();
