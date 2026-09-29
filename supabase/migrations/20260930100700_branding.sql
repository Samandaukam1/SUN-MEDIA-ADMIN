-- Branding (centre Home logo per client / agency) and tariff prices for the client Home carousel (additive).

alter table public.clients add column if not exists home_logo_url text check (home_logo_url is null or home_logo_url ~ '^https?://');
alter table public.workspaces add column if not exists home_logo_url text check (home_logo_url is null or home_logo_url ~ '^https?://');

-- Public brand images (logos are meant to be seen); only managers of that client / the agency may write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "sunmedia branding write" on storage.objects for insert to authenticated with check (
  bucket_id = 'branding' and (
    ((storage.foldername(name))[1] = 'clients' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
      and private.can_manage_client(((storage.foldername(name))[2])::uuid, 'clients.manage'))
    or ((storage.foldername(name))[1] = 'agency' and (private.has_role('system_owner') or private.has_permission('settings.manage')))
  )
);
create policy "sunmedia branding replace" on storage.objects for update to authenticated using (
  bucket_id = 'branding' and (
    ((storage.foldername(name))[1] = 'clients' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
      and private.can_manage_client(((storage.foldername(name))[2])::uuid, 'clients.manage'))
    or ((storage.foldername(name))[1] = 'agency' and (private.has_role('system_owner') or private.has_permission('settings.manage')))
  )
);

-- "Bosh sahifa logosi": set (or clear) the centre logo of a client, or of the agency when p_client is NULL.
create or replace function public.set_home_logo(p_client uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only files in our own branding bucket, under the matching client / agency folder.
  if p_url is not null and p_url !~ ('^https?://[^/]+/storage/v1/object/public/branding/'
       || case when p_client is null then 'agency' else 'clients/' || p_client::text end || '/[A-Za-z0-9._-]+$') then
    raise exception 'Logo must be uploaded to the branding storage' using errcode = '22023';
  end if;
  perform private.require_agency_feature('branding.custom');
  if p_client is null then
    if not (private.has_role('system_owner') or private.has_permission('settings.manage')) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    update public.workspaces set home_logo_url = p_url where kind = 'agency';
  else
    if not private.can_manage_client(p_client, 'clients.manage') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    update public.clients set home_logo_url = p_url where id = p_client;
  end if;
  perform private.audit_event('branding.home_logo', 'clients', coalesce(p_client::text, 'agency'), p_client, null, jsonb_build_object('url', p_url));
end;
$$;

grant execute on function public.set_home_logo(uuid, text) to authenticated;
revoke all on function public.set_home_logo(uuid, text) from anon;

create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_staff boolean;
  v_system_owner boolean;
  v_clients jsonb;
  v_permissions text[];
  v_temporary boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  -- Disabled and suspended accounts get the same closed door (the app shows the blocked screen).
  if not found or v_profile.status <> 'active' or v_profile.deleted_at is not null then
    return jsonb_build_object('status', 'disabled');
  end if;

  v_staff := private.is_staff();
  v_system_owner := private.has_role('system_owner');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'code', c.code, 'logo_url', c.logo_url,
           'home_logo_url', coalesce(c.home_logo_url, c.logo_url),
           'role', r.key, 'role_name', r.name,
           'permissions', (
             select coalesce(jsonb_agg(k order by k), '[]')
             from (
               select rp.permission_key as k from public.role_permissions rp where rp.role_id = cm.role_id
               union
               select cmp.permission_key from public.client_member_permissions cmp
               where cmp.client_id = cm.client_id and cmp.user_id = cm.user_id
             ) perms where k <> 'client.approve'
           )
         ) order by c.name), '[]')
  into v_clients
  from public.client_members cm
  join public.clients c on c.id = cm.client_id and c.status in ('active', 'paused') and c.deleted_at is null
  join public.roles r on r.id = cm.role_id
  where cm.user_id = v_uid;

  if v_staff then
    select coalesce(array_agg(p.key order by p.key), '{}') into v_permissions
    from public.permissions p
    where p.scope = 'staff' and private.has_permission(p.key);
  else
    v_permissions := '{}';
  end if;

  -- An admin-issued password (new login or reset) that the person has not replaced yet.
  v_temporary := v_profile.provisioned_by is not null
    and exists (select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'email')
    and coalesce(v_profile.password_changed_at, '-infinity'::timestamptz)
        < greatest(coalesce(v_profile.password_reset_at, '-infinity'::timestamptz), v_profile.created_at);

  return jsonb_build_object(
    'status', case
      when v_staff then 'active'
      when jsonb_array_length(v_clients) > 0 then 'active'
      else 'pending'
    end,
    'kind', case when v_staff then 'staff' when jsonb_array_length(v_clients) > 0 then 'client' end,
    'interface', case
      when v_system_owner then null
      when v_staff and private.has_permission('dashboard.view') then 'management'
      when v_staff then 'employee'
      when jsonb_array_length(v_clients) > 0 then 'client'
    end,
    'profile', jsonb_build_object(
      'id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_profile.email,
      'phone', v_profile.phone, 'avatar_url', v_profile.avatar_url, 'locale', v_profile.locale
    ),
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name) order by r.rank), '[]')
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = v_uid
    ),
    'employee', (
      select jsonb_build_object('job_title', e.job_title, 'department', e.department, 'status', e.status)
      from public.employees e where e.user_id = v_uid
    ),
    'permissions', to_jsonb(v_permissions),
    'clients', v_clients,
    'temporary_password', v_temporary,
    -- The centre Home logo: the agency's own (NULL = built-in SUN MEDIA logo) for staff, the company's for clients.
    'branding', jsonb_build_object('home_logo_url', case
      when v_staff then (select w.home_logo_url from public.workspaces w where w.kind = 'agency')
      else v_clients -> 0 ->> 'home_logo_url'
    end)
  );
end;
$$;

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
    return jsonb_build_object('available', false, 'reason', 'not_enough_data', 'days', coalesce(v_days, 0), 'reels', coalesce(v_reels, 0),
      'current_plan', v_plan.name, 'current_price', v_sub.price, 'next_plan', v_next.name, 'next_price', v_next.price, 'currency', v_plan.currency);
  end if;
  if v_extra <= 0 then
    return jsonb_build_object('available', false, 'reason', 'no_extra_content', 'next_plan', v_next.name, 'next_price', v_next.price,
      'current_plan', v_plan.name, 'current_price', v_sub.price, 'currency', v_plan.currency);
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
    'current_price', v_sub.price,
    'next_plan', v_next.name,
    'next_price', v_next.price,
    'currency', v_plan.currency,
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
