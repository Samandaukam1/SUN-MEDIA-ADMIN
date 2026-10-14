'use client';

import { useSyncExternalStore } from 'react';

import { Icon } from '@/components/ui/Icon';
import { formatMoney } from '@/lib/labels';

// One switch for every amount on the screen, remembered in this browser only. The value itself never changes.
const KEY = 'sunmedia.hideMoney';
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function toggle() {
  try {
    localStorage.setItem(KEY, read() ? '0' : '1');
  } catch {
    /* private mode: still switches for this page via the listeners below */
  }
  listeners.forEach((fn) => fn());
}

export function useMoneyHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** An amount with its eye: 6 500 000 so‘m ⇄ ••••••••. */
export function Money({ amount, currency = 'UZS', className = '', empty = 'Belgilanmagan' }: { amount: number | string | null | undefined; currency?: string; className?: string; empty?: string }) {
  const hidden = useMoneyHidden();
  if (amount == null || amount === '') return <span className={`${className} font-normal text-subtle`}>{empty}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="tabular">{hidden ? '••••••••' : formatMoney(amount, currency)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        aria-label={hidden ? 'Summani ko‘rsatish' : 'Summani yashirish'}
        aria-pressed={hidden}
        className="grid size-6 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-ink"
      >
        <Icon name={hidden ? 'eyeOff' : 'eye'} size={14} />
      </button>
    </span>
  );
}
