-- SUN MEDIA — social analytics (manual or API sourced, never fabricated) and monthly client reports.

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  platform public.social_platform not null,
  handle text not null check (char_length(handle) between 1 and 120),
  url text,
  external_id text,
  connection public.social_connection not null default 'manual',
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (client_id, platform, handle),
  unique (id, client_id)
);

create trigger social_accounts_updated_at
  before update on public.social_accounts
  for each row execute function private.set_updated_at();

alter table public.content_publications
  add constraint content_publications_social_account_fk
  foreign key (social_account_id) references public.social_accounts (id) on delete set null;

-- OAuth tokens for connected analytics sources. Only the service role (Edge Functions) reads this.
create table private.social_account_credentials (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  vault_secret_id uuid not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
revoke all on private.social_account_credentials from public, authenticated;

-- Account-level metrics for a period (normally one calendar month). NULL = not provided, never 0-by-default.
create table public.social_metrics (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null,
  client_id uuid not null,
  period_start date not null,
  period_end date not null,
  followers_start integer check (followers_start >= 0),
  followers_end integer check (followers_end >= 0),
  reach bigint check (reach >= 0),
  views bigint check (views >= 0),
  profile_visits bigint check (profile_visits >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  source public.metric_source not null,
  entered_by uuid references public.profiles (id) on delete set null,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, period_start, period_end),
  foreign key (social_account_id, client_id) references public.social_accounts (id, client_id) on delete cascade,
  check (period_end >= period_start)
);

create index social_metrics_client_period_idx on public.social_metrics (client_id, period_start);

create trigger social_metrics_updated_at
  before update on public.social_metrics
  for each row execute function private.set_updated_at();

-- Latest performance snapshot of a single publication.
create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.content_publications (id) on delete cascade,
  content_id uuid not null,
  client_id uuid not null,
  views bigint check (views >= 0),
  reach bigint check (reach >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  captured_at timestamptz not null default now(),
  source public.metric_source not null,
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade
);

create index content_metrics_client_idx on public.content_metrics (client_id);

create trigger content_metrics_updated_at
  before update on public.content_metrics
  for each row execute function private.set_updated_at();

create or replace function private.publication_refs(p_publication uuid)
returns table (content_id uuid, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.content_id, p.client_id from public.content_publications p where p.id = p_publication;
$$;

grant execute on function private.publication_refs(uuid) to authenticated;

create or replace function private.metrics_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_privileged_context() then
    new.source := 'manual';
    new.entered_by := auth.uid();
  end if;
  if tg_table_name = 'content_metrics' then
    select r.content_id, r.client_id into new.content_id, new.client_id
    from private.publication_refs(new.publication_id) r;
  end if;
  return new;
end;
$$;

create trigger social_metrics_10_before_write
  before insert or update on public.social_metrics
  for each row execute function private.metrics_before_write();
create trigger content_metrics_10_before_write
  before insert or update on public.content_metrics
  for each row execute function private.metrics_before_write();

-- ---------------------------------------------------------------------------
-- Monthly reports
-- ---------------------------------------------------------------------------
create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  status public.report_status not null default 'draft',
  title text not null,
  -- Achievements written by the account manager
  highlights text check (char_length(highlights) <= 5000),
  generated_at timestamptz,
  generated_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  pdf_path text,
  pdf_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period_month)
);

create trigger monthly_reports_updated_at
  before update on public.monthly_reports
  for each row execute function private.set_updated_at();

create table public.monthly_report_metrics (
  report_id uuid not null references public.monthly_reports (id) on delete cascade,
  metric_key text not null,
  section text not null check (section in ('delivery', 'social', 'production', 'approvals', 'calendar', 'internal')),
  label text not null,
  value numeric,
  previous_value numeric,
  target_value numeric,
  unit text,
  visibility public.visibility_level not null default 'client',
  position integer not null default 0,
  primary key (report_id, metric_key)
);

create table public.monthly_report_top_contents (
  report_id uuid not null references public.monthly_reports (id) on delete cascade,
  rank smallint not null check (rank between 1 and 10),
  content_id uuid references public.content_items (id) on delete set null,
  publication_id uuid references public.content_publications (id) on delete set null,
  title text not null,
  content_type public.content_type,
  platform public.social_platform,
  post_url text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  primary key (report_id, rank)
);

create or replace function private.put_report_metric(
  p_report uuid, p_key text, p_section text, p_label text, p_value numeric,
  p_previous numeric default null, p_target numeric default null, p_unit text default null,
  p_visibility public.visibility_level default 'client', p_position integer default 0
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.monthly_report_metrics
    (report_id, metric_key, section, label, value, previous_value, target_value, unit, visibility, position)
  values (p_report, p_key, p_section, p_label, p_value, p_previous, p_target, p_unit, p_visibility, p_position);
$$;

-- Aggregated social metrics of a client for one month; NULL when nothing was entered or synced.
create or replace function private.client_social_month(p_client uuid, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'followers_start', sum(followers_start),
    'followers_end', sum(followers_end),
    'reach', sum(reach),
    'views', sum(views),
    'profile_visits', sum(profile_visits),
    'likes', sum(likes),
    'comments', sum(comments),
    'shares', sum(shares),
    'saves', sum(saves),
    'engagement_rate', case when sum(reach) > 0 then
      round(100.0 * (coalesce(sum(likes), 0) + coalesce(sum(comments), 0) + coalesce(sum(shares), 0) + coalesce(sum(saves), 0)) / sum(reach), 2)
    end
  ) end
  from public.social_metrics m
  join public.social_accounts a on a.id = m.social_account_id and a.deleted_at is null
  where m.client_id = p_client
    and m.period_start >= p_month
    and m.period_end < (p_month + interval '1 month')::date;
$$;

create or replace function public.generate_monthly_report(p_client_id uuid, p_month date)
returns public.monthly_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_next date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_tz text := private.agency_timezone();
  v_from timestamptz;
  v_to timestamptz;
  v_report public.monthly_reports;
  v_client public.clients;
  v_sub uuid;
  v_service record;
  v_pos integer := 0;
  v_social jsonb;
  v_prev_social jsonb;
  v_key text;
  v_labels jsonb := jsonb_build_object(
    'followers_growth', 'Obunachilar o''sishi', 'followers_end', 'Obunachilar (oy oxiri)',
    'reach', 'Qamrov (reach)', 'views', 'Ko''rishlar', 'profile_visits', 'Profilga tashriflar',
    'likes', 'Layklar', 'comments', 'Izohlar', 'shares', 'Ulashishlar', 'saves', 'Saqlashlar',
    'engagement_rate', 'Engagement'
  );
  v_planned integer;
  v_on_time integer;
  v_completed integer;
begin
  if not private.can_manage_client(p_client_id, 'reports.manage') then
    raise exception 'Not allowed to generate reports for this client' using errcode = '42501';
  end if;
  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;
  if v_month > date_trunc('month', private.agency_today())::date then
    raise exception 'Cannot report on a future month' using errcode = '22023';
  end if;

  v_from := v_month::timestamp at time zone v_tz;
  v_to := v_next::timestamp at time zone v_tz;

  insert into public.monthly_reports (client_id, period_month, title)
  values (
    p_client_id, v_month,
    'SUN MEDIA × ' || v_client.name || ' — ' || to_char(v_month, 'FMMonth YYYY') || ' Performance Report'
  )
  on conflict (client_id, period_month) do update set title = excluded.title
  returning * into v_report;

  if v_report.status = 'published' then
    raise exception 'Report is already published; archive it before regenerating' using errcode = '22023';
  end if;

  delete from public.monthly_report_metrics where report_id = v_report.id;
  delete from public.monthly_report_top_contents where report_id = v_report.id;

  -- Delivery: plan vs actual per service
  v_sub := private.subscription_for_date(p_client_id, v_month);
  if v_sub is null then
    v_sub := (select id from public.client_subscriptions
              where client_id = p_client_id and status <> 'cancelled'
                and daterange(starts_on, ends_on, '[]') && daterange(v_month, v_next, '[)')
              order by starts_on desc limit 1);
  end if;

  for v_service in
    select st.key, st.name, st.unit, st.position, q.quantity as planned,
           coalesce((select sum(u.quantity) from public.client_plan_usage u
                     where u.client_id = p_client_id and u.service_key = st.key
                       and u.occurred_on >= v_month and u.occurred_on < v_next), 0) as delivered
    from public.service_types st
    left join public.subscription_quotas q on q.subscription_id = v_sub and q.service_key = st.key
    where st.is_quantitative
    order by st.position
  loop
    if v_service.planned is not null or v_service.delivered <> 0 then
      perform private.put_report_metric(
        v_report.id, 'delivery.' || v_service.key, 'delivery', v_service.name,
        v_service.delivered, null, v_service.planned, v_service.unit, 'client', v_service.position
      );
    end if;
  end loop;

  perform private.put_report_metric(v_report.id, 'delivery.videos_edited', 'delivery', 'Montaj qilingan videolar',
    (select count(distinct cv.content_id) from public.content_versions cv
     where cv.client_id = p_client_id and cv.status = 'approved' and cv.decided_at >= v_from and cv.decided_at < v_to),
    null, null, 'dona', 'client', 200);
  perform private.put_report_metric(v_report.id, 'delivery.captions', 'delivery', 'Captionlar',
    (select count(*) from public.content_items c
     where c.client_id = p_client_id and c.status = 'published' and c.deleted_at is null
       and coalesce(trim(c.caption), '') <> '' and c.published_at >= v_from and c.published_at < v_to),
    null, null, 'dona', 'client', 210);
  perform private.put_report_metric(v_report.id, 'delivery.campaigns', 'delivery', 'Kampaniyalar',
    (select count(*) from public.projects p
     where p.client_id = p_client_id and p.kind = 'campaign' and p.deleted_at is null and p.status <> 'cancelled'
       and daterange(coalesce(p.starts_on, v_month), coalesce(p.ends_on, v_next), '[]') && daterange(v_month, v_next, '[)')),
    null, null, 'dona', 'client', 220);

  -- Social performance (only when data exists)
  v_social := private.client_social_month(p_client_id, v_month);
  v_prev_social := private.client_social_month(p_client_id, (v_month - interval '1 month')::date);
  if v_social is not null then
    v_pos := 300;
    perform private.put_report_metric(v_report.id, 'social.followers_start', 'social', 'Obunachilar (oy boshi)',
      (v_social ->> 'followers_start')::numeric, null, null, null, 'client', v_pos);
    perform private.put_report_metric(v_report.id, 'social.followers_end', 'social', v_labels ->> 'followers_end',
      (v_social ->> 'followers_end')::numeric, (v_prev_social ->> 'followers_end')::numeric, null, null, 'client', v_pos + 1);
    perform private.put_report_metric(v_report.id, 'social.followers_growth', 'social', v_labels ->> 'followers_growth',
      (v_social ->> 'followers_end')::numeric - (v_social ->> 'followers_start')::numeric,
      (v_prev_social ->> 'followers_end')::numeric - (v_prev_social ->> 'followers_start')::numeric,
      null, null, 'client', v_pos + 2);
    foreach v_key in array array['reach', 'views', 'profile_visits', 'likes', 'comments', 'shares', 'saves', 'engagement_rate'] loop
      v_pos := v_pos + 10;
      if v_social ->> v_key is not null then
        perform private.put_report_metric(v_report.id, 'social.' || v_key, 'social', v_labels ->> v_key,
          (v_social ->> v_key)::numeric, (v_prev_social ->> v_key)::numeric, null,
          case when v_key = 'engagement_rate' then '%' end, 'client', v_pos);
      end if;
    end loop;
  end if;

  -- Top content by views (publications published this month with captured metrics)
  insert into public.monthly_report_top_contents
    (report_id, rank, content_id, publication_id, title, content_type, platform, post_url, views, likes, comments, shares, saves)
  select v_report.id, row_number() over (order by m.views desc nulls last, m.likes desc nulls last)::smallint,
         c.id, p.id, c.title, c.content_type, p.platform, p.post_url, m.views, m.likes, m.comments, m.shares, m.saves
  from public.content_metrics m
  join public.content_publications p on p.id = m.publication_id
  join public.content_items c on c.id = m.content_id
  where m.client_id = p_client_id and p.published_at >= v_from and p.published_at < v_to
    and m.views is not null and c.deleted_at is null
  order by m.views desc nulls last, m.likes desc nulls last
  limit 5;

  -- Production
  perform private.put_report_metric(v_report.id, 'production.shooting_days', 'production', 'Syomka kunlari',
    (select count(distinct (s.starts_at at time zone v_tz)::date) from public.shootings s
     where s.client_id = p_client_id and s.status = 'completed' and s.deleted_at is null
       and s.starts_at >= v_from and s.starts_at < v_to),
    null, null, 'kun', 'client', 400);
  perform private.put_report_metric(v_report.id, 'production.shooting_hours', 'production', 'Syomka soatlari',
    (select round(coalesce(sum(extract(epoch from (
        coalesce(s.actual_ended_at, s.ends_at) - coalesce(s.actual_started_at, s.starts_at)))) / 3600, 0)::numeric, 1)
     from public.shootings s
     where s.client_id = p_client_id and s.status = 'completed' and s.deleted_at is null
       and s.starts_at >= v_from and s.starts_at < v_to),
    null, null, 'soat', 'client', 410);
  perform private.put_report_metric(v_report.id, 'production.locations', 'production', 'Lokatsiyalar',
    (select count(distinct lower(trim(s.location_name))) from public.shootings s
     where s.client_id = p_client_id and s.status = 'completed' and s.deleted_at is null
       and coalesce(trim(s.location_name), '') <> ''
       and s.starts_at >= v_from and s.starts_at < v_to),
    null, null, 'ta', 'client', 420);
  perform private.put_report_metric(v_report.id, 'production.raw_gb', 'production', 'Raw material',
    (select round(coalesce(sum(f.size_bytes), 0) / 1073741824.0, 1) from public.files f
     join public.folders fo on fo.id = f.folder_id
     where f.client_id = p_client_id and fo.kind = 'raw' and f.status = 'uploaded' and f.deleted_at is null
       and f.uploaded_at >= v_from and f.uploaded_at < v_to),
    null, null, 'GB', 'client', 430);
  perform private.put_report_metric(v_report.id, 'production.final_videos', 'production', 'Yakuniy video assetlar',
    (select count(*) from public.content_versions cv
     join public.files f on f.id = cv.file_id
     where cv.client_id = p_client_id and cv.status = 'approved' and f.kind = 'video'
       and cv.decided_at >= v_from and cv.decided_at < v_to),
    null, null, 'dona', 'client', 440);
  perform private.put_report_metric(v_report.id, 'production.total_assets', 'production', 'Jami yaratilgan assetlar',
    (select count(*) from public.files f
     left join public.folders fo on fo.id = f.folder_id
     where f.client_id = p_client_id and f.status = 'uploaded' and f.deleted_at is null and f.chat_room_id is null
       and coalesce(fo.kind, 'custom') not in ('raw', 'logos', 'brandbook', 'contracts', 'documents')
       and private.user_is_staff(f.uploaded_by)
       and f.uploaded_at >= v_from and f.uploaded_at < v_to),
    null, null, 'dona', 'client', 450);

  -- Approvals
  perform private.put_report_metric(v_report.id, 'approvals.delivered', 'approvals', 'Tasdiqlashga yuborilgan kontent',
    (select count(distinct cv.content_id) from public.content_versions cv
     where cv.client_id = p_client_id and cv.sent_to_client_at >= v_from and cv.sent_to_client_at < v_to),
    null, null, 'dona', 'client', 500);
  perform private.put_report_metric(v_report.id, 'approvals.first_attempt', 'approvals', 'Birinchi urinishda tasdiqlangan',
    (select count(*) from public.content_items c
     where c.client_id = p_client_id and c.approved_at >= v_from and c.approved_at < v_to and c.deleted_at is null
       and not exists (select 1 from public.revisions r where r.content_id = c.id and r.stage = 'client')),
    null, null, 'dona', 'client', 510);
  perform private.put_report_metric(v_report.id, 'approvals.client_revisions', 'approvals', 'Mijoz revisionlari',
    (select count(*) from public.revisions r
     where r.client_id = p_client_id and r.stage = 'client' and r.requested_at >= v_from and r.requested_at < v_to),
    null, null, 'ta', 'client', 520);
  perform private.put_report_metric(v_report.id, 'approvals.avg_approval_minutes', 'approvals', 'O''rtacha tasdiqlash vaqti',
    (select round(avg(extract(epoch from (a.decided_at - cv.sent_to_client_at)) / 60)::numeric, 0)
     from public.client_approvals a
     join public.content_versions cv on cv.id = a.version_id
     where a.client_id = p_client_id and a.stage = 'client' and a.decision = 'approved'
       and cv.sent_to_client_at is not null and a.decided_at >= v_from and a.decided_at < v_to),
    null, null, 'daqiqa', 'client', 530);
  perform private.put_report_metric(v_report.id, 'internal.internal_revisions', 'internal', 'Ichki revisionlar',
    (select count(*) from public.revisions r
     where r.client_id = p_client_id and r.stage = 'internal' and r.requested_at >= v_from and r.requested_at < v_to),
    null, null, 'ta', 'internal', 900);

  -- Calendar completion
  select count(*),
         count(*) filter (where c.status in ('approved', 'scheduled', 'published')),
         count(*) filter (where
           (c.status = 'published' and c.published_at <= coalesce(
              (select max(p.scheduled_at) from public.content_publications p where p.content_id = c.id), v_to) + interval '1 hour')
           or (c.content_type in ('design', 'ad_creative') and c.status in ('approved', 'scheduled', 'published')
               and c.approved_at < v_to))
  into v_planned, v_completed, v_on_time
  from public.content_items c
  where c.client_id = p_client_id and c.plan_month = v_month and c.counts_toward_plan
    and c.deleted_at is null and c.status <> 'cancelled';

  perform private.put_report_metric(v_report.id, 'calendar.planned', 'calendar', 'Rejadagi kontent',
    v_planned, null, null, 'dona', 'client', 600);
  perform private.put_report_metric(v_report.id, 'calendar.completed', 'calendar', 'Bajarilgan',
    v_completed, null, v_planned, 'dona', 'client', 610);
  perform private.put_report_metric(v_report.id, 'calendar.completion_rate', 'calendar', 'Kontent reja bajarilishi',
    case when v_planned > 0 then round(100.0 * v_on_time / v_planned, 0) end, null, 100, '%', 'client', 620);
  perform private.put_report_metric(v_report.id, 'internal.overdue_tasks', 'internal', 'Muddati o''tgan vazifalar',
    (select count(*) from public.tasks t
     where t.client_id = p_client_id and t.deleted_at is null and t.overdue_at >= v_from and t.overdue_at < v_to),
    null, null, 'ta', 'internal', 910);
  perform private.put_report_metric(v_report.id, 'internal.late_publications', 'internal', 'Kechikkan nashrlar',
    (select count(*) from public.content_publications p
     where p.client_id = p_client_id and p.status = 'published' and p.scheduled_at is not null
       and p.published_at > p.scheduled_at + interval '1 hour'
       and p.published_at >= v_from and p.published_at < v_to),
    null, null, 'ta', 'internal', 920);

  update public.monthly_reports
  set generated_at = now(), generated_by = auth.uid(), pdf_path = null, pdf_generated_at = null
  where id = v_report.id
  returning * into v_report;
  return v_report;
end;
$$;

create or replace function public.publish_monthly_report(p_report_id uuid)
returns public.monthly_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.monthly_reports;
begin
  select * into v_report from public.monthly_reports where id = p_report_id for update;
  if not found or not private.can_manage_client(v_report.client_id, 'reports.manage') then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_report.generated_at is null then
    raise exception 'Generate the report before publishing' using errcode = '22023';
  end if;
  update public.monthly_reports
  set status = 'published', published_at = now(), published_by = auth.uid()
  where id = p_report_id
  returning * into v_report;
  return v_report;
end;
$$;

create or replace function public.archive_monthly_report(p_report_id uuid)
returns public.monthly_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.monthly_reports;
begin
  select * into v_report from public.monthly_reports where id = p_report_id for update;
  if not found or not private.can_manage_client(v_report.client_id, 'reports.manage') then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  update public.monthly_reports set status = 'draft', published_at = null, published_by = null
  where id = p_report_id
  returning * into v_report;
  return v_report;
end;
$$;

grant execute on function
  public.generate_monthly_report(uuid, date),
  public.publish_monthly_report(uuid),
  public.archive_monthly_report(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_social_accounts after insert or update or delete on public.social_accounts
  for each row execute function private.audit_row();
create trigger audit_social_metrics after insert or update or delete on public.social_metrics
  for each row execute function private.audit_row();
create trigger audit_monthly_reports after insert or update or delete on public.monthly_reports
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.social_metrics enable row level security;
alter table public.content_metrics enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.monthly_report_metrics enable row level security;
alter table public.monthly_report_top_contents enable row level security;

create policy "read social accounts" on public.social_accounts
  for select to authenticated using (
    ((select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[]))
    and deleted_at is null
  );
create policy "add social accounts" on public.social_accounts
  for insert to authenticated with check (private.can_manage_client(client_id, 'clients.manage'));
create policy "update social accounts" on public.social_accounts
  for update to authenticated
  using (private.can_manage_client(client_id, 'clients.manage'))
  with check (private.can_manage_client(client_id, 'clients.manage'));

create policy "read social metrics" on public.social_metrics
  for select to authenticated using (
    (select private.sees_all_clients()) or client_id = any ((select private.accessible_client_ids())::uuid[])
  );
create policy "enter social metrics" on public.social_metrics
  for insert to authenticated with check (private.can_manage_client(client_id, 'analytics.manage'));
create policy "correct social metrics" on public.social_metrics
  for update to authenticated
  using (private.can_manage_client(client_id, 'analytics.manage'))
  with check (private.can_manage_client(client_id, 'analytics.manage'));
create policy "delete social metrics" on public.social_metrics
  for delete to authenticated using (private.can_manage_client(client_id, 'analytics.manage'));

create policy "read content metrics" on public.content_metrics
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
  );
create policy "enter content metrics" on public.content_metrics
  for insert to authenticated with check (exists (
    select 1 from public.content_publications p
    where p.id = publication_id and private.can_manage_client(p.client_id, 'analytics.manage')
  ));
create policy "correct content metrics" on public.content_metrics
  for update to authenticated
  using (private.can_manage_client(client_id, 'analytics.manage'))
  with check (private.can_manage_client(client_id, 'analytics.manage'));

create policy "read reports" on public.monthly_reports
  for select to authenticated using (
    private.can_manage_client(client_id, 'reports.manage')
    or private.can_manage_client(client_id, 'reports.read')
    or (status = 'published' and private.has_client_permission(client_id, 'client.reports.view'))
  );
create policy "edit report text" on public.monthly_reports
  for update to authenticated
  using (private.can_manage_client(client_id, 'reports.manage'))
  with check (private.can_manage_client(client_id, 'reports.manage'));
revoke insert, delete, update on public.monthly_reports from authenticated;
grant update (title, highlights, pdf_path, pdf_generated_at) on public.monthly_reports to authenticated;

create policy "read report metrics" on public.monthly_report_metrics
  for select to authenticated using (
    exists (select 1 from public.monthly_reports r where r.id = report_id)
    and (visibility = 'client' or (select private.is_staff()))
  );
revoke insert, update, delete on public.monthly_report_metrics from authenticated;

create policy "read top contents" on public.monthly_report_top_contents
  for select to authenticated using (exists (select 1 from public.monthly_reports r where r.id = report_id));
revoke insert, update, delete on public.monthly_report_top_contents from authenticated;

-- Report PDFs: {client_id}/{report_id}.pdf
create policy "sunmedia read report pdfs" on storage.objects
  for select to authenticated using (
    bucket_id = 'reports'
    and exists (select 1 from public.monthly_reports r where r.pdf_path = storage.objects.name)
  );
create policy "sunmedia write report pdfs" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.can_manage_client(((storage.foldername(name))[1])::uuid, 'reports.manage')
  );
create policy "sunmedia replace report pdfs" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.can_manage_client(((storage.foldername(name))[1])::uuid, 'reports.manage')
  )
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.can_manage_client(((storage.foldername(name))[1])::uuid, 'reports.manage')
  );
