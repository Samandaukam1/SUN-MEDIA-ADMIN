'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { isOnline, lastSeenLabel } from '@/lib/presence';
import { getBrowserClient } from '@/lib/supabase/client';

export type TeamListMember = { id: string; name: string; title: string; lastSeen: string | null };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/**
 * "SUN MEDIA TEAM": every colleague's full name, who is online now and when the others were last here. Compact
 * (scrolls when the team is large) and refreshed every minute from the server.
 */
export function TeamList({ members: initial, me, tone = 'panel' }: { members: TeamListMember[]; me?: string; tone?: 'panel' | 'dark' }) {
  const reduce = useReducedMotion();
  const [members, setMembers] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const supabase = getBrowserClient();
    const refresh = async () => {
      const { data } = await supabase.from('profiles').select('id, last_seen_at').in('id', initial.map((m) => m.id));
      if (data) {
        const seen = new Map(data.map((d) => [d.id, d.last_seen_at]));
        setMembers((list) => list.map((m) => ({ ...m, lastSeen: seen.get(m.id) ?? m.lastSeen })));
      }
      setNow(Date.now());
    };
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [initial]);

  const dark = tone === 'dark';
  const online = members.filter((m) => isOnline(m.lastSeen, now)).length;
  const sorted = [...members].sort((a, b) => Number(isOnline(b.lastSeen, now)) - Number(isOnline(a.lastSeen, now)));

  return (
    <section
      aria-label="SUN MEDIA jamoasi"
      className={dark ? 'lg overflow-hidden rounded-[24px]' : 'overflow-hidden rounded-2xl border border-line bg-surface'}
    >
      <div className={`flex items-baseline justify-between gap-3 px-5 pt-4 pb-3 ${dark ? '' : 'border-b border-line'}`}>
        <p className={`text-[11.5px] font-semibold tracking-[0.18em] uppercase ${dark ? 'text-[#d4fc18]' : 'text-subtle'}`}>SUN MEDIA team</p>
        <p className={`text-[12px] ${dark ? 'text-[#8e8e96]' : 'text-muted'}`}>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-400 align-middle" />
          {online} online · {members.length} kishi
        </p>
      </div>
      <ul className="max-h-[360px] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {sorted.map((m, i) => {
          const on = isOnline(m.lastSeen, now);
          return (
            <motion.li
              key={m.id}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${dark ? 'hover:bg-white/[0.03]' : 'hover:bg-surface-2'}`}
            >
              <span className="relative shrink-0">
                <span
                  className={`grid size-9 place-items-center rounded-full text-[12px] font-bold ${
                    dark ? 'bg-white/[0.07] text-[#e4e4e7]' : 'bg-surface-2 text-ink'
                  } ${m.id === me ? (dark ? 'ring-1 ring-[#d4fc18]/60' : 'ring-1 ring-accent') : ''}`}
                >
                  {initials(m.name)}
                </span>
                <span
                  className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 ${dark ? 'border-[#0b0b0c]' : 'border-surface'} ${on ? 'bg-emerald-400' : dark ? 'bg-[#3a3a3e]' : 'bg-line-strong'}`}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] font-semibold ${dark ? 'text-white' : ''}`}>
                  {m.name}
                  {m.id === me ? <span className={`ml-1.5 text-[11px] font-medium ${dark ? 'text-[#d4fc18]' : 'text-accent'}`}>siz</span> : null}
                </span>
                <span className={`block truncate text-[12px] ${dark ? 'text-[#8e8e96]' : 'text-muted'}`}>
                  {on ? <span className="font-medium text-emerald-400">● Online</span> : `Oxirgi faollik: ${lastSeenLabel(m.lastSeen, now)}`}
                  {' · '}
                  {m.title}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
