'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listenTopic } from '@/lib/realtime/topic';

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
    const offs = topicsKey.split('|').map((topic) => listenTopic(topic, 'change', () => refresh(400), setConnected));
    const interval = setInterval(() => refresh(0), intervalMs);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      offs.forEach((off) => off());
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
