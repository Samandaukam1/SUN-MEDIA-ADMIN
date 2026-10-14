'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Notice } from '@/components/ui/Notice';
import { reportAttendanceError, resolveAttendanceAlert } from '@/lib/actions/team';
import { markAttendanceAction } from '@/lib/actions/work';
import { agencyNowTime, agencyToday, dayState, lateLabel, sourceLabel, type DayStateKey } from '@/lib/attendance';
import type { Database } from '@/types/database';

type Status = Database['public']['Enums']['attendance_status'];
export type RosterRow = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  work_start_time: string;
  work_end_time?: string | null;
  scheduled?: boolean | null;
  status: Status | null;
  arrived_at: string | null;
  late_minutes: number | null;
  note: string | null;
  attendance_id?: string | null;
  marked_by_name?: string | null;
  source?: string | null;
  corrected_by_name?: string | null;
  corrected_at?: string | null;
  correction_note?: string | null;
  /** An open "Davomat xatomi?" alert on this record. */
  alert?: { id: string; note: string | null } | null;
};

const CORRECT: { status: Status; label: string; time?: boolean }[] = [
  { status: 'late', label: 'Keldi (vaqt bilan)', time: true },
  { status: 'remote', label: 'Masofadan ishladi' },
  { status: 'vacation', label: 'Ta’til' },
  { status: 'excused', label: 'Ruxsatli / dam olish' },
  { status: 'absent', label: 'Kelmagan' },
];

/** The Rahbar flags a record (everyone is told to check it), then closes the alert with a correction note or dismisses it. */
function AlertControls({ row, canMark }: { row: RosterRow; canMark: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!row.attendance_id) return null;
  const go = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.message ?? 'Xatolik.');
      setOpen(false);
      setNote('');
      router.refresh();
    });
  if (row.alert) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px]">
        <span className="font-semibold text-warning">⚠ Davomat xatosi tekshirilmoqda</span>
        {row.alert.note ? <span className="text-muted">— {row.alert.note}</span> : null}
        {canMark ? (
          <span className="ml-auto flex flex-wrap gap-1.5">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nima tuzatildi?" aria-label="Tuzatish izohi" className="h-8 w-44 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-accent" />
            <Button size="md" className="h-8" loading={pending} onClick={() => go(() => resolveAttendanceAlert(row.alert!.id, note, false))}>
              Tuzatildi
            </Button>
            <Button size="md" variant="ghost" className="h-8" disabled={pending} onClick={() => go(() => resolveAttendanceAlert(row.alert!.id, note, true))}>
              Xato emas
            </Button>
          </span>
        ) : null}
        {error ? <span className="w-full text-danger">{error}</span> : null}
      </div>
    );
  }
  if (!canMark) return null;
  return open ? (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nima noto‘g‘ri? (ixtiyoriy)" aria-label="Xato tavsifi" className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-accent" />
      <Button size="md" className="h-8" variant="danger" loading={pending} onClick={() => go(() => reportAttendanceError(row.attendance_id!, note))}>
        Barchaga xabar berish
      </Button>
      <Button size="md" className="h-8" variant="ghost" onClick={() => setOpen(false)}>
        Bekor
      </Button>
      {error ? <span className="w-full text-[13px] text-danger">{error}</span> : null}
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-muted underline-offset-2 hover:text-danger hover:underline">
      Davomat xatomi?
    </button>
  );
}

/** Correction dialog: a status, the real arrival time and the reason — recorded as a correction, not a KELDIM. */
function CorrectDialog({ row, date, onClose }: { row: RosterRow; date: string; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(row.status === 'present' ? 'late' : (row.status ?? 'late'));
  const [time, setTime] = useState(row.arrived_at?.slice(0, 5) ?? row.work_start_time.slice(0, 5));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const withTime = CORRECT.find((c) => c.status === status)?.time;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal aria-labelledby="correct-title" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <p id="correct-title" className="text-lg font-semibold">
            {row.full_name} — davomatni tuzatish
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Bu xodimning “KELDIM”i emas, Rahbar tuzatishi sifatida saqlanadi. Ish vaqti {row.work_start_time.slice(0, 5)}–{row.work_end_time?.slice(0, 5) ?? '18:00'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CORRECT.map((c) => (
            <button
              key={c.status}
              type="button"
              aria-pressed={status === c.status}
              onClick={() => setStatus(c.status)}
              className={cn('h-9 rounded-lg border px-3 text-[13px] font-medium', status === c.status ? 'border-accent bg-accent-soft text-accent-on-soft' : 'border-line text-muted hover:text-ink')}
            >
              {c.label}
            </button>
          ))}
        </div>
        {withTime ? (
          <label className="block text-[13px] text-muted">
            Haqiqiy kelgan vaqti
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-4 text-[15px]" />
            <span className="mt-1 block text-[12px] text-subtle">Kechikish shu xodimning ish boshlash vaqtiga qarab o‘zi hisoblanadi.</span>
          </label>
        ) : null}
        <label className="block text-[13px] text-muted">
          Sabab {status === 'vacation' || status === 'excused' ? '(ixtiyoriy)' : ''}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Masalan: kartadan tekshirildi" className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-4 text-[14px]" />
        </label>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await markAttendanceAction({ userId: row.user_id, date, status, arrivedAt: withTime ? time : null, note });
                if (res.status === 'error') return setError(res.message ?? 'Saqlab bo‘lmadi.');
                onClose();
                router.refresh();
              })
            }
          >
            Saqlash
          </Button>
        </div>
      </div>
    </div>
  );
}

const TONE_BG: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
  neutral: 'bg-line-strong',
};

/**
 * Today's attendance as the Rahbar sees it: every employee presses KELDIM themselves; here are the arrivals, the
 * schedule, the lateness, who is still to confirm and who did not confirm by the end of their day. Corrections and
 * error alerts sit beside each person. Live: a new KELDIM appears without reloading (realtime refresh of the page).
 */
export function AttendanceBoard({ rows, date, canMark }: { rows: RosterRow[]; date: string; isToday: boolean; canMark: boolean }) {
  const [correcting, setCorrecting] = useState<RosterRow | null>(null);
  const [today, setToday] = useState(() => agencyToday());
  const [now, setNow] = useState(() => agencyNowTime());
  useEffect(() => {
    const t = setInterval(() => {
      setToday(agencyToday());
      setNow(agencyNowTime());
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  const states = rows.map((r) => ({ row: r, state: dayState(r, date, today, now) }));
  const count = (...keys: DayStateKey[]) => states.filter((s) => keys.includes(s.state.key)).length;
  const working = states.filter((s) => s.state.key !== 'dayoff');
  const stats = [
    { label: 'Jami xodimlar', value: working.length, tone: '' },
    { label: 'Bugun keldi', value: count('present', 'late', 'remote'), tone: 'text-success' },
    { label: 'Kechikdi', value: count('late'), tone: count('late') ? 'text-warning' : '' },
    { label: 'Hali belgilanmagan', value: count('waiting'), tone: '' },
    { label: 'Kelmagan', value: count('absent', 'unconfirmed'), tone: count('absent', 'unconfirmed') ? 'text-danger' : '' },
    { label: 'Ta’til / ruxsatli', value: count('vacation', 'excused'), tone: '' },
  ];
  const order: DayStateKey[] = ['unconfirmed', 'absent', 'waiting', 'late', 'present', 'remote', 'excused', 'vacation', 'dayoff'];
  const sorted = [...states].sort((a, b) => order.indexOf(a.state.key) - order.indexOf(b.state.key) || a.row.full_name.localeCompare(b.row.full_name));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1 py-4">
            <span className="text-[12.5px] text-muted">{s.label}</span>
            <span className={cn('tabular text-2xl font-bold', s.tone)}>{s.value}</span>
          </Card>
        ))}
      </div>
      {count('waiting') ? (
        <Notice tone="info" title={`${count('waiting')} xodim hali “KELDIM” bosmagan`}>
          Ish kuni tugaguncha ular “Hali belgilanmagan”. O‘z ish vaqti tugagach ham bosilmasa — “Kelmagan — davomat tasdiqlanmagan”.
        </Notice>
      ) : null}

      <Card className="divide-y divide-line p-0">
        {sorted.map(({ row, state }) => {
          const source = sourceLabel(row);
          return (
            <div key={row.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <Avatar name={row.full_name} url={row.avatar_url} size={38} />
              <div className="min-w-44 flex-1">
                <p className="font-medium">{row.full_name}</p>
                <p className="text-[12.5px] text-muted">
                  {[row.job_title, `Ish vaqti ${row.work_start_time.slice(0, 5)}–${row.work_end_time?.slice(0, 5) ?? '18:00'}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="min-w-40 text-right sm:text-left">
                <p className="tabular text-[15px] font-semibold">{row.arrived_at ? row.arrived_at.slice(0, 5) : '—'}</p>
                <p className="text-[12px] text-muted">{row.late_minutes ? `${lateLabel(row.late_minutes)} kechikdi` : row.arrived_at ? 'o‘z vaqtida' : 'kelgan vaqt'}</p>
              </div>
              <div className="flex min-w-52 flex-col gap-1">
                <span className="inline-flex items-center gap-2 text-[13.5px] font-medium">
                  <span className={cn('size-2 rounded-full', TONE_BG[state.tone])} aria-hidden />
                  {state.label}
                </span>
                {source ? (
                  <span className="text-[12px] text-muted" title={row.correction_note ?? undefined}>
                    {source}
                    {row.correction_note ? ` · ${row.correction_note}` : ''}
                  </span>
                ) : null}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {row.source === 'self' && !row.corrected_by_name ? <Badge tone="success">KELDIM</Badge> : null}
                {canMark && state.key !== 'dayoff' ? (
                  <Button variant="secondary" className="h-8 px-3 text-[12.5px]" onClick={() => setCorrecting(row)}>
                    Tuzatish
                  </Button>
                ) : null}
                <AlertControls row={row} canMark={canMark} />
              </div>
            </div>
          );
        })}
      </Card>
      {correcting ? <CorrectDialog row={correcting} date={date} onClose={() => setCorrecting(null)} /> : null}
    </div>
  );
}
