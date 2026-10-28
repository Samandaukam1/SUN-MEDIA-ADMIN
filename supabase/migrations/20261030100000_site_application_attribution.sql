-- SUN MEDIA — where a site application came from (the /ariza page for Instagram and Meta ads).
--
-- The same "Ariza qoldirish" form and the same inbox (site_applications, Sayt → Arizalar, the panel's "Saytdan yangi
-- arizalar"); only the real tracking values of the ad link are kept with the application:
--   * site_applications.attribution: {channel, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
--     page} — only the keys that were present, cleaned by the server; '{}' for every older application and for the
--     site's own form. Never personal data.
--   * site_apply(..., p_attribution default '{}'): the old eleven-argument call keeps working unchanged.

alter table public.site_applications
  add column attribution jsonb not null default '{}'::jsonb
  constraint site_applications_attribution_check check (jsonb_typeof(attribution) = 'object' and octet_length(attribution::text) <= 4000);

drop function public.site_apply(text, text, text, text, text, text, numeric, text, text, text, text);

create function public.site_apply(
  p_first_name text,
  p_last_name text,
  p_brand text,
  p_phone text,
  p_instagram text,
  p_telegram text,
  p_budget_amount numeric,
  p_budget_label text,
  p_source_path text,
  p_fingerprint text,
  p_user_agent text,
  p_attribution jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_ig text := nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), '');
  v_tg text := nullif(regexp_replace(btrim(coalesce(p_telegram, '')), '^@', ''), '');
  v_attr jsonb := '{}'::jsonb;
  v_key text;
  v_channel text;
begin
  if p_fingerprint is null or char_length(p_fingerprint) not between 16 and 128 then
    raise exception 'Invalid fingerprint' using errcode = '22023';
  end if;
  if char_length(v_first) not between 2 and 60 or char_length(v_last) not between 2 and 60 or char_length(v_brand) not between 1 and 120
     or v_phone !~ '^\+[0-9]{9,15}$' or (v_ig is null and v_tg is null) or coalesce(p_budget_amount, 0) <= 0 then
    raise exception 'APPLICATION_INVALID' using errcode = '22023';
  end if;
  -- Only the known tracking keys, as short plain strings (the server already cleaned them; this is the last word).
  if jsonb_typeof(p_attribution) = 'object' then
    foreach v_key in array array['channel', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'page'] loop
      if jsonb_typeof(p_attribution -> v_key) = 'string' and btrim(p_attribution ->> v_key) <> '' then
        v_attr := v_attr || jsonb_build_object(v_key, left(regexp_replace(btrim(p_attribution ->> v_key), '[[:cntrl:]]', '', 'g'), case when v_key = 'fbclid' then 512 else 200 end));
      end if;
    end loop;
  end if;
  v_channel := v_attr ->> 'channel';
  perform pg_advisory_xact_lock(hashtextextended('site_application:' || p_fingerprint, 0));
  if (select count(*) from public.site_applications a where a.fingerprint = p_fingerprint and a.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.site_applications a where a.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'SITE_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.site_applications (full_name, first_name, last_name, phone, company, instagram, telegram, budget_amount, budget_label,
                                        link_url, service, message, source_path, fingerprint, user_agent, attribution)
  values (v_first || ' ' || v_last, v_first, v_last, v_phone, v_brand, left(v_ig, 60), left(v_tg, 60), p_budget_amount,
          nullif(left(btrim(coalesce(p_budget_label, '')), 120), ''),
          case when v_ig is not null then 'https://instagram.com/' || v_ig when v_tg is not null then 'https://t.me/' || v_tg end,
          '', '', coalesce(nullif(p_source_path, ''), '/'), p_fingerprint, left(coalesce(p_user_agent, ''), 300), v_attr)
  returning id into v_id;

  perform private.notify(
    private.users_with_permission('site.manage') || private.leadership_ids(),
    'site.application',
    'Saytdan yangi ariza: ' || v_brand,
    v_first || ' ' || v_last || ' · ' || v_phone || ' · byudjet: '
      || coalesce(nullif(btrim(coalesce(p_budget_label, '')), ''), to_char(p_budget_amount, 'FM999G999G999G999') || ' so‘m')
      || coalesce(' · ' || v_channel, ''),
    jsonb_build_object('application_id', v_id, 'href', '/panel#arizalar'),
    'site_applications', v_id, null, 'high'
  );
  return v_id;
end;
$$;
revoke all on function public.site_apply(text, text, text, text, text, text, numeric, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.site_apply(text, text, text, text, text, text, numeric, text, text, text, text, jsonb) to service_role;
