'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppBadge } from '@/components/pwa/AppBadge';
import { getBrowserClient } from '@/lib/supabase/client';

type Item = { id: string; title: string; body: string | null; created_at: string; read_at: string | null; data: Record<string, unknown> | null };

const TZ = 'Asia/Tashkent';
const when = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** Where a notification leads on the web: its own link, or the app route translated to this area's page. */
function hrefOf(item: Item, area: 'panel' | 'staff'): string | null {
  const d = item.data ?? {};
  const own = area === 'staff' ? d.staff_href : d.href;
  if (typeof own === 'string' && own.startsWith('/')) return own;
  const route = typeof d.route === 'string' ? d.route : '';
  const m = route.match(/^\/(tasks?|content|shootings|chat)\/([0-9a-f-]{36})/);
  if (!m) return area === 'staff' ? '/xodim' : null;
  const [, kind, id] = m;
  if (area === 'staff') return kind.startsWith('task') ? `/xodim/vazifa/${id}` : '/xodim';
  if (kind.startsWith('task')) return `/work/tasks/${id}`;
  if (kind === 'content') return `/work/content/${id}`;
  if (kind === 'shootings') return `/work/shootings/${id}`;
  return `/chat?xona=${id}`;
}

/**
 * The bell: the person's own notifications (row-level security), live through their private realtime topic,
 * unread ones marked, a click opens the related task and marks it read.
 */
export function NotificationBell({ userId, area, tone = 'panel' }: { userId: string; area: 'panel' | 'staff'; tone?: 'panel' | 'dark' }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const [list, count] = await Promise.all([
      supabase.from('notifications').select('id, title, body, created_at, read_at, data').order('created_at', { ascending: false }).limit(30),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    if (list.data) setItems(list.data as Item[]);
    setUnread(count.count ?? 0);
  }, []);

  useEffect(() => {
    void load();
    const supabase = getBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on('broadcast', { event: 'change' }, ({ payload }) => {
          if ((payload as { table?: string })?.table !== 'notifications') return;
          void load();
          window.dispatchEvent(new Event('sm:badge'));
        })
        .subscribe();
    });
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    setItems((list) => list.map((i) => (ids.includes(i.id) ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i)));
    setUnread((n) => Math.max(0, n - ids.length));
    await getBrowserClient().rpc('mark_notifications_read', { p_ids: ids });
    window.dispatchEvent(new Event('sm:badge'));
  };

  const openItem = async (item: Item) => {
    if (!item.read_at) await markRead([item.id]);
    setOpen(false);
    const href = hrefOf(item, area);
    if (href) router.push(href);
  };

  const dark = tone === 'dark';
  const settingsHref = area === 'staff' ? '/xodim/bildirishnomalar' : '/profil#bildirishnomalar';
  return (
    <div ref={box} className="relative">
      <AppBadge />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Bildirishnomalar: ${unread} ta o‘qilmagan` : 'Bildirishnomalar'}
        aria-expanded={open}
        className={
          dark
            ? 'lg relative grid size-10 shrink-0 place-items-center rounded-full text-[#d9d9de] transition-colors hover:text-[#d4fc18]'
            : 'relative grid size-10 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-2'
        }
      >
        <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread ? (
          <span className={`absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold ${dark ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-danger text-white'}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`absolute top-full right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border shadow-2xl ${
            dark ? 'border-white/10 bg-[#0d0d0f] text-white' : 'border-line bg-surface text-ink'
          }`}
        >
          <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? 'border-white/10' : 'border-line'}`}>
            <p className="text-sm font-semibold">Bildirishnomalar</p>
            {unread ? (
              <button type="button" onClick={() => void markRead(items.filter((i) => !i.read_at).map((i) => i.id))} className={`text-[12.5px] font-medium ${dark ? 'text-[#d4fc18]' : 'text-accent'}`}>
                Hammasini o‘qildi deb belgilash
              </button>
            ) : null}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? <li className={`px-4 py-8 text-center text-sm ${dark ? 'text-[#8e8e96]' : 'text-muted'}`}>Hozircha bildirishnoma yo‘q</li> : null}
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => void openItem(i)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${dark ? 'hover:bg-white/[0.04]' : 'hover:bg-surface-2'} ${!i.read_at ? (dark ? 'bg-[#d4fc18]/[0.04]' : 'bg-accent-soft/40') : ''}`}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.read_at ? 'bg-transparent' : dark ? 'bg-[#d4fc18]' : 'bg-accent'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-snug font-semibold">{i.title}</span>
                    {i.body ? <span className={`mt-0.5 block text-[12.5px] leading-snug ${dark ? 'text-[#a8a8ac]' : 'text-muted'}`}>{i.body}</span> : null}
                    <span className={`mt-1 block text-[11.5px] ${dark ? 'text-[#6e6e76]' : 'text-subtle'}`}>
                      {when.format(new Date(i.created_at))} · {i.read_at ? 'O‘qilgan' : 'Yangi'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <a
            href={settingsHref}
            onClick={() => setOpen(false)}
            className={`block border-t px-4 py-3 text-center text-[12.5px] font-medium ${dark ? 'border-white/10 text-[#a8a8ac] hover:text-[#d4fc18]' : 'border-line text-muted hover:text-ink'}`}
          >
            Bildirishnoma sozlamalari va push
          </a>
        </div>
      ) : null}
    </div>
  );
}
