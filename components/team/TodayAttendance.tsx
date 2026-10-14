'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { cn } from '@/components/ui/cn';
import { agencyNowTime, agencyToday, dayState, type DayRow, type DayStateKey } from '@/lib/attendance';

type Row = DayRow & { user_id: string; full_name: string };

const DOT: Record<string, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info', violet: 'bg-violet', neutral: 'bg-line-strong' };
const ORDER: DayStateKey[] = ['present', 'late', 'remote', 'waiting', 'unconfirmed', 'absent', 'excused', 'vacation', 'dayoff'];

/** BUGUNGI DAVOMAT on the panel's home: who pressed KELDIM and when, who has not yet, who did not by the end of the day. */
export function TodayAttendance({ rows, date }: { rows: Row[]; date: string }) {
  const [now, setNow] = useState(() => agencyNowTime());
  const [today, setToday] = useState(() => agencyToday());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(agencyNowTime());
      setToday(agencyToday());
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  const list = rows
    .map((r) => ({ r, s: dayState(r, date, today, now) }))
    .filter((x) => x.s.key !== 'dayoff')
    .sort((a, b) => ORDER.indexOf(a.s.key) - ORDER.indexOf(b.s.key) || (a.r.arrived_at ?? '').localeCompare(b.r.arrived_at ?? '') || a.r.full_name.localeCompare(b.r.full_name));
  const came = list.filter((x) => ['present', 'late', 'remote'].includes(x.s.key)).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <p className="text-[11.5px] font-semibold tracking-[0.18em] text-subtle uppercase">Bugungi davomat</p>
        <Link href="/team/attendance" className="text-[12.5px] font-medium text-muted hover:text-ink">
          {came} / {list.length} keldi →
        </Link>
      </div>
      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
        {list.map(({ r, s }) => (
          <li key={r.user_id} className="flex items-center gap-3 px-5 py-2.5">
            <span className={cn('size-2 shrink-0 rounded-full', DOT[s.tone])} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.full_name}</span>
            <span className={cn('shrink-0 text-right text-[12.5px]', s.key === 'present' ? 'text-success' : s.key === 'late' ? 'text-warning' : s.key === 'unconfirmed' || s.key === 'absent' ? 'text-danger' : 'text-muted')}>
              {s.key === 'present' || s.key === 'late' ? `✓ ${s.label}` : s.key === 'waiting' ? `○ ${s.label}` : s.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
