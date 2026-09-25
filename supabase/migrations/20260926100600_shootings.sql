-- SUN MEDIA — shooting management.
--   * save_shooting (SECURITY INVOKER): shooting row + crew + shot list in one transaction; every
--     write passes the caller's RLS (shootings.manage, client scope) and staff-only guards.
--   * toggle_shot_item: the crew ticks the shot list on set without getting edit rights on the
--     shooting itself (managers can too).

create or replace function private.clean_shot_list(p_list jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out jsonb := '[]';
  v_item jsonb;
  v_title text;
begin
  if p_list is null or jsonb_typeof(p_list) <> 'array' then
    return '[]';
  end if;
  if jsonb_array_length(p_list) > 100 then
    raise exception 'Shot list is limited to 100 items' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_list) loop
    v_title := btrim(coalesce(v_item ->> 'title', v_item #>> '{}', ''));
    continue when v_title = '';
    if char_length(v_title) > 200 then
      raise exception 'Shot list items are limited to 200 characters' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('title', v_title, 'done', coalesce((v_item ->> 'done')::boolean, false)));
  end loop;
  return v_out;
end;
$$;

grant execute on function private.clean_shot_list(jsonb) to authenticated;

create or replace function public.save_shooting(p_shooting_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_shooting_id;
  v_client uuid;
  v_title text := nullif(btrim(coalesce(p_payload ->> 'title', '')), '');
  v_starts timestamptz := nullif(p_payload ->> 'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p_payload ->> 'ends_at', '')::timestamptz;
  v_member jsonb;
begin
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Title is required (1–200 characters)' using errcode = '22023';
  end if;
  if v_starts is null or v_ends is null then
    raise exception 'Shooting date and time are required' using errcode = '22023';
  end if;
  if v_ends <= v_starts then
    raise exception 'End time must be after the start' using errcode = '22023';
  end if;
  if (p_payload ->> 'location_url') is not null and (p_payload ->> 'location_url') !~* '^https://' then
    raise exception 'Only https links are allowed' using errcode = '22023';
  end if;

  if v_id is null then
    v_client := (p_payload ->> 'client_id')::uuid;
    if v_client is null then
      raise exception 'client_id is required' using errcode = '22023';
    end if;
    insert into public.shootings (
      client_id, project_id, title, description, starts_at, ends_at, location_name, location_address, location_url,
      shot_list, reference_links, responsible_manager_id, status
    ) values (
      v_client,
      nullif(p_payload ->> 'project_id', '')::uuid,
      v_title,
      nullif(p_payload ->> 'description', ''),
      v_starts,
      v_ends,
      nullif(btrim(coalesce(p_payload ->> 'location_name', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'location_address', '')), ''),
      nullif(p_payload ->> 'location_url', ''),
      private.clean_shot_list(p_payload -> 'shot_list'),
      coalesce(p_payload -> 'reference_links', '[]'),
      coalesce(nullif(p_payload ->> 'responsible_manager_id', '')::uuid, auth.uid()),
      coalesce((p_payload ->> 'status')::public.shooting_status, 'planned')
    )
    returning id into v_id;
  else
    update public.shootings set
      project_id = case when p_payload ? 'project_id' then nullif(p_payload ->> 'project_id', '')::uuid else project_id end,
      title = v_title,
      description = case when p_payload ? 'description' then nullif(p_payload ->> 'description', '') else description end,
      starts_at = v_starts,
      ends_at = v_ends,
      location_name = case when p_payload ? 'location_name' then nullif(btrim(coalesce(p_payload ->> 'location_name', '')), '') else location_name end,
      location_address = case when p_payload ? 'location_address' then nullif(btrim(coalesce(p_payload ->> 'location_address', '')), '') else location_address end,
      location_url = case when p_payload ? 'location_url' then nullif(p_payload ->> 'location_url', '') else location_url end,
      shot_list = case when p_payload ? 'shot_list' then private.clean_shot_list(p_payload -> 'shot_list') else shot_list end,
      reference_links = case when p_payload ? 'reference_links' then coalesce(p_payload -> 'reference_links', '[]') else reference_links end,
      responsible_manager_id = case when p_payload ? 'responsible_manager_id' then nullif(p_payload ->> 'responsible_manager_id', '')::uuid else responsible_manager_id end,
      status = coalesce((p_payload ->> 'status')::public.shooting_status, status),
      actual_started_at = case when (p_payload ->> 'status') = 'in_progress' and actual_started_at is null then now() else actual_started_at end,
      actual_ended_at = case when (p_payload ->> 'status') = 'completed' and actual_ended_at is null then now() else actual_ended_at end
    where id = v_id and deleted_at is null;
    if not found then
      raise exception 'Shooting not found' using errcode = 'P0002';
    end if;
  end if;

  -- Crew: the payload is the full list ({user_id, role}); members not in it are removed.
  if p_payload ? 'crew' then
    delete from public.shooting_members sm
    where sm.shooting_id = v_id
      and not exists (
        select 1 from jsonb_array_elements(p_payload -> 'crew') c
        where (c ->> 'user_id')::uuid = sm.user_id and (c ->> 'role') = sm.role::text
      );
    for v_member in select value from jsonb_array_elements(p_payload -> 'crew') loop
      insert into public.shooting_members (shooting_id, user_id, role)
      values (v_id, (v_member ->> 'user_id')::uuid, coalesce((v_member ->> 'role')::public.team_role, 'operator'))
      on conflict do nothing;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_shooting(uuid, jsonb) from public, anon;
grant execute on function public.save_shooting(uuid, jsonb) to authenticated;

-- Crew members (and managers) tick shot list items on set.
create or replace function public.toggle_shot_item(p_shooting_id uuid, p_index integer, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shooting public.shootings;
begin
  select * into v_shooting from public.shootings where id = p_shooting_id and deleted_at is null for update;
  if not found then
    raise exception 'Shooting not found' using errcode = 'P0002';
  end if;
  if not (p_shooting_id = any (private.my_shooting_ids()) or private.can_manage_client(v_shooting.client_id, 'shootings.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_index < 0 or p_index >= jsonb_array_length(coalesce(v_shooting.shot_list, '[]')) then
    raise exception 'Shot list item not found' using errcode = '22023';
  end if;

  update public.shootings
  set shot_list = jsonb_set(shot_list, array[p_index::text, 'done'], to_jsonb(coalesce(p_done, false)))
  where id = p_shooting_id
  returning shot_list into v_shooting.shot_list;
  return v_shooting.shot_list;
end;
$$;

revoke execute on function public.toggle_shot_item(uuid, integer, boolean) from public, anon;
grant execute on function public.toggle_shot_item(uuid, integer, boolean) to authenticated;
