-- SUN MEDIA — AI content agent: per-client schedule.
--
--   * agent_profiles.carousel_enabled: false = Story only (no carousel is planned for this client).
--   * agent_profiles.story_times: each Story's own time (e.g. {09:00,13:00,19:00}); the number of times is the number of
--     Stories a day. Empty = the previous behaviour (stories_per_day, 3 hours apart from story_time).
--   * agents_plan honours both; carousels already planned for a Story-only client and not yet started are removed.
--   * The four SMM brands (Comfort Camera, SAFI, WeDrink, Kolyaskachi Xojiaka) are Story-only, as their brand bible says.

alter table public.agent_profiles
  add column if not exists carousel_enabled boolean not null default true,
  add column if not exists story_times time[] not null default '{}' check (cardinality(story_times) <= 10);

create or replace function public.agents_plan(p_profile uuid default null, p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.agent_settings;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_count integer := 0;
  v_rows integer;
  p record;
  d date;
  v_at timestamptz;
  v_times time[];
begin
  select * into v_settings from public.agent_settings where id = 1;
  if not coalesce(v_settings.automation_enabled, true) and p_profile is null then
    return 0;
  end if;
  for p in
    select * from public.agent_profiles
    where status = 'active' and not emergency_pause and (p_profile is null or id = p_profile)
  loop
    -- Each Story's own time when set; otherwise stories_per_day, 3 hours apart from story_time.
    if cardinality(p.story_times) > 0 then
      select array_agg(t order by t) into v_times from unnest(p.story_times) t;
    else
      select array_agg(p.story_time + make_interval(hours => 3 * (s - 1))) into v_times from generate_series(1, p.stories_per_day) s;
    end if;
    for i in 0 .. greatest(1, least(p_days, 14)) - 1 loop
      d := v_today + i;
      continue when p.paused_until is not null and d <= p.paused_until;
      continue when not (extract(isodow from d)::integer = any (p.active_weekdays));
      for s in 1 .. cardinality(v_times) loop
        v_at := (d + v_times[s]) at time zone 'Asia/Tashkent';
        if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
          insert into public.agent_items (profile_id, kind, target_date, slot, scheduled_at, prepare_at)
          values (p.id, 'story', d, s, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
          on conflict (profile_id, kind, target_date, slot) do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end loop;
      if p.carousel_enabled and d >= p.post_start_date and (d - p.post_start_date) % p.carousel_every_days = 0 then
        v_at := (d + p.post_time) at time zone 'Asia/Tashkent';
        if v_at >= now() - make_interval(mins => v_settings.late_grace_minutes) then
          insert into public.agent_items (profile_id, kind, target_date, slot, scheduled_at, prepare_at)
          values (p.id, 'carousel', d, 1, v_at, greatest(now(), v_at - make_interval(hours => v_settings.prepare_lead_hours)))
          on conflict (profile_id, kind, target_date, slot) do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Story-only clients: carousels planned earlier and not started yet are removed (nothing generated is touched).
create or replace function public.agents_drop_unstarted_carousels(p_profile uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.agent_items i
    where i.profile_id = p_profile and i.kind = 'carousel' and i.status = 'queued' and i.current_version_id is null
      and not exists (select 1 from public.agent_jobs j where j.item_id = i.id and j.status in ('queued', 'running'))
    returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function public.agents_drop_unstarted_carousels(uuid) from public, anon, authenticated;
grant execute on function public.agents_drop_unstarted_carousels(uuid) to service_role;

update public.agent_profiles
set carousel_enabled = false
where name in ('Comfort Camera', 'SAFI', 'WeDrink', 'Kolyaskachi Xojiaka');

select public.agents_drop_unstarted_carousels(id) from public.agent_profiles where not carousel_enabled;
