'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Re-renders the current server page when a realtime change signal arrives on any of the topics
 * (debounced), and on an interval for time-driven state such as overdue tasks.
 */
export function LiveRefresh({ topics, intervalMs = 60_000 }: { topics: string[]; intervalMs?: number }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const topicsKey = topics.join('|');

  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channels = topicsKey.split('|').map((topic) =>
        supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'change' }, refresh)
          .subscribe((status) => setConnected(status === 'SUBSCRIBED')),
      );
    });
    const interval = setInterval(() => router.refresh(), intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [topicsKey, intervalMs, router]);

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-subtle" aria-live="polite">
      <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-subtle'}`} aria-hidden />
      {connected ? 'Real vaqt' : 'Ulanmoqda…'}
    </span>
  );
}
