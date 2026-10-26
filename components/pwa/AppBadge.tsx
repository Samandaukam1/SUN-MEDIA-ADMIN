'use client';

import { useEffect } from 'react';

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/**
 * The number on the installed app's icon, kept equal to the server's count of unread items (it goes down as things
 * are read): refreshed when the app comes to the front, when a push arrives and every minute while it is open.
 * Renders nothing. Where the system has no badges (or the person turned them off) it simply does nothing.
 */
export function AppBadge() {
  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (!nav.setAppBadge) return;
    let stop = false;
    const sync = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/push/badge', { cache: 'no-store' });
        const { count } = (await res.json()) as { count?: number };
        if (stop) return;
        if (res.ok && count) await nav.setAppBadge?.(count);
        else await nav.clearAppBadge?.();
      } catch {
        // offline, or badges turned off
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 60_000);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('sm:push', sync);
    window.addEventListener('sm:badge', sync);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('sm:push', sync);
      window.removeEventListener('sm:badge', sync);
    };
  }, []);
  return null;
}
