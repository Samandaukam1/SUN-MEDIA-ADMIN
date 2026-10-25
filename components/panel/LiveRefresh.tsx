'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Re-renders the current server page when a realtime change signal arrives on any of the topics
 * (debounced), and on an interval for time-driven state such as overdue tasks. A tab in the background
 * does not re-render; it catches up with one render as soon as it is shown again.
 */
export function LiveRefresh({ topics, intervalMs = 60_000, quiet = false }: { topics: string[]; intervalMs?: number; quiet?: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const topicsKey = topics.join('|');

  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let missed = false;
    const refresh = (delayMs: number) => {
      if (document.hidden) {
        missed = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), delayMs);
    };
    const onVisible = () => {
      if (document.hidden || !missed) return;
      missed = false;
      refresh(0);
    };
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channels = topicsKey.split('|').map((topic) =>
        supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'change' }, () => refresh(400))
          .subscribe((status) => setConnected(status === 'SUBSCRIBED')),
      );
    });
    const interval = setInterval(() => refresh(0), intervalMs);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [topicsKey, intervalMs, router]);

  if (quiet) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-subtle" aria-live="polite">
      <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-subtle'}`} aria-hidden />
      {connected ? 'Real vaqt' : 'Ulanmoqda…'}
    </span>
  );
}
