'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Notice } from '@/components/ui/Notice';
import { reportAttendanceError, resolveAttendanceAlert } from '@/lib/actions/team';
import { markAllPresentAction, markAttendanceAction } from '@/lib/actions/work';
import type { Database } from '@/types/database';

type Status = Database['public']['Enums']['attendance_status'];
export type RosterRow = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  work_start_time: string;
  status: Status | null;
  arrived_at: string | null;
  late_minutes: number | null;
  note: string | null;
  attendance_id?: string | null;
  marked_by_name?: string | null;
  /** An open "Davomat xatomi?" alert on this record. */
  alert?: { id: string; note: string | null } | null;
};

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
          <span className="ml-auto flex gap-1.5">
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

const MARKS: { status: Status; label: string }[] = [
  { status: 'present', label: 'Keldi' },
  { status: 'late', label: 'Kechikdi' },
  { status: 'absent', label: 'Kelmadi' },
  { status: 'excused', label: 'Sababli' },
  { status: 'vacation', label: 'Ta’til' },
  { status: 'remote', label: 'Masofadan' },
];

const ACTIVE: Record<Status, string> = {
  present: 'border-success bg-success text-white',
  late: 'border-warning bg-warning text-white',
  absent: 'border-danger bg-danger text-white',
  excused: 'border-info bg-info text-white',
  vacation: 'border-violet bg-violet text-white',
  remote: 'border-ink bg-ink text-bg',
};

/** Office attendance in one screen: a button per status next to every person; each click saves at once. */
export function AttendanceBoard({ rows, date, isToday, canMark }: { rows: RosterRow[]; date: string; isToday: boolean; canMark: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lateFor, setLateFor] = useState<RosterRow | null>(null);
  const [lateTime, setLateTime] = useState('');
  const unmarked = rows.filter((r) => !r.status);

  const run = (key: string, job: () => Promise<{ status: string; message?: string }>) => {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await job();
      if (result.status === 'error') setError(result.message ?? 'Saqlab bo‘lmadi. Qayta urinib ko‘ring.');
      router.refresh();
      setBusy(null);
    });
  };

  const mark = (row: RosterRow, status: Status) => {
    if (status === 'late') {
      const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      setLateTime(row.arrived_at?.slice(0, 5) ?? (isToday ? now : row.work_start_time.slice(0, 5)));
      setLateFor(row);
      return;
    }
    run(`${row.user_id}:${status}`, () => markAttendanceAction({ userId: row.user_id, date, status, arrivedAt: status === 'present' ? row.work_start_time.slice(0, 5) : null, note: row.note }));
  };

  return (
    <div className="space-y-4">
      {error ? <Notice tone="danger" title={error} /> : null}
      {canMark && unmarked.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
          <p className="flex-1 text-sm">
            <span className="font-semibold">{unmarked.length} kishi</span> hali belgilanmagan. Hammasi o‘z vaqtida kelgan bo‘lsa — bir bosishda belgilang, keyin kechikkanlarni to‘g‘rilang.
          </p>
          <Button loading={busy === 'all'} disabled={pending} onClick={() => run('all', () => markAllPresentAction({ userIds: unmarked.map((r) => r.user_id), date }))}>
            Qolganlar — Keldi
          </Button>
        </div>
      ) : null}

      <Card className="divide-y divide-line p-0">
        {rows.map((row) => (
          <div key={row.user_id} className="flex flex-wrap items-center gap-4 px-5 py-3">
            <Avatar name={row.full_name} url={row.avatar_url} size={36} />
            <div className="min-w-48 flex-1">
              <p className="font-medium">{row.full_name}</p>
              <p className="text-[13px] text-muted">
                {[
                  row.job_title,
                  row.arrived_at ? `keldi ${row.arrived_at.slice(0, 5)}` : `ish ${row.work_start_time.slice(0, 5)} da`,
                  row.late_minutes ? `${row.late_minutes} daq kechikdi` : null,
                  row.arrived_at && row.marked_by_name ? (row.marked_by_name === row.full_name ? '“Keldim” — o‘zi belgiladi' : `belgiladi: ${row.marked_by_name}`) : null,
                  row.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${row.full_name} davomati`}>
              {MARKS.map((m) => {
                const on = row.status === m.status;
                return (
                  <button
                    key={m.status}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canMark || pending}
                    onClick={() => mark(row, m.status)}
                    className={cn(
                      'h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:cursor-default',
                      on ? ACTIVE[m.status] : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                      busy === `${row.user_id}:${m.status}` && 'opacity-60',
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <AlertControls row={row} canMark={canMark} />
          </div>
        ))}
      </Card>

      {lateFor ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal aria-labelledby="late-title" onClick={() => setLateFor(null)}>
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p id="late-title" className="text-lg font-semibold">
              {lateFor.full_name} qachon keldi? (tuzatish)
            </p>
            <input type="time" value={lateTime} onChange={(e) => setLateTime(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-[15px]" aria-label="Kelgan vaqti" />
            <p className="text-[13px] text-muted">Ish {lateFor.work_start_time.slice(0, 5)} da boshlanadi. Kechikish daqiqasi o‘zi hisoblanadi.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLateFor(null)}>
                Bekor qilish
              </Button>
              <Button
                onClick={() => {
                  const row = lateFor;
                  setLateFor(null);
                  run(`${row.user_id}:late`, () => markAttendanceAction({ userId: row.user_id, date, status: 'late', arrivedAt: lateTime || null, note: row.note }));
                }}
              >
                Saqlash
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
