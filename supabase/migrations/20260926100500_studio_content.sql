-- SUN MEDIA — Studio: create/edit a content item with its team, shooting and publications in one
-- transaction, and tell the app which pipeline moves the caller may make.
--
-- save_content is SECURITY INVOKER on purpose: every insert/update below passes the caller's own
-- RLS policies and guard triggers (content.manage, shootings.manage, publications.manage, client
-- scope), so the function only orchestrates — it grants nothing.

create or replace function public.save_content(p_content_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_content_id;
  v_client uuid;
  v_title text := nullif(btrim(coalesce(p_payload ->> 'title', '')), '');
  v_shooting jsonb := coalesce(p_payload -> 'shooting', '{}');
  v_shooting_id uuid;
  v_role text;
  v_user uuid;
  v_platform text;
  v_publish_at timestamptz := nullif(p_payload ->> 'publish_at', '')::timestamptz;
  v_mode text := coalesce(v_shooting ->> 'mode', 'keep');
begin
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Title is required (1–200 characters)' using errcode = '22023';
  end if;
  if p_payload ? 'content_type' and (p_payload ->> 'content_type') is null then
    raise exception 'Choose a content type' using errcode = '22023';
  end if;

  if v_id is null then
    v_client := (p_payload ->> 'client_id')::uuid;
    if v_client is null then
      raise exception 'client_id is required' using errcode = '22023';
    end if;
  else
    select client_id into v_client from public.content_items where id = v_id and deleted_at is null;
    if v_client is null then
      raise exception 'Content not found' using errcode = 'P0002';
    end if;
  end if;

  -- Shooting: link an existing one of the same client, or plan a new one.
  if v_mode = 'existing' then
    v_shooting_id := (v_shooting ->> 'shooting_id')::uuid;
    if not exists (select 1 from public.shootings where id = v_shooting_id and client_id = v_client and deleted_at is null) then
      raise exception 'Shooting does not belong to this client' using errcode = '22023';
    end if;
  elsif v_mode = 'new' then
    if (v_shooting ->> 'starts_at') is null or (v_shooting ->> 'ends_at') is null then
      raise exception 'Shooting date and time are required' using errcode = '22023';
    end if;
    insert into public.shootings (client_id, project_id, title, starts_at, ends_at, location_name, location_address, status)
    values (
      v_client,
      nullif(p_payload ->> 'project_id', '')::uuid,
      coalesce(nullif(btrim(v_shooting ->> 'title'), ''), v_title),
      (v_shooting ->> 'starts_at')::timestamptz,
      (v_shooting ->> 'ends_at')::timestamptz,
      nullif(btrim(coalesce(v_shooting ->> 'location_name', '')), ''),
      nullif(btrim(coalesce(v_shooting ->> 'location_address', '')), ''),
      'planned'
    )
    returning id into v_shooting_id;
  end if;

  if v_id is null then
    insert into public.content_items (
      client_id, project_id, shooting_id, title, content_type, description, script, caption, hashtags,
      reference_links, music_reference, status, priority, plan_month, due_at, client_approval_due_at,
      is_client_visible, counts_toward_plan
    ) values (
      v_client,
      nullif(p_payload ->> 'project_id', '')::uuid,
      v_shooting_id,
      v_title,
      coalesce((p_payload ->> 'content_type')::public.content_type, 'reel'),
      nullif(p_payload ->> 'description', ''),
      nullif(p_payload ->> 'script', ''),
      nullif(p_payload ->> 'caption', ''),
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload -> 'hashtags') x where btrim(x) <> ''), '{}'),
      coalesce(p_payload -> 'reference_links', '[]'),
      nullif(p_payload ->> 'music_reference', ''),
      coalesce((p_payload ->> 'status')::public.content_status, 'idea'),
      coalesce((p_payload ->> 'priority')::public.priority_level, 'normal'),
      -- The plan month defaults to the month of the deadline (or the current agency month).
      coalesce(
        nullif(p_payload ->> 'plan_month', '')::date,
        date_trunc('month', coalesce(
          (nullif(p_payload ->> 'due_at', '')::timestamptz at time zone private.agency_timezone())::date,
          private.agency_today()))::date
      ),
      nullif(p_payload ->> 'due_at', '')::timestamptz,
      nullif(p_payload ->> 'client_approval_due_at', '')::timestamptz,
      coalesce((p_payload ->> 'is_client_visible')::boolean, true),
      coalesce((p_payload ->> 'counts_toward_plan')::boolean, true)
    )
    returning id into v_id;
  else
    update public.content_items set
      project_id = case when p_payload ? 'project_id' then nullif(p_payload ->> 'project_id', '')::uuid else project_id end,
      shooting_id = case when v_mode in ('existing', 'new') then v_shooting_id when v_mode = 'none' then null else shooting_id end,
      title = v_title,
      content_type = coalesce((p_payload ->> 'content_type')::public.content_type, content_type),
      description = case when p_payload ? 'description' then nullif(p_payload ->> 'description', '') else description end,
      script = case when p_payload ? 'script' then nullif(p_payload ->> 'script', '') else script end,
      caption = case when p_payload ? 'caption' then nullif(p_payload ->> 'caption', '') else caption end,
      hashtags = case when p_payload ? 'hashtags'
                      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload -> 'hashtags') x where btrim(x) <> ''), '{}')
                      else hashtags end,
      reference_links = case when p_payload ? 'reference_links' then coalesce(p_payload -> 'reference_links', '[]') else reference_links end,
      music_reference = case when p_payload ? 'music_reference' then nullif(p_payload ->> 'music_reference', '') else music_reference end,
      priority = coalesce((p_payload ->> 'priority')::public.priority_level, priority),
      plan_month = coalesce(nullif(p_payload ->> 'plan_month', '')::date, plan_month),
      due_at = case when p_payload ? 'due_at' then nullif(p_payload ->> 'due_at', '')::timestamptz else due_at end,
      client_approval_due_at = case when p_payload ? 'client_approval_due_at' then nullif(p_payload ->> 'client_approval_due_at', '')::timestamptz else client_approval_due_at end,
      is_client_visible = coalesce((p_payload ->> 'is_client_visible')::boolean, is_client_visible),
      counts_toward_plan = coalesce((p_payload ->> 'counts_toward_plan')::boolean, counts_toward_plan)
    where id = v_id;
  end if;

  -- Team: one person per production role; roles not present in the payload are left untouched.
  if p_payload ? 'team' then
    for v_role, v_user in
      select key, nullif(value #>> '{}', '')::uuid from jsonb_each(p_payload -> 'team')
    loop
      delete from public.content_assignments
      where content_id = v_id and role = v_role::public.team_role and (v_user is null or user_id <> v_user);
      if v_user is not null then
        insert into public.content_assignments (content_id, user_id, role)
        values (v_id, v_user, v_role::public.team_role)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- Shooting crew mirrors the operator when a new shooting is planned from the content form.
  if v_mode = 'new' and (p_payload -> 'team' ->> 'operator') is not null then
    insert into public.shooting_members (shooting_id, user_id, role)
    values (v_shooting_id, (p_payload -> 'team' ->> 'operator')::uuid, 'operator')
    on conflict do nothing;
  end if;

  -- Publications: one per platform. Removed platforms are cancelled (history is kept).
  if p_payload ? 'platforms' then
    update public.content_publications p
    set status = 'cancelled'
    where p.content_id = v_id and p.status in ('planned', 'scheduled')
      and not (p.platform::text in (select jsonb_array_elements_text(p_payload -> 'platforms')));

    for v_platform in select jsonb_array_elements_text(p_payload -> 'platforms') loop
      if exists (select 1 from public.content_publications p
                 where p.content_id = v_id and p.platform = v_platform::public.social_platform and p.status <> 'cancelled') then
        update public.content_publications p
        set scheduled_at = coalesce(v_publish_at, p.scheduled_at)
        where p.content_id = v_id and p.platform = v_platform::public.social_platform and p.status in ('planned', 'scheduled');
      else
        insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
        values (v_id, v_client, v_platform::public.social_platform, v_publish_at, 'planned');
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_content(uuid, jsonb) from public, anon;
grant execute on function public.save_content(uuid, jsonb) to authenticated;

-- Moves the caller may make from the item's current status (same rules as set_content_status).
create or replace function public.get_content_transitions(p_content_id uuid)
returns public.content_status[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = p_content_id and deleted_at is null;
  if not found or not (private.sees_all_clients() or v_item.client_id = any (private.accessible_client_ids())) then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;

  if private.can_manage_client(v_item.client_id, 'content.manage') then
    return array(
      select s from unnest(enum_range(null::public.content_status)) s where s <> v_item.status
    );
  end if;
  if p_content_id = any (private.assigned_content_ids()) then
    return array(
      select s from unnest(enum_range(null::public.content_status)) s
      where private.assignee_transition_allowed(v_item.status, s)
    );
  end if;
  return '{}';
end;
$$;

revoke execute on function public.get_content_transitions(uuid) from public, anon;
grant execute on function public.get_content_transitions(uuid) to authenticated;
