'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** While a job runs: re-read the page every few seconds (the server does the work, not this tab). */
export function AutoRefresh({ active, seconds = 8 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === 'visible' && router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
