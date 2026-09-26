-- SUN MEDIA — hardening found by the security audit (Phase 16).
--   * clean_shot_list builds JSON (STABLE functions), so it must not claim IMMUTABLE: the planner
--     could otherwise cache results. Literals get explicit types.
--   * get_content_transitions returns an explicitly typed empty array.
-- Invariants (RLS everywhere, fixed search_path, nothing for anon, invoker views, private buckets)
-- are enforced by tests/database/016_security_invariants.test.sql.

create or replace function private.clean_shot_list(p_list jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_title text;
begin
  if p_list is null or jsonb_typeof(p_list) <> 'array' then
    return '[]'::jsonb;
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
  return '{}'::public.content_status[];
end;
$$;
