'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Notice } from '@/components/ui/Notice';
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
};

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
                {[row.job_title, row.arrived_at ? `keldi ${row.arrived_at.slice(0, 5)}` : `ish ${row.work_start_time.slice(0, 5)} da`, row.late_minutes ? `${row.late_minutes} daq kechikdi` : null, row.note]
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
          </div>
        ))}
      </Card>

      {lateFor ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal aria-labelledby="late-title" onClick={() => setLateFor(null)}>
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p id="late-title" className="text-lg font-semibold">
              {lateFor.full_name} qachon keldi?
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
