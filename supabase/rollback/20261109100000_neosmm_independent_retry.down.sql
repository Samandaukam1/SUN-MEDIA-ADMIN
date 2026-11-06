-- Rollback of 20261109100000_neosmm_independent_retry.sql: every passing refusal pauses its plan again (the earlier
-- behaviour). Orders, parts, plans and the queue are not touched. Parts already waiting for a retry stay "planned"
-- with their due time and are sent then; to stop them, pause their plan in Smm Api → Rejalar.
-- Run: npx supabase db query --linked -f supabase/rollback/20261109100000_neosmm_independent_retry.down.sql

create or replace function private.neosmm_order_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final boolean := private.neosmm_is_final(new.status);
  v_was_final boolean := private.neosmm_is_final(old.status);
  v_completed boolean := private.neosmm_status_key(new.status) = 'completed';
  v_state_changed boolean := new.state is distinct from old.state;
begin
  if v_completed and new.completed_at is null then
    new.completed_at := now();
  end if;

  -- Service evidence (SMM only).
  if new.kind = 'smm' then
    if v_state_changed and new.state = 'accepted' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, last_accepted_at, last_accepted_order)
      values (new.item_id, new.item_name, new.item_category, now(), new.id)
      on conflict (provider, service_id) do update
        set last_accepted_at = excluded.last_accepted_at, last_accepted_order = excluded.last_accepted_order,
            service_name = excluded.service_name, service_category = excluded.service_category;
    end if;
    if v_completed and private.neosmm_status_key(old.status) <> 'completed' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, last_completed_at, last_completed_order)
      values (new.item_id, new.item_name, new.item_category, now(), new.id)
      on conflict (provider, service_id) do update
        set last_completed_at = excluded.last_completed_at, last_completed_order = excluded.last_completed_order;
    end if;
    if v_state_changed and new.state = 'rejected' and new.error_kind = 'service' then
      insert into public.neosmm_service_health as h (service_id, service_name, service_category, blocked_at, blocked_reason, blocked_order)
      values (new.item_id, new.item_name, new.item_category, now(), left(coalesce(new.provider_error, new.error), 1000), new.id)
      on conflict (provider, service_id) do update
        set blocked_at = excluded.blocked_at, blocked_reason = excluded.blocked_reason, blocked_order = excluded.blocked_order;
    end if;
  end if;

  -- The queue: a certain rejection, "never arrived" or a final status frees it; anything else keeps it.
  if new.state in ('rejected', 'not_placed') or (new.state = 'accepted' and v_final) then
    delete from public.neosmm_queue where order_id = new.id;
  elsif v_state_changed and new.state = 'accepted' then
    update public.neosmm_queue set hold = 'active' where order_id = new.id;
  elsif v_state_changed and new.state = 'unknown' then
    update public.neosmm_queue set hold = 'unknown' where order_id = new.id;
  end if;

  -- The plan part behind this order (its current attempt only).
  if new.plan_id is not null then
    if v_state_changed then
      update public.neosmm_plan_parts
      set state = case new.state when 'accepted' then 'sent' when 'rejected' then 'rejected' when 'unknown' then 'unknown' when 'not_placed' then 'not_placed' else state end,
          lease_until = null,
          note = case when new.state in ('rejected', 'unknown') then left(new.error, 500) else note end
      where order_id = new.id and state in ('sending', 'unknown');
      if new.state = 'accepted' then
        perform private.neosmm_reschedule(new.plan_id, new.part_index, coalesce(new.accepted_at, now()));
      elsif new.state = 'rejected' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism qabul qilinmadi: %s', new.part_index + 1, coalesce(new.error, '—')));
      elsif new.state = 'unknown' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism: Natija noma’lum — tekshirish kerak', new.part_index + 1));
      elsif new.state = 'not_placed' then
        perform private.neosmm_pause(new.plan_id, format('%s-qism provayderga tushmagan — davom ettirsangiz qayta yuboriladi', new.part_index + 1));
      end if;
    end if;
    if new.state = 'accepted' and v_final and not v_was_final then
      if v_completed then
        update public.neosmm_plans pl set status = 'completed', pause_reason = null
        where pl.id = new.plan_id and pl.status = 'active'
          and not exists (select 1 from public.neosmm_plan_parts p where p.plan_id = pl.id and p.state not in ('sent', 'cancelled'))
          and not exists (
            select 1 from public.neosmm_plan_parts p join public.neosmm_orders o on o.id = p.order_id
            where p.plan_id = pl.id and p.state = 'sent' and o.id <> new.id and private.neosmm_status_key(o.status) <> 'completed'
          );
      else
        -- Partial / cancelled / failed: a person decides; no automatic re-purchase of the remainder, no refill.
        perform private.neosmm_pause(new.plan_id, format('%s-qism yakunlandi: %s — ko‘rib chiqing', new.part_index + 1, new.status));
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop function if exists private.neosmm_retry_delay(text, integer);
drop function if exists private.neosmm_retry_limit();
-- Optional, only once nothing needs the attempt counts any more:
-- alter table public.neosmm_plan_parts drop column if exists retry_count;
