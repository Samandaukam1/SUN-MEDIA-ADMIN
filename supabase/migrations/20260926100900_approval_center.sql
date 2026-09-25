-- SUN MEDIA — approval center.
--   * A version that reaches the client becomes visible to them and gets an approval deadline
--     (the manager's own future deadline is kept; otherwise now + approvals.client_window_hours).
--   * get_approval_counts: one call for the badges of the approval center / inbox, per role.
-- Decisions keep going through submit_content_version / review_content_version.

insert into public.app_settings (key, value, description) values
  ('approvals.client_window_hours', '48', 'Mijoz versiyani necha soat ichida ko''rib chiqishi kerak')
on conflict (key) do nothing;

-- The approval window stays a whole number of hours between 1 and 14 days.
create or replace function private.validate_approval_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'approvals.client_window_hours' and not (
       jsonb_typeof(new.value) = 'number' and (new.value #>> '{}') ~ '^[0-9]+$' and (new.value #>> '{}')::integer between 1 and 336) then
    raise exception 'Approval window must be 1–336 hours' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger app_settings_validate_approvals
  before insert or update on public.app_settings
  for each row execute function private.validate_approval_setting();

create or replace function private.content_versions_sent_to_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'approvals.client_window_hours'), 48);
begin
  if new.status = 'client_review' and (tg_op = 'INSERT' or old.status is distinct from 'client_review') then
    update public.content_items
    set is_client_visible = true,
        client_approval_due_at = case
          when client_approval_due_at is not null and client_approval_due_at > now() then client_approval_due_at
          else now() + make_interval(hours => greatest(v_hours, 1))
        end
    where id = new.content_id;
  end if;
  return null;
end;
$$;

create trigger content_versions_sent_to_client
  after insert or update of status on public.content_versions
  for each row execute function private.content_versions_sent_to_client();

-- Counts are computed under the caller's RLS; the permission checks only decide which queue is "theirs".
create or replace function public.get_approval_counts()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := private.is_staff();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not v_staff then
    return jsonb_build_object(
      'to_review', (
        select count(*) from public.content_versions v
        where v.status = 'client_review' and private.has_client_permission(v.client_id, 'client.approve')
      ),
      'waiting_client', 0,
      'my_revisions', 0,
      'my_in_review', 0
    );
  end if;

  return jsonb_build_object(
    'to_review', (
      select count(*) from public.content_versions v
      where v.status = 'internal_review' and private.can_manage_client(v.client_id, 'approvals.manage')
    ),
    'waiting_client', (
      select count(*) from public.content_versions v
      where v.status = 'client_review'
        and (private.can_manage_client(v.client_id, 'approvals.manage') or v.content_id = any (private.assigned_content_ids()))
    ),
    'my_revisions', (
      select count(*) from public.revisions r
      join public.content_assignments a on a.content_id = r.content_id and a.user_id = v_uid
      where r.status in ('open', 'in_progress')
    ),
    'my_in_review', (
      select count(*) from public.content_versions v
      where v.submitted_by = v_uid and v.status in ('internal_review', 'client_review')
    )
  );
end;
$$;

revoke execute on function public.get_approval_counts() from public, anon;
grant execute on function public.get_approval_counts() to authenticated;
