-- Login cabinets on the website: partners (brands) follow their own results in /kabinet, SUN MEDIA staff open their
-- tasks in /xodim, management keeps the panel. This adds what those cabinets need on top of the existing roles,
-- memberships and monthly reports. Additive: no account, role or password is created or changed here.

-- ---------------------------------------------------------------------------
-- 1. The Rahbar enters partner statistics and publishes reports
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('analytics.manage'), ('reports.manage')) as p(key)
where r.key = 'owner'
on conflict (role_id, permission_key) do nothing;

-- Whoever enters the numbers can also register the brand's social account they belong to.
drop policy "add social accounts" on public.social_accounts;
create policy "add social accounts" on public.social_accounts
  for insert to authenticated with check (
    private.can_manage_client(client_id, 'clients.manage') or private.can_manage_client(client_id, 'analytics.manage')
  );

-- ---------------------------------------------------------------------------
-- 2. Monthly numbers: content output, ads and leads; manual rows can be held back as drafts
-- ---------------------------------------------------------------------------
create type public.metric_status as enum ('draft', 'published');

alter table public.social_metrics
  add column status public.metric_status not null default 'published',
  add column reels_count integer check (reels_count >= 0),
  add column posts_count integer check (posts_count >= 0),
  add column stories_count integer check (stories_count >= 0),
  add column ad_spend numeric(14, 2) check (ad_spend >= 0),
  add column ad_currency text not null default 'UZS' check (ad_currency in ('UZS', 'USD')),
  add column leads integer check (leads >= 0),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id) on delete set null;

-- Rows entered so far were already visible to the partner: they stay published (their edit time is kept).
alter table public.social_metrics disable trigger user;
update public.social_metrics set published_at = coalesce(updated_at, created_at) where published_at is null;
alter table public.social_metrics enable trigger user;

create index social_metrics_client_status_period_idx on public.social_metrics (client_id, status, period_start);

-- Synced (API) numbers are live data, never a draft; publishing stamps who and when.
create or replace function private.social_metrics_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'api' then
    new.status := 'published';
  end if;
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
      new.published_by := auth.uid();
    end if;
  else
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end;
$$;

create trigger social_metrics_20_status
  before insert or update on public.social_metrics
  for each row execute function private.social_metrics_status();

-- One set of numbers per account and day: a period that overlaps another one would be counted twice.
create or replace function private.social_metrics_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.social_metrics m
    where m.social_account_id = new.social_account_id
      and m.id <> new.id
      and not (m.period_start = new.period_start and m.period_end = new.period_end)
      and daterange(m.period_start, m.period_end, '[]') && daterange(new.period_start, new.period_end, '[]')
  ) then
    raise exception 'This period overlaps numbers already entered for this account' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.social_metrics_no_overlap() from public, anon, authenticated;

create trigger social_metrics_30_no_overlap
  before insert or update of social_account_id, period_start, period_end on public.social_metrics
  for each row execute function private.social_metrics_no_overlap();

-- Partners read published numbers only; staff keep seeing drafts.
drop policy "read social metrics" on public.social_metrics;
create policy "read social metrics" on public.social_metrics
  for select to authenticated using (
    (select private.sees_all_clients())
    or (
      client_id = any ((select private.accessible_client_ids())::uuid[])
      and (status = 'published' or (select private.is_staff()))
    )
  );

-- Monthly reports are built from published numbers only (a draft never reaches a partner through a report).
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
    and m.status = 'published'
    and m.period_start >= p_month
    and m.period_end < (p_month + interval '1 month')::date;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reports: work done, work planned and attached files
-- ---------------------------------------------------------------------------
alter table public.monthly_reports
  add column work_done text check (char_length(work_done) <= 5000),
  add column work_planned text check (char_length(work_planned) <= 5000);
grant update (work_done, work_planned) on public.monthly_reports to authenticated;

create table public.monthly_report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.monthly_reports (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes > 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path like client_id::text || '/' || report_id::text || '/files/%')
);
create index monthly_report_files_report_idx on public.monthly_report_files (report_id, created_at);

alter table public.monthly_report_files enable row level security;
-- Same visibility as the report itself: staff with reports access, the partner once it is published.
create policy "read report files" on public.monthly_report_files
  for select to authenticated using (exists (select 1 from public.monthly_reports r where r.id = report_id));
revoke all on public.monthly_report_files from anon, authenticated;
grant select on public.monthly_report_files to authenticated;

create trigger audit_monthly_report_files after insert or update or delete on public.monthly_report_files
  for each row execute function private.audit_row();

-- Files go to the private "reports" bucket under <client>/<report>/files/; the row is added once the upload landed.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv'
]
where id = 'reports';

create or replace function public.add_report_file(p_report_id uuid, p_storage_path text, p_name text)
returns public.monthly_report_files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.monthly_reports;
  v_object storage.objects;
  v_file public.monthly_report_files;
begin
  select * into v_report from public.monthly_reports where id = p_report_id;
  if not found or not private.can_manage_client(v_report.client_id, 'reports.manage') then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if p_storage_path is null or p_storage_path not like v_report.client_id::text || '/' || v_report.id::text || '/files/%' then
    raise exception 'Wrong file location' using errcode = '22023';
  end if;
  if coalesce(char_length(trim(p_name)), 0) not between 1 and 200 then
    raise exception 'File name must be 1–200 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.monthly_report_files f where f.report_id = p_report_id) >= 20 then
    raise exception 'A report holds up to 20 files' using errcode = '22023';
  end if;
  select * into v_object from storage.objects o where o.bucket_id = 'reports' and o.name = p_storage_path;
  if not found then
    raise exception 'Upload has not reached storage yet' using errcode = 'P0002';
  end if;
  insert into public.monthly_report_files (report_id, client_id, name, storage_path, mime_type, size_bytes, uploaded_by)
  values (p_report_id, v_report.client_id, trim(p_name), p_storage_path,
          v_object.metadata ->> 'mimetype', nullif((v_object.metadata ->> 'size')::bigint, 0), auth.uid())
  returning * into v_file;
  return v_file;
end;
$$;

-- Removes the row and returns the storage path; the caller deletes the object with its own session.
create or replace function public.remove_report_file(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.monthly_report_files;
begin
  select * into v_file from public.monthly_report_files where id = p_file_id;
  if not found or not private.can_manage_client(v_file.client_id, 'reports.manage') then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  delete from public.monthly_report_files where id = p_file_id;
  return v_file.storage_path;
end;
$$;

revoke all on function public.add_report_file(uuid, text, text), public.remove_report_file(uuid) from public, anon;
grant execute on function public.add_report_file(uuid, text, text), public.remove_report_file(uuid) to authenticated;

create policy "read report attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'reports'
    and exists (select 1 from public.monthly_report_files f where f.storage_path = storage.objects.name)
  );
create policy "delete report attachments" on storage.objects
  for delete to authenticated using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] = 'files'
    and private.can_manage_client(((storage.foldername(name))[1])::uuid, 'reports.manage')
  );

-- ---------------------------------------------------------------------------
-- 4. The partner cabinet: one brand, published numbers and reports only
-- ---------------------------------------------------------------------------
create or replace function public.get_partner_cabinet(p_client uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date := date_trunc('month', p_from)::date;
  v_to date := date_trunc('month', p_to)::date;
  v_end date;
  v_reports boolean;
  v_client jsonb;
begin
  -- The caller's own membership (or SUN MEDIA staff access) decides; the id in the request grants nothing.
  if p_client is null or not private.can_see_results(p_client) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_from is null or v_to is null or v_to < v_from or v_to > (v_from + interval '36 months')::date then
    raise exception 'Invalid period' using errcode = '22023';
  end if;
  v_end := (v_to + interval '1 month')::date;
  v_reports := private.has_client_permission(p_client, 'client.reports.view')
    or private.can_manage_client(p_client, 'reports.read')
    or private.can_manage_client(p_client, 'reports.manage');

  select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code,
           'logo_url', c.logo_url, 'logo_dark_url', coalesce(c.home_logo_dark_url, c.home_logo_url))
  into v_client
  from public.clients c where c.id = p_client and c.deleted_at is null;
  if v_client is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'client', v_client,
    'from', v_from,
    'to', v_to,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'platform', a.platform, 'handle', a.handle, 'url', a.url,
               'connection', a.connection, 'last_synced_at', a.last_synced_at) order by a.platform, a.handle)
      from public.social_accounts a where a.client_id = p_client and a.deleted_at is null), '[]'),
    'metrics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_id', m.social_account_id, 'period_start', m.period_start, 'period_end', m.period_end,
               'followers_start', m.followers_start, 'followers_end', m.followers_end, 'reach', m.reach, 'views', m.views,
               'profile_visits', m.profile_visits, 'likes', m.likes, 'comments', m.comments, 'shares', m.shares,
               'saves', m.saves, 'reels_count', m.reels_count, 'posts_count', m.posts_count,
               'stories_count', m.stories_count, 'ad_spend', m.ad_spend, 'ad_currency', m.ad_currency, 'leads', m.leads,
               'source', m.source, 'synced_at', m.synced_at, 'updated_at', m.updated_at)
             order by m.period_start, m.social_account_id)
      from public.social_metrics m
      join public.social_accounts a on a.id = m.social_account_id and a.deleted_at is null
      where m.client_id = p_client and m.status = 'published'
        and m.period_start >= v_from and m.period_start < v_end), '[]'),
    'reports', case when v_reports then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'period_month', r.period_month, 'title', r.title, 'highlights', r.highlights,
               'work_done', r.work_done, 'work_planned', r.work_planned, 'published_at', r.published_at,
               'has_pdf', r.pdf_path is not null,
               'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mime_type', f.mime_type,
                          'size_bytes', f.size_bytes) order by f.created_at)
                        from public.monthly_report_files f where f.report_id = r.id), '[]'),
               'delivery', coalesce((select jsonb_agg(jsonb_build_object('label', x.label, 'value', x.value,
                          'target', x.target_value, 'unit', x.unit) order by x.position, x.metric_key)
                        from public.monthly_report_metrics x
                        where x.report_id = r.id and x.visibility = 'client' and x.section in ('delivery', 'production')
                          and (x.value is not null and (x.value <> 0 or x.target_value is not null))), '[]'))
             order by r.period_month desc)
      from public.monthly_reports r
      where r.client_id = p_client and r.status = 'published'
        and r.period_month >= v_from and r.period_month < v_end), '[]') else '[]'::jsonb end,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'status', p.status,
               'starts_on', p.starts_on, 'ends_on', p.ends_on,
               'tasks_total', (select count(*) from public.tasks t where t.project_id = p.id and t.deleted_at is null and t.status <> 'cancelled'),
               'tasks_done', (select count(*) from public.tasks t where t.project_id = p.id and t.deleted_at is null and t.status = 'done'))
             order by (p.status = 'active') desc, p.starts_on desc nulls last, p.created_at desc)
      from public.projects p
      where p.client_id = p_client and p.deleted_at is null and p.status <> 'cancelled'
        and (p.status in ('planning', 'active', 'on_hold')
             or daterange(coalesce(p.starts_on, v_from), coalesce(p.ends_on, v_end), '[]') && daterange(v_from, v_end, '[)'))), '[]'),
    'updated_at', greatest(
      (select max(m.updated_at) from public.social_metrics m where m.client_id = p_client and m.status = 'published'),
      case when v_reports then (select max(r.published_at) from public.monthly_reports r where r.client_id = p_client and r.status = 'published') end
    )
  );
end;
$$;

revoke all on function public.get_partner_cabinet(uuid, date, date) from public, anon;
grant execute on function public.get_partner_cabinet(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Password attempts on the website login (the server calls these with its service key)
-- ---------------------------------------------------------------------------
create table private.login_attempts (
  id bigint generated always as identity primary key,
  visitor text not null check (char_length(visitor) between 16 and 128),
  account text not null check (char_length(account) between 16 and 128),
  -- NULL while the password is being checked, so parallel guesses count against the limit too.
  success boolean,
  created_at timestamptz not null default now()
);
create index login_attempts_account_idx on private.login_attempts (account, created_at desc);
create index login_attempts_visitor_idx on private.login_attempts (visitor, created_at desc);
revoke all on private.login_attempts from public, anon, authenticated;

-- Limits: 5 wrong passwords for one login from one visitor per 15 minutes, 20 per visitor per 15 minutes,
-- 30 per login per hour from anywhere. A correct password clears that login's counter.
create or replace function public.site_login_begin(p_visitor text, p_account text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_ok timestamptz;
  v_pair integer;
  v_pair_oldest timestamptz;
  v_visitor integer;
  v_visitor_oldest timestamptz;
  v_account integer;
  v_account_oldest timestamptz;
  v_id bigint;
begin
  if p_visitor is null or char_length(p_visitor) not between 16 and 128
     or p_account is null or char_length(p_account) not between 16 and 128 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('site_login:' || p_account, 0));
  perform pg_advisory_xact_lock(hashtextextended('site_login_v:' || p_visitor, 0));
  delete from private.login_attempts where created_at < now() - interval '2 days';
  -- Checks that never finished (server stopped mid-request) count as wrong after a minute.
  update private.login_attempts set success = false where success is null and created_at < now() - interval '1 minute';

  select max(a.created_at) into v_last_ok from private.login_attempts a where a.account = p_account and a.success;

  select count(*), min(x.created_at) into v_pair, v_pair_oldest from (
    select a.created_at from private.login_attempts a
    where a.account = p_account and a.visitor = p_visitor and a.success is not true
      and a.created_at > greatest(now() - interval '15 minutes', coalesce(v_last_ok, '-infinity'::timestamptz))
    order by a.created_at desc limit 5) x;
  if v_pair >= 5 then
    return jsonb_build_object('ok', false, 'retryAfter',
      greatest(1, ceil(extract(epoch from (v_pair_oldest + interval '15 minutes' - now())))::integer));
  end if;

  select count(*), min(x.created_at) into v_visitor, v_visitor_oldest from (
    select a.created_at from private.login_attempts a
    where a.visitor = p_visitor and a.success is not true and a.created_at > now() - interval '15 minutes'
    order by a.created_at desc limit 20) x;
  if v_visitor >= 20 then
    return jsonb_build_object('ok', false, 'retryAfter',
      greatest(1, ceil(extract(epoch from (v_visitor_oldest + interval '15 minutes' - now())))::integer));
  end if;

  select count(*), min(x.created_at) into v_account, v_account_oldest from (
    select a.created_at from private.login_attempts a
    where a.account = p_account and a.success is not true
      and a.created_at > greatest(now() - interval '1 hour', coalesce(v_last_ok, '-infinity'::timestamptz))
    order by a.created_at desc limit 30) x;
  if v_account >= 30 then
    return jsonb_build_object('ok', false, 'retryAfter',
      greatest(1, ceil(extract(epoch from (v_account_oldest + interval '1 hour' - now())))::integer));
  end if;

  insert into private.login_attempts (visitor, account) values (p_visitor, p_account) returning id into v_id;
  return jsonb_build_object('ok', true, 'attempt', v_id, 'remaining', 4 - v_pair);
end;
$$;

create or replace function public.site_login_finish(p_attempt bigint, p_success boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.login_attempts set success = coalesce(p_success, false)
  where id = p_attempt and success is null and created_at > now() - interval '5 minutes';
$$;

revoke all on function public.site_login_begin(text, text), public.site_login_finish(bigint, boolean) from public, anon, authenticated;
grant execute on function public.site_login_begin(text, text), public.site_login_finish(bigint, boolean) to service_role;
