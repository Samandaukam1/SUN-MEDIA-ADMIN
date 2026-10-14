'use client';

import { useEffect } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Keeps "online" honest: while the page is open and visible, the server's last_seen_at is touched every minute.
 * Closing the browser simply stops the beat; after two quiet minutes the person shows as offline.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = getBrowserClient();
    const beat = () => {
      if (document.visibilityState === 'visible') void supabase.rpc('touch_last_seen').then(() => undefined, () => undefined);
    };
    beat();
    const timer = setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);
  return null;
}
