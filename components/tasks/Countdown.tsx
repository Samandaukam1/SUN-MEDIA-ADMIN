'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { countdownText, remaining } from '@/lib/tasks/deadline';

// One clock for every countdown on the page: one interval, paused while the tab is hidden.
let offset = 0;
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const tick = () => {
  now = Date.now() + offset;
  listeners.forEach((l) => l());
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(() => document.visibilityState === 'visible' && tick(), 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * "Qolgan vaqt: 02:14:35" until the deadline, amber in the last 3 hours, "MUDDAT O‘TDI" after it. Computed in the
 * browser from the stored deadline (no polling); a phone clock that is clearly wrong is corrected by the server's.
 */
export function Countdown({ due, serverNow, tone = 'dark' }: { due: string | null; serverNow: string; tone?: 'dark' | 'panel' }) {
  useEffect(() => {
    const skew = Date.parse(serverNow) - Date.now();
    // Under half a minute is network delay, not a wrong clock.
    offset = Math.abs(skew) > 30_000 ? skew : 0;
    tick();
  }, [serverNow]);
  const at = useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
  const dark = tone === 'dark';
  if (!due) return <span className={`text-[12.5px] ${dark ? 'text-[#8e8e96]' : 'text-muted'}`}>Muddat belgilanmagan</span>;
  if (!at) return <span className="text-[12.5px] tabular-nums opacity-0">00:00:00</span>;
  const left = remaining(due, at);
  if (left.kind === 'over') return <span className={`text-[12.5px] font-bold tracking-wide ${dark ? 'text-[#ff9c9c]' : 'text-danger'}`}>MUDDAT O‘TDI</span>;
  if (left.kind !== 'left') return null;
  return (
    <span
      className={`text-[12.5px] tabular-nums ${left.soon ? (dark ? 'font-semibold text-amber-300' : 'font-semibold text-warning') : dark ? 'text-[#d9d9de]' : 'text-ink'}`}
    >
      Qolgan vaqt: {countdownText(left.ms)}
    </span>
  );
}
