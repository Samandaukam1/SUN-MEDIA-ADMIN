'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { agencyNowTime, agencyToday, lateLabel } from '@/lib/attendance';
import { checkIn } from '@/lib/cabinet/employee-actions';

export type CheckInRecord = { arrivedAt: string | null; status: string; lateMinutes: number; source: string | null; correctedBy: string | null };

/**
 * BUGUNGI DAVOMAT — the employee's own KELDIM. The clock follows the server's (a wrong phone clock neither opens nor
 * blocks it early) and the server stores its own time. The button opens at the configured time (09:45 Tashkent)
 * without a reload, and a new day brings it back by itself: the record comes from the database for today's date.
 */
export function CheckInCard({
  record,
  from,
  workStart,
  serverNow,
  today,
  name,
  tone = 'dark',
}: {
  record: CheckInRecord | null;
  from: string;
  workStart: string | null;
  serverNow: string;
  today: string;
  name?: string;
  tone?: 'dark' | 'panel';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const serverClock = () => new Date(Date.now() + offset);
  const [now, setNow] = useState(() => agencyNowTime(serverClock()));

  useEffect(() => {
    const tick = () => {
      const at = serverClock();
      setNow(agencyNowTime(at));
      // Midnight in Tashkent: today's record (or none) is read again from the database.
      if (agencyToday(at) !== today) router.refresh();
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, today, router]);

  const open = now >= from;
  const dark = tone === 'dark';
  const shell = dark
    ? 'lg relative overflow-hidden rounded-[28px] p-5 sm:p-7'
    : 'relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-6';
  const muted = dark ? 'text-[#a8a8ac]' : 'text-muted';

  if (record) {
    const late = record.status === 'late' && record.lateMinutes > 0;
    const marked = record.arrivedAt?.slice(0, 5);
    const label =
      record.status === 'vacation' ? 'Bugun ta’tildasiz' : record.status === 'excused' ? 'Bugun ruxsatli kuningiz' : record.status === 'absent' ? 'Bugun “kelmagan” deb belgilangan' : null;
    return (
      <section id="davomat" aria-label="Bugungi davomat" className={shell}>
        <p className={`text-[11.5px] font-semibold tracking-[0.18em] uppercase ${dark ? 'text-[#d4fc18]' : 'text-subtle'}`}>Bugungi davomat</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-full text-[24px] ${late ? 'bg-amber-400/15 text-amber-400' : 'bg-emerald-400/15 text-emerald-400'}`}>✓</span>
          <div className="min-w-0 flex-1">
            <p className={`text-[18px] font-semibold sm:text-[20px] ${dark ? 'text-white' : ''}`}>{label ?? (record.source === 'self' ? 'Bugungi davomat tasdiqlandi' : 'Bugungi davomat belgilangan')}</p>
            {marked ? (
              <p className={`mt-0.5 text-[14px] ${muted}`}>
                Kelgan vaqt: <span className={`font-semibold tabular-nums ${dark ? 'text-white' : 'text-ink'}`}>{marked}</span>
                {late ? <span className="text-amber-400"> · {lateLabel(record.lateMinutes)} kechikdingiz</span> : <span className="text-emerald-400"> · o‘z vaqtida</span>}
                {workStart ? ` · ish boshlanishi ${workStart.slice(0, 5)}` : ''}
              </p>
            ) : null}
            {record.correctedBy ? <p className={`mt-0.5 text-[12.5px] ${muted}`}>Tuzatdi: {record.correctedBy}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="davomat" aria-label="Bugungi davomat" className={`${shell} ${dark ? 'ring-1 ring-[#d4fc18]/30' : 'ring-1 ring-accent/30'}`}>
      {dark ? <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.18),transparent_65%)]" /> : null}
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className={`text-[11.5px] font-semibold tracking-[0.18em] uppercase ${dark ? 'text-[#d4fc18]' : 'text-subtle'}`}>Bugungi davomat</p>
          <p className={`mt-2 text-[20px] leading-snug font-semibold sm:text-[24px] ${dark ? 'font-display text-white' : ''}`}>
            Assalomu alaykum{name ? `, ${name}` : ''}!
          </p>
          <p className={`mt-1 text-[14.5px] ${muted}`}>
            {open ? 'Bugun ishga kelganingizni tasdiqlang.' : `Keldim tugmasi ${from} da ochiladi.`}
            {workStart ? ` Ish boshlanishi: ${workStart.slice(0, 5)}.` : ''}
            <span className="tabular-nums"> Hozir {now}.</span>
          </p>
          {error ? <p className="mt-2 text-[13px] text-[#ff8a8a]">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={!open || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await checkIn();
              if (!res.ok) setError(res.message);
              router.refresh();
            })
          }
          className={
            dark
              ? 's-btn s-btn-lime s-btn-shine relative h-16 w-full px-10 text-[18px] font-bold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto'
              : 'relative h-14 w-full rounded-2xl bg-brand px-10 text-[17px] font-bold tracking-[0.08em] text-on-brand transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto'
          }
        >
          {pending ? <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> : null}
          KELDIM
        </button>
      </div>
    </section>
  );
}
