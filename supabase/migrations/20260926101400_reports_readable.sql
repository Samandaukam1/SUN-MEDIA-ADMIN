-- SUN MEDIA — monthly reports, readable.
--   * Titles and notifications use Uzbek month names ("Sentabr 2026"), not English ones.
--   * get_report: one read model for the report screen and its PDF, under the caller's RLS
--     (clients never receive internal metrics).

create or replace function private.month_label_uz(p_month date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'])[extract(month from p_month)::integer]
         || ' ' || extract(year from p_month)::integer;
$$;

grant execute on function private.month_label_uz(date) to authenticated;

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
    'SUN MEDIA × ' || v_client.name || ' — ' || private.month_label_uz(v_month) || ' hisoboti'
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


create or replace function private.notify_report_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    perform private.notify(
      private.client_users_with_permission(new.client_id, 'client.reports.view'),
      'report.published',
      private.month_label_uz(new.period_month) || ' hisobotingiz tayyor',
      new.title,
      jsonb_build_object('route', '/reports/' || new.id),
      'monthly_reports', new.id, new.client_id
    );
  end if;
  return null;
end;
$$;

-- Existing titles written with English month names are rewritten once.
update public.monthly_reports r
set title = 'SUN MEDIA × ' || c.name || ' — ' || private.month_label_uz(r.period_month) || ' hisoboti'
from public.clients c
where c.id = r.client_id and r.title like '% Performance Report';

create or replace function public.get_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_report public.monthly_reports;
begin
  select * into v_report from public.monthly_reports where id = p_report_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_report.id,
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'logo_url', c.logo_url) from public.clients c where c.id = v_report.client_id),
    'period_month', v_report.period_month,
    'month_label', private.month_label_uz(v_report.period_month),
    'status', v_report.status,
    'title', v_report.title,
    'highlights', v_report.highlights,
    'generated_at', v_report.generated_at,
    'published_at', v_report.published_at,
    'pdf_path', v_report.pdf_path,
    'pdf_generated_at', v_report.pdf_generated_at,
    'plan_name', (
      select p.name from public.client_subscriptions s join public.plans p on p.id = s.plan_id
      where s.id = private.subscription_for_date(v_report.client_id, v_report.period_month)
    ),
    'metrics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', m.metric_key, 'section', m.section, 'label', m.label, 'value', m.value,
        'previous', m.previous_value, 'target', m.target_value, 'unit', m.unit, 'internal', m.visibility = 'internal'
      ) order by m.position, m.metric_key)
      from public.monthly_report_metrics m where m.report_id = v_report.id
    ), '[]'::jsonb),
    'top_contents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', t.rank, 'content_id', t.content_id, 'title', t.title, 'content_type', t.content_type, 'platform', t.platform,
        'post_url', t.post_url, 'views', t.views, 'likes', t.likes, 'comments', t.comments, 'shares', t.shares, 'saves', t.saves
      ) order by t.rank)
      from public.monthly_report_top_contents t where t.report_id = v_report.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_report(uuid) from public, anon;
grant execute on function public.get_report(uuid) to authenticated;

-- Report PDFs: managers of the client may always read its report folder (uploading is an
-- INSERT … RETURNING, which must see the new object before pdf_path points to it).
drop policy if exists "sunmedia read report pdfs" on storage.objects;
create policy "sunmedia read report pdfs" on storage.objects
  for select to authenticated using (
    bucket_id = 'reports'
    and (
      exists (select 1 from public.monthly_reports r where r.pdf_path = storage.objects.name)
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        and private.can_manage_client(((storage.foldername(name))[1])::uuid, 'reports.manage')
      )
    )
  );
