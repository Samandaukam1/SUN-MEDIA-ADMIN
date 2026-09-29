import Link from 'next/link';

import { buttonClass } from '@/components/ui/Button';
import { addMonthsToKey, formatMonthKey } from '@/lib/time';

/** ← Sentabr 2026 → as links (?month=YYYY-MM-01). */
export function MonthPicker({ path, month, current }: { path: string; month: string; current: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`${path}?month=${addMonthsToKey(month, -1)}`} className={buttonClass('secondary')} aria-label="Oldingi oy">
        ←
      </Link>
      <span className="min-w-36 text-center font-semibold">{formatMonthKey(month)}</span>
      {month < current ? (
        <Link href={`${path}?month=${addMonthsToKey(month, 1)}`} className={buttonClass('secondary')} aria-label="Keyingi oy">
          →
        </Link>
      ) : (
        <span className="w-10" />
      )}
    </div>
  );
}
