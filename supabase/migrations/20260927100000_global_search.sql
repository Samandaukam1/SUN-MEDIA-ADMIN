-- SUN MEDIA — global search.
-- One call searches content, tasks, shootings, projects, clients, files and people. It runs as the
-- caller, so every row still passes that person's RLS: clients only ever find their own company.

create or replace function private.search_hit(p_haystack text, p_patterns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p_haystack ilike p), false) from unnest(p_patterns) p;
$$;

-- Words people actually type for a format ("reels", "stories", "dizayn"…).
create or replace function private.content_type_words(p_type public.content_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_type::text || ' ' || case p_type::text
    when 'reel' then 'reels'
    when 'story' then 'stories storis'
    when 'post' then 'post postlar'
    when 'carousel' then 'karusel carousel'
    when 'video' then 'video'
    when 'design' then 'dizayn'
    when 'ad_creative' then 'reklama kreativ'
    else '' end;
$$;

grant execute on function private.search_hit(text, text[]), private.content_type_words(public.content_type) to authenticated;

create or replace function public.global_search(p_query text, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_term text := trim(coalesce(p_query, ''));
  v_patterns text[];
  v_limit integer := least(greatest(coalesce(p_limit, 6), 1), 20);
  v_staff boolean := private.is_staff();
  v_number integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if char_length(v_term) < 2 then
    return '[]'::jsonb;
  end if;
  -- Every word must appear somewhere (title, client, type…): "safi reels" finds SAFI's reels.
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  into v_patterns
  from (select w from unnest(regexp_split_to_array(lower(v_term), '\s+')) w where w <> '' limit 5) words;
  v_number := case when v_term ~ '^#?[0-9]{1,6}$' then ltrim(v_term, '#')::integer end;

  return coalesce((
    select jsonb_agg(r order by r ->> 'group_order', r ->> 'rank', r ->> 'title')
    from (
      (select jsonb_build_object('kind', 'content', 'group_order', 1, 'rank', 0, 'id', c.id, 'title', c.title,
                'subtitle', cl.name, 'status', c.status,
                'content_type', c.content_type, 'number', c.number)
       from public.content_items c join public.clients cl on cl.id = c.client_id
       where c.deleted_at is null and (c.number = v_number or private.search_hit(concat_ws(' ', c.title, cl.name, cl.code, private.content_type_words(c.content_type)), v_patterns))
       order by c.updated_at desc limit v_limit)
      union all
      (select jsonb_build_object('kind', 'task', 'group_order', 2, 'rank', 0, 'id', t.id, 'title', t.title,
                'subtitle', concat_ws(' · ', cl.name, to_char(t.due_at at time zone private.agency_timezone(), 'DD.MM HH24:MI')), 'status', t.status)
       from public.tasks t left join public.clients cl on cl.id = t.client_id
       where v_staff and t.deleted_at is null and private.search_hit(concat_ws(' ', t.title, cl.name), v_patterns)
       order by t.updated_at desc limit v_limit)
      union all
      (select jsonb_build_object('kind', 'shooting', 'group_order', 3, 'rank', 0, 'id', s.id, 'title', s.title,
                'subtitle', concat_ws(' · ', cl.name, to_char(s.starts_at at time zone private.agency_timezone(), 'DD.MM HH24:MI'), s.location_name), 'status', s.status)
       from public.shootings s join public.clients cl on cl.id = s.client_id
       where s.deleted_at is null and private.search_hit(concat_ws(' ', s.title, s.location_name, cl.name), v_patterns)
       order by s.starts_at desc limit v_limit)
      union all
      (select jsonb_build_object('kind', 'project', 'group_order', 4, 'rank', 0, 'id', p.id, 'title', p.name,
                'subtitle', cl.name, 'status', p.status)
       from public.projects p join public.clients cl on cl.id = p.client_id
       where p.deleted_at is null and private.search_hit(concat_ws(' ', p.name, cl.name), v_patterns)
       order by p.updated_at desc limit v_limit)
      union all
      (select jsonb_build_object('kind', 'client', 'group_order', 5, 'rank', 0, 'id', cl.id, 'title', cl.name,
                'subtitle', concat_ws(' · ', cl.code, cl.industry), 'status', cl.status)
       from public.clients cl
       where v_staff and cl.deleted_at is null and private.search_hit(concat_ws(' ', cl.name, cl.code, cl.industry), v_patterns)
       order by cl.name limit v_limit)
      union all
      (select jsonb_build_object('kind', 'file', 'group_order', 6, 'rank', 0, 'id', f.id, 'title', f.name,
                'subtitle', concat_ws(' · ', cl.name, fo.name), 'status', f.kind)
       from public.files f
       left join public.clients cl on cl.id = f.client_id
       left join public.folders fo on fo.id = f.folder_id
       where f.deleted_at is null and f.status = 'uploaded' and f.chat_room_id is null and private.search_hit(concat_ws(' ', f.name, cl.name, fo.name), v_patterns)
       order by f.uploaded_at desc nulls last limit v_limit)
      union all
      (select jsonb_build_object('kind', 'person', 'group_order', 7, 'rank', 0, 'id', pr.id, 'title', pr.full_name,
                'subtitle', coalesce(e.job_title, ''), 'status', null, 'avatar_url', pr.avatar_url)
       from public.profiles pr join public.employees e on e.user_id = pr.id
       where v_staff and pr.deleted_at is null and pr.status = 'active' and e.status <> 'terminated' and private.search_hit(concat_ws(' ', pr.full_name, e.job_title), v_patterns)
       order by pr.full_name limit v_limit)
    ) found(r)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.global_search(text, integer) from public, anon;
grant execute on function public.global_search(text, integer) to authenticated;
