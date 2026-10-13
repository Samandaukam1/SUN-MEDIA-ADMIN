-- The system owner talks to clients from the panel: like the admins, the Rahbar and the director, they are a member
-- of every client's default chat (existing rooms now, new clients and new system owners automatically). Additive.

create or replace function private.client_room_staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ur.user_id), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key in ('system_owner', 'admin', 'owner', 'director')
  join public.profiles p on p.id = ur.user_id and p.deleted_at is null;
$$;

create or replace function private.sync_admin_client_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'user_roles' then
    if (select key from public.roles where id = new.role_id) in ('system_owner', 'admin', 'owner', 'director') then
      insert into public.chat_members (room_id, user_id)
      select r.id, new.user_id from public.chat_rooms r where r.kind = 'project' and r.is_default
      on conflict do nothing;
    end if;
  elsif new.kind = 'project' and new.is_default then
    insert into public.chat_members (room_id, user_id)
    select new.id, a from unnest(private.client_room_staff_ids()) a
    on conflict do nothing;
  end if;
  return null;
end;
$$;

insert into public.chat_members (room_id, user_id)
select r.id, ur.user_id
from public.chat_rooms r
cross join public.user_roles ur
join public.roles ro on ro.id = ur.role_id and ro.key = 'system_owner'
join public.profiles p on p.id = ur.user_id and p.deleted_at is null
where r.kind = 'project' and r.is_default
on conflict do nothing;
