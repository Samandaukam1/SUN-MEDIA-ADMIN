-- SUN MEDIA — report metrics in words a client understands. The generator keeps passing its labels;
-- put_report_metric swaps the few technical ones by key, and existing reports are renamed the same way.

create or replace function private.plain_report_label(p_key text, p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_key
    when 'social.reach' then 'Qamrov (necha kishi ko‘rdi)'
    when 'social.engagement_rate' then 'Faollik darajasi'
    when 'delivery.captions' then 'Post matnlari'
    when 'delivery.videos_edited' then 'Montaj qilingan videolar'
    when 'production.raw_gb' then 'Xom material hajmi'
    when 'production.locations' then 'Syomka joylari'
    when 'production.final_videos' then 'Tayyor videolar'
    when 'production.total_assets' then 'Jami tayyorlangan fayllar'
    when 'approvals.client_revisions' then 'Mijoz so‘ragan o‘zgartirishlar'
    when 'approvals.first_attempt' then 'Birinchi ko‘rishda tasdiqlangan'
    when 'internal.internal_revisions' then 'Tekshiruvdagi o‘zgartirishlar'
    when 'internal.late_publications' then 'Kechikkan postlar'
  end, p_label);
$$;

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
  values (p_report, p_key, p_section, private.plain_report_label(p_key, p_label), p_value, p_previous, p_target, p_unit, p_visibility, p_position);
$$;

update public.monthly_report_metrics
set label = private.plain_report_label(metric_key, label)
where label is distinct from private.plain_report_label(metric_key, label);

-- Plan services read by clients.
update public.service_types set name = 'Shaxsiy menejer' where key = 'account_manager' and name = 'Account manager';
