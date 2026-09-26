-- SUN MEDIA — tariffs in practice.
--   * assign_plan: puts a client on a plan from a date; the running subscription ends the day
--     before (or is cancelled if it had not started), quotas are snapshotted by the existing trigger.
--   * handle_upgrade_request: approve (switch plan) or reject a client's request in one step.
--   * get_client_plan: everything the client's "Tarif" screen shows, under the caller's RLS.

create or replace function public.assign_plan(
  p_client_id uuid,
  p_plan_id uuid,
  p_starts_on date default null,
  p_price numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_start date := coalesce(p_starts_on, private.agency_today());
  v_end date;
  v_id uuid;
begin
  if not private.can_manage_client(p_client_id, 'subscriptions.manage') then
    raise exception 'Not allowed to manage subscriptions for this client' using errcode = '42501';
  end if;
  select * into v_plan from public.plans
  where id = p_plan_id and is_active and deleted_at is null
    and (client_id is null or client_id = p_client_id);
  if not found then
    raise exception 'Plan is not available for this client' using errcode = '22023';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'Price cannot be negative' using errcode = '22023';
  end if;
  v_end := (v_start + make_interval(months => v_plan.duration_months) - interval '1 day')::date;

  -- Close what overlaps: running periods end the day before, future ones are cancelled.
  update public.client_subscriptions
  set status = 'cancelled'
  where client_id = p_client_id and status in ('scheduled', 'active') and starts_on >= v_start;
  update public.client_subscriptions
  set ends_on = v_start - 1,
      status = case when v_start - 1 < private.agency_today() then 'expired' else status end::public.subscription_status
  where client_id = p_client_id and status in ('scheduled', 'active') and starts_on < v_start and ends_on >= v_start;

  insert into public.client_subscriptions (client_id, plan_id, status, starts_on, ends_on, price, currency, notes, created_by)
  values (
    p_client_id, p_plan_id,
    case when v_start <= private.agency_today() then 'active' else 'scheduled' end::public.subscription_status,
    v_start, v_end, coalesce(p_price, v_plan.price), v_plan.currency, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  -- Usage already recorded inside the new period moves to the new subscription.
  update public.client_plan_usage
  set subscription_id = v_id
  where client_id = p_client_id and occurred_on between v_start and v_end;

  perform private.audit_event('subscription.assigned', 'client_subscriptions', v_id::text, p_client_id, null,
    jsonb_build_object('plan', v_plan.name, 'starts_on', v_start, 'ends_on', v_end));
  return v_id;
end;
$$;

create or replace function public.handle_upgrade_request(
  p_request_id uuid,
  p_approve boolean,
  p_response text default null,
  p_starts_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.plan_upgrade_requests;
  v_subscription uuid;
begin
  select * into v_request from public.plan_upgrade_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_client(v_request.client_id, 'subscriptions.manage') then
    raise exception 'Not allowed to handle this request' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request is already %', v_request.status using errcode = '22023';
  end if;
  if not p_approve and coalesce(trim(p_response), '') = '' then
    raise exception 'Explain why the request is rejected' using errcode = '22023';
  end if;

  if p_approve then
    v_subscription := public.assign_plan(v_request.client_id, v_request.requested_plan_id, p_starts_on);
  end if;
  update public.plan_upgrade_requests
  set status = case when p_approve then 'approved' else 'rejected' end::public.request_status,
      response = nullif(trim(p_response), ''),
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_request_id;
  return v_subscription;
end;
$$;

create or replace function public.get_client_plan(p_client_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.agency_today();
  v_current public.client_subscriptions;
begin
  if not private.can_view_subscription_of(p_client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_current from public.client_subscriptions
  where client_id = p_client_id and status in ('active', 'scheduled') and ends_on >= v_today
  order by case status when 'active' then 0 else 1 end, starts_on
  limit 1;

  return jsonb_build_object(
    'current', case when v_current.id is null then null else (
      select jsonb_build_object(
        'id', v_current.id, 'status', v_current.status, 'starts_on', v_current.starts_on, 'ends_on', v_current.ends_on,
        'price', v_current.price, 'currency', v_current.currency,
        'days_total', v_current.ends_on - v_current.starts_on + 1,
        'days_left', greatest(0, v_current.ends_on - greatest(v_today, v_current.starts_on - 1)),
        'plan', jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'duration_months', p.duration_months)
      )
      from public.plans p where p.id = v_current.plan_id
    ) end,
    'upcoming', (
      select jsonb_build_object('id', s.id, 'plan_name', p.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'price', s.price, 'currency', s.currency)
      from public.client_subscriptions s join public.plans p on p.id = s.plan_id
      where s.client_id = p_client_id and s.status = 'scheduled' and s.starts_on > v_today
        and (v_current.id is null or s.id <> v_current.id)
      order by s.starts_on
      limit 1
    ),
    'usage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_key', u.service_key, 'service_name', u.service_name, 'unit', u.unit,
        'planned', u.planned, 'used', u.used, 'is_included', u.is_included, 'is_quantitative', u.is_quantitative
      ) order by u.position)
      from public.subscription_usage_summary u where u.subscription_id = v_current.id
    ), '[]'::jsonb),
    'pending_request', (
      select jsonb_build_object('id', r.id, 'plan_name', p.name, 'message', r.message, 'created_at', r.created_at)
      from public.plan_upgrade_requests r join public.plans p on p.id = r.requested_plan_id
      where r.client_id = p_client_id and r.status = 'pending'
      limit 1
    ),
    'last_decision', (
      select jsonb_build_object('status', r.status, 'plan_name', p.name, 'response', r.response, 'handled_at', r.handled_at)
      from public.plan_upgrade_requests r join public.plans p on p.id = r.requested_plan_id
      where r.client_id = p_client_id and r.status in ('approved', 'rejected') and r.handled_at > now() - interval '30 days'
      order by r.handled_at desc
      limit 1
    ),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'price', p.price, 'currency', p.currency,
        'duration_months', p.duration_months, 'is_custom', p.client_id is not null,
        'is_current', p.id = v_current.plan_id,
        'features', coalesce((
          select jsonb_agg(jsonb_build_object('service_name', st.name, 'unit', st.unit, 'quantity', f.quantity, 'is_included', f.is_included, 'note', f.note)
                           order by st.position)
          from public.plan_features f join public.service_types st on st.key = f.service_key
          where f.plan_id = p.id and f.is_included
        ), '[]'::jsonb)
      ) order by p.position, p.price)
      from public.plans p
      where p.is_active and p.deleted_at is null and (p.is_public or p.client_id = p_client_id)
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'plan_name', p.name, 'status', s.status, 'starts_on', s.starts_on, 'ends_on', s.ends_on
      ) order by s.starts_on desc)
      from (
        select * from public.client_subscriptions
        where client_id = p_client_id and (v_current.id is null or id <> v_current.id) and starts_on <= v_today
        order by starts_on desc limit 6
      ) s join public.plans p on p.id = s.plan_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function
  public.assign_plan(uuid, uuid, date, numeric, text),
  public.handle_upgrade_request(uuid, boolean, text, date),
  public.get_client_plan(uuid)
from public, anon;
grant execute on function
  public.assign_plan(uuid, uuid, date, numeric, text),
  public.handle_upgrade_request(uuid, boolean, text, date),
  public.get_client_plan(uuid)
to authenticated;
