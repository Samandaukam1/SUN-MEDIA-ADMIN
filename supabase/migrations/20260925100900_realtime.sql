-- SUN MEDIA — realtime. Private Broadcast channels authorised by RLS on realtime.messages.
--
-- Topics:
--   staff               every SUN MEDIA staff member (agency-wide change signals)
--   client:<client_id>  client users of that company + staff who can access it
--   user:<user_id>      a single person (notifications, assignments, attendance)
--   room:<room_id>      chat room members (full message payloads, typing, presence)
--
-- Data tables emit *signals* only ({table, op, id, client_id, …}); apps refetch through RLS,
-- so nothing is ever leaked through a channel. Chat messages are sent in full to room members.

create or replace function private.can_access_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_topic = 'staff' then
    return private.is_staff();
  end if;
  if p_topic !~ '^(user|client|room):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := split_part(p_topic, ':', 2)::uuid;
  return case split_part(p_topic, ':', 1)
    when 'user' then v_id = auth.uid() and private.is_active_user()
    when 'client' then private.sees_all_clients() or v_id = any (private.accessible_client_ids())
    when 'room' then v_id = any (private.my_chat_room_ids())
    else false
  end;
end;
$$;

grant execute on function private.can_access_topic(text) to authenticated;

create policy "sunmedia receive authorised topics" on realtime.messages
  for select to authenticated
  using (private.can_access_topic((select realtime.topic())));

-- Typing indicators / presence inside chat rooms.
create policy "sunmedia chat typing and presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) like 'room:%'
    and private.can_access_topic((select realtime.topic()))
  );

-- Would a client user be allowed to know this row exists?
create or replace function private.row_is_client_visible(p_table text, p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_row is null then
    return false;
  end if;
  if (p_row ? 'is_client_visible') and not (p_row ->> 'is_client_visible')::boolean then
    return false;
  end if;
  if (p_row ? 'visibility') and p_row ->> 'visibility' <> 'client' then
    return false;
  end if;
  if (p_row ? 'stage') and p_row ->> 'stage' <> 'client' then
    return false;
  end if;
  if p_table = 'content_versions' and p_row ->> 'sent_to_client_at' is null then
    return false;
  end if;
  if p_table = 'monthly_reports' and p_row ->> 'status' <> 'published' then
    return false;
  end if;
  if p_table = 'contracts' and p_row ->> 'status' = 'draft' then
    return false;
  end if;
  if p_table = 'revision_comments' then
    return exists (
      select 1 from public.revisions r where r.id = (p_row ->> 'revision_id')::uuid and r.stage = 'client'
    );
  end if;
  return true;
end;
$$;

-- Trigger args: any of 'staff', 'client', 'user:<column>'.
create or replace function private.broadcast_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_client uuid;
  v_payload jsonb;
  v_arg text;
  v_column text;
  v_key text;
begin
  v_client := case
    when tg_table_name = 'clients' then (v_row ->> 'id')::uuid
    when tg_table_name = 'revision_comments' then
      (select r.client_id from public.revisions r where r.id = (v_row ->> 'revision_id')::uuid)
    else (v_row ->> 'client_id')::uuid
  end;

  v_payload := jsonb_build_object('table', tg_table_name, 'op', lower(tg_op), 'client_id', v_client);
  foreach v_key in array array['id', 'content_id', 'task_id', 'shooting_id', 'revision_id', 'report_id', 'room_id', 'user_id', 'status'] loop
    if v_row ? v_key then
      v_payload := v_payload || jsonb_build_object(v_key, v_row -> v_key);
    end if;
  end loop;

  foreach v_arg in array tg_argv loop
    if v_arg = 'staff' then
      perform realtime.send(v_payload, 'change', 'staff', true);
    elsif v_arg = 'client' then
      if v_client is not null and (
        private.row_is_client_visible(tg_table_name, v_new) or private.row_is_client_visible(tg_table_name, v_old)
      ) then
        perform realtime.send(v_payload, 'change', 'client:' || v_client, true);
      end if;
    elsif v_arg like 'user:%' then
      v_column := substr(v_arg, 6);
      if v_row ->> v_column is not null then
        perform realtime.send(v_payload, 'change', 'user:' || (v_row ->> v_column), true);
      end if;
    end if;
  end loop;
  return null;
exception when others then
  raise warning 'realtime signal failed for %: %', tg_table_name, sqlerrm;
  return null;
end;
$$;

create or replace function private.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'op', lower(tg_op),
      'message', jsonb_build_object(
        'id', new.id, 'room_id', new.room_id, 'sender_id', new.sender_id, 'body', new.body,
        'reply_to_id', new.reply_to_id, 'is_system', new.is_system,
        'created_at', new.created_at, 'edited_at', new.edited_at, 'deleted_at', new.deleted_at
      )
    ),
    'message',
    'room:' || new.room_id,
    true
  );
  return null;
exception when others then
  raise warning 'realtime message broadcast failed: %', sqlerrm;
  return null;
end;
$$;

create trigger messages_broadcast
  after insert or update on public.messages
  for each row execute function private.broadcast_message();

-- Signal wiring
create trigger rt_clients after insert or update or delete on public.clients
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_client_members after insert or update or delete on public.client_members
  for each row execute function private.broadcast_change('staff', 'client', 'user:user_id');
create trigger rt_client_team_members after insert or delete on public.client_team_members
  for each row execute function private.broadcast_change('staff', 'client', 'user:user_id');
create trigger rt_employees after insert or update or delete on public.employees
  for each row execute function private.broadcast_change('staff');
create trigger rt_user_roles after insert or delete on public.user_roles
  for each row execute function private.broadcast_change('staff', 'user:user_id');
create trigger rt_projects after insert or update or delete on public.projects
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_shootings after insert or update or delete on public.shootings
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_shooting_members after insert or delete on public.shooting_members
  for each row execute function private.broadcast_change('staff', 'client', 'user:user_id');
create trigger rt_shooting_attendance after update on public.shooting_attendance
  for each row execute function private.broadcast_change('staff', 'user:user_id');
create trigger rt_content_items after insert or update or delete on public.content_items
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_content_assignments after insert or delete on public.content_assignments
  for each row execute function private.broadcast_change('staff', 'client', 'user:user_id');
create trigger rt_content_publications after insert or update or delete on public.content_publications
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_content_comments after insert or update on public.content_comments
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_tasks after insert or update or delete on public.tasks
  for each row execute function private.broadcast_change('staff');
create trigger rt_task_assignments after insert or delete on public.task_assignments
  for each row execute function private.broadcast_change('staff', 'user:user_id');
create trigger rt_task_checklist_items after insert or update or delete on public.task_checklist_items
  for each row execute function private.broadcast_change('staff');
create trigger rt_attendance after insert or update or delete on public.attendance
  for each row execute function private.broadcast_change('staff', 'user:user_id');
create trigger rt_folders after insert or update on public.folders
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_files after insert or update on public.files
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_content_versions after insert or update on public.content_versions
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_client_approvals after insert on public.client_approvals
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_revisions after insert or update on public.revisions
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_revision_comments after insert or update on public.revision_comments
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_client_subscriptions after insert or update on public.client_subscriptions
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_client_plan_usage after insert or update or delete on public.client_plan_usage
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_plan_upgrade_requests after insert or update on public.plan_upgrade_requests
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_contracts after insert or update on public.contracts
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_social_metrics after insert or update or delete on public.social_metrics
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_content_metrics after insert or update on public.content_metrics
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_monthly_reports after insert or update on public.monthly_reports
  for each row execute function private.broadcast_change('staff', 'client');
create trigger rt_notifications after insert or update on public.notifications
  for each row execute function private.broadcast_change('user:user_id');
create trigger rt_chat_members after insert or delete on public.chat_members
  for each row execute function private.broadcast_change('user:user_id');
