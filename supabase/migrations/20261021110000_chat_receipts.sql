-- Chat receipts: when a message reached each member (delivered) and when each member read it. Both come from the
-- members' own sessions (web or app): reading moves chat_members.last_read_at (mark_chat_read, as before), and every
-- message up to that moment gets a per-person read time. Senders see ✓ sent, ✓✓ delivered, ✓✓ read. Additive.

alter table public.chat_members add column last_delivered_at timestamptz;

create table public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reads_user_idx on public.message_reads (user_id);

alter table public.message_reads enable row level security;
revoke all on public.message_reads from anon, authenticated;
grant select on public.message_reads to authenticated;
create policy "members see who read messages in their rooms" on public.message_reads for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_id and m.room_id = any ((select private.my_chat_room_ids())::uuid[]))
);

-- Reading implies delivery.
create function private.chat_members_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_read_at is not null and new.last_read_at is distinct from old.last_read_at then
    new.last_delivered_at := greatest(coalesce(new.last_delivered_at, new.last_read_at), new.last_read_at);
  end if;
  return new;
end;
$$;

-- Each newly read message gets this person's read time; the room hears about it so ticks update live.
create function private.chat_members_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_at is not null and new.last_read_at is distinct from old.last_read_at then
    insert into public.message_reads (message_id, user_id, read_at)
    select m.id, new.user_id, new.last_read_at
    from public.messages m
    where m.room_id = new.room_id
      and m.created_at <= new.last_read_at
      and m.created_at > coalesce(old.last_read_at, '-infinity'::timestamptz)
      and m.sender_id is distinct from new.user_id
      and not m.is_system
    on conflict do nothing;
  end if;
  if new.last_read_at is distinct from old.last_read_at or new.last_delivered_at is distinct from old.last_delivered_at then
    begin
      perform realtime.send(
        jsonb_build_object('room_id', new.room_id, 'user_id', new.user_id, 'read_at', new.last_read_at, 'delivered_at', new.last_delivered_at),
        'receipt', 'room:' || new.room_id, true
      );
    exception when others then
      raise warning 'receipt broadcast failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.chat_members_after_update() from public;

create trigger chat_members_10_receipts before update on public.chat_members
  for each row execute function private.chat_members_before_update();
create trigger chat_members_receipts after update on public.chat_members
  for each row execute function private.chat_members_after_update();

-- The person's client received the room's messages (called when a chat list or room loads, or a message arrives).
create function public.mark_chat_delivered(p_room_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.chat_members cm
  set last_delivered_at = now()
  where cm.user_id = auth.uid()
    and (p_room_id is null or cm.room_id = p_room_id)
    and exists (
      select 1 from public.messages m
      where m.room_id = cm.room_id
        and m.sender_id is distinct from auth.uid()
        and m.created_at > coalesce(cm.last_delivered_at, '-infinity'::timestamptz)
    );
end;
$$;
revoke all on function public.mark_chat_delivered(uuid) from public, anon;
grant execute on function public.mark_chat_delivered(uuid) to authenticated;
