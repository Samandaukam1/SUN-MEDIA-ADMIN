import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { requireStaff } from '@/lib/auth';
import { loadClientConversations, loadColleagues, loadMyChats, loadRoom, loadRoomMessages, ROOM_PAGE } from '@/lib/chat';
import { isOnline, lastSeenLabel } from '@/lib/presence';
import { agencyDateKey, formatTime } from '@/lib/time';
import { ChatRoom } from './ChatRoom';
import { NewChat } from './NewChat';

type Item = { id: string; title: string; preview: string; at: string | null; unread: number; flag?: string; logo?: string | null; direct?: boolean };

function when(iso: string | null): string {
  if (!iso) return '';
  const key = agencyDateKey(new Date(iso));
  if (key === agencyDateKey()) return formatTime(iso);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * The chat: SUN MEDIA's own conversations ("team") or the chats with clients ("clients") in the panel, and every
 * conversation the person belongs to in the staff cabinet ("staff"). List on the left and the open conversation
 * on the right; on phones one at a time. Rows come through row-level security, so nobody reads others' chats.
 */
export async function ChatWorkspace({ mode, xona, oldin }: { mode: 'team' | 'clients' | 'staff'; xona?: string; oldin?: string }) {
  const context = await requireStaff();
  const base = mode === 'team' ? '/chat' : mode === 'staff' ? '/xodim/chat' : '/chat/mijozlar';
  const chats = await loadMyChats();
  let items: Item[];
  let observeAll = false;
  if (mode === 'team' || mode === 'staff') {
    items = chats
      .filter((c) => (mode === 'staff' || c.kind !== 'project') && !c.archived)
      .map((c) => ({
        id: c.room_id,
        title: c.kind === 'direct' ? (c.peer_name ?? 'Suhbat') : c.kind === 'project' ? (c.client_name ?? c.name ?? 'Mijoz') : (c.name ?? 'Guruh'),
        preview: c.last_is_system ? (c.last_message_body ?? '') : `${c.last_sender_name ? `${c.last_sender_name}: ` : ''}${c.last_message_body || (c.last_has_files ? 'Fayl' : '')}`,
        at: c.last_message_at,
        unread: c.unread_count ?? 0,
        direct: c.kind === 'direct',
      }));
  } else {
    const all = await loadClientConversations();
    observeAll = !!all;
    items = all
      ? all.map((c) => ({
          id: c.room_id,
          title: c.client_name,
          preview: `${c.last_sender_name ? `${c.last_sender_name}: ` : ''}${c.last_message_body ?? ''}`,
          at: c.last_message_at,
          unread: c.unread_count ?? 0,
          flag: c.awaiting_reply ? 'Javob kutmoqda' : undefined,
          logo: c.client_logo,
        }))
      : chats
          .filter((c) => c.kind === 'project' && !c.archived)
          .map((c) => ({
            id: c.room_id,
            title: c.client_name ?? c.name ?? 'Mijoz',
            preview: `${c.last_sender_name ? `${c.last_sender_name}: ` : ''}${c.last_message_body ?? ''}`,
            at: c.last_message_at,
            unread: c.unread_count ?? 0,
            logo: c.client_logo,
          }));
  }
  const selected = xona && items.some((i) => i.id === xona) ? xona : null;
  const before = oldin && !Number.isNaN(Date.parse(oldin)) ? oldin : null;
  const [room, messages, colleagues] = await Promise.all([
    selected ? loadRoom(selected, context.userId) : null,
    selected ? loadRoomMessages(selected, before) : [],
    mode !== 'clients' ? loadColleagues(context.userId) : [],
  ]);
  const older = selected && messages.length === ROOM_PAGE ? `${base}?xona=${selected}&oldin=${encodeURIComponent(messages[0].created_at)}` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mode === 'clients' ? 'Mijozlar bilan chat' : 'Chat'}</h1>
          <p className="text-sm text-muted">
            {mode === 'team'
              ? 'SUN MEDIA xodimlari o‘rtasida: guruhlar va shaxsiy yozishmalar.'
              : mode === 'staff'
                ? 'Hamkasblar, guruhlar va siz biriktirilgan mijoz chatlari. Ilovadagi chat bilan bir xil.'
                : 'Har bir mijoz bilan bitta chat — mijoz uni o‘z kabinetida va ilovada ko‘radi.'}
          </p>
        </div>
        {mode !== 'clients' ? <NewChat colleagues={colleagues} base={base} /> : null}
      </div>
      <div className="grid h-[calc(100dvh-14rem)] min-h-[440px] overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[320px_1fr]">
        <aside className={`min-h-0 flex-col border-line lg:flex lg:border-r ${selected ? 'hidden' : 'flex'}`}>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-muted">
                {mode !== 'clients' ? 'Hali suhbat yo‘q. “Yangi suhbat” bilan boshlang.' : 'Mijoz chatlari yo‘q yoki siz ularga biriktirilmagansiz.'}
              </li>
            ) : null}
            {items.map((i) => {
              const on = i.id === selected;
              return (
                <li key={i.id}>
                  <Link href={`${base}?xona=${i.id}`} className={`flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-surface-2 ${on ? 'bg-surface-2' : ''}`}>
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-[13px] font-semibold">
                      {i.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.logo} alt="" className="size-full object-cover" />
                      ) : i.direct ? (
                        initials(i.title)
                      ) : mode !== 'clients' ? (
                        <Icon name="users" size={17} />
                      ) : (
                        initials(i.title)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[14.5px] ${i.unread ? 'font-semibold' : 'font-medium'}`}>{i.title}</span>
                        <span className="shrink-0 text-[11.5px] text-subtle">{when(i.at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-muted">{i.preview || 'Xabar yo‘q'}</span>
                        {i.unread ? (
                          <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">{i.unread}</span>
                        ) : i.flag ? (
                          <span className="shrink-0 rounded-full bg-warning-soft px-2 text-[11px] font-medium text-warning">{i.flag}</span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className={`min-h-0 flex-col lg:flex ${selected ? 'flex' : 'hidden'}`}>
          {room ? (
            <>
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Link href={base} className="grid size-9 place-items-center rounded-lg hover:bg-surface-2 lg:hidden" aria-label="Ro‘yxatga qaytish">
                  <Icon name="arrowLeft" size={18} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{room.title}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {room.kind === 'direct'
                      ? (() => {
                          const peer = room.members.find((m) => m.id !== context.userId);
                          return peer && isOnline(peer.lastSeen) ? <span className="font-medium text-success">● Online</span> : `Oxirgi faollik: ${lastSeenLabel(peer?.lastSeen)}`;
                        })()
                      : `${room.subtitle} · ${room.members.filter((m) => isOnline(m.lastSeen)).length} online · ${room.members.map((m) => m.name).slice(0, 5).join(', ')}${room.members.length > 5 ? '…' : ''}`}
                  </p>
                </div>
                {room.clientId && mode !== 'staff' ? (
                  <Link href={`/clients/${room.clientId}`} className="shrink-0 text-[13px] font-medium text-muted hover:text-ink">
                    Mijoz sahifasi →
                  </Link>
                ) : null}
              </header>
              <div className="min-h-0 flex-1">
                <ChatRoom
                  roomId={room.id}
                  me={context.userId}
                  members={room.members}
                  direct={room.kind === 'direct'}
                  messages={messages}
                  olderHref={older}
                  readOnly={!room.isMember}
                  readOnlyReason={observeAll ? 'Siz bu chatni faqat kuzatasiz — yozish uchun mijoz jamoasiga qo‘shilishingiz kerak.' : undefined}
                  live={!before}
                />
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <Icon name="message" size={32} className="mx-auto mb-3 text-subtle" />
                <p className="font-medium">Suhbatni tanlang</p>
                <p className="mt-1 text-sm text-muted">Chapdagi ro‘yxatdan chatni oching.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
