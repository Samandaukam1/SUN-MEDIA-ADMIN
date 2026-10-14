'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { checkIn } from '@/lib/cabinet/employee-actions';

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' });

/**
 * "KELDIM": opens at the configured time (09:45 Tashkent). The clock shown follows the server's, so a wrong phone
 * clock neither opens nor blocks it early; the server checks again and stores its own time.
 */
export function CheckInCard({
  record,
  from,
  workStart,
  serverNow,
}: {
  record: { arrivedAt: string | null; status: string; lateMinutes: number } | null;
  from: string;
  workStart: string | null;
  serverNow: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [now, setNow] = useState(() => clock.format(new Date(Date.now() + offset)));
  useEffect(() => {
    const t = setInterval(() => setNow(clock.format(new Date(Date.now() + offset))), 15_000);
    return () => clearInterval(t);
  }, [offset]);
  const open = now >= from;

  if (record) {
    const late = record.status === 'late' && record.lateMinutes > 0;
    const marked = record.arrivedAt?.slice(0, 5);
    return (
      <div id="davomat" className="lg flex flex-wrap items-center gap-4 rounded-[22px] p-4 sm:p-5">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full text-[20px] ${late ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>✓</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white">{marked ? `Bugun ${marked} da keldingiz` : 'Bugungi davomatingiz belgilangan'}</p>
          <p className={`mt-0.5 text-[13px] ${late ? 'text-amber-300' : 'text-[#a8a8ac]'}`}>
            {late ? `${record.lateMinutes} daqiqa kechikdingiz` : 'O‘z vaqtida'}
            {workStart ? ` · ish boshlanishi ${workStart.slice(0, 5)}` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="davomat" className="lg flex flex-wrap items-center gap-4 rounded-[22px] p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-white">Bugungi davomat</p>
        <p className="mt-0.5 text-[13px] text-[#a8a8ac]">
          {open ? 'Ishga kelgan bo‘lsangiz, belgilang.' : `Kelganingizni ${from} dan boshlab belgilashingiz mumkin.`}
          {workStart ? ` Ish boshlanishi: ${workStart.slice(0, 5)}.` : ''} Hozir {now}.
        </p>
        {error ? <p className="mt-1 text-[13px] text-[#ff8a8a]">{error}</p> : null}
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
        className="s-btn s-btn-lime s-btn-shine relative h-12 min-w-36 px-7 text-[15px] font-bold tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        KELDIM
      </button>
    </div>
  );
}
