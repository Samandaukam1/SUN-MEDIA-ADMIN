/** Deadlines, the task order on the employee home and "is KELDIM due now" — pure, no database (unit-tested). */

const pad = (n: number) => String(n).padStart(2, '0');

/** "02:14:35", or "3 kun 02:14:35" when days are left. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86_400);
  const clock = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days ? `${days} kun ${clock}` : clock;
}

export type Remaining = { kind: 'none' } | { kind: 'over' } | { kind: 'left'; ms: number; soon: boolean };

/** Time left until `due` (server-corrected `now`); "soon" inside the last `soonMs` (3 hours by default). */
export function remaining(due: string | null | undefined, now: number, soonMs = 3 * 3600_000): Remaining {
  const at = due ? Date.parse(due) : NaN;
  if (!Number.isFinite(at)) return { kind: 'none' };
  const ms = at - now;
  return ms <= 0 ? { kind: 'over' } : { kind: 'left', ms, soon: ms <= soonMs };
}

type Sortable = { due_at: string | null; status: string; pendingAck?: boolean };

/** Not yet accepted → overdue → nearest deadline → no deadline; finished work keeps the order it came in. */
export function compareTasks(a: Sortable, b: Sortable, now: number): number {
  const rank = (t: Sortable) => {
    if (t.status === 'done' || t.status === 'cancelled') return 4;
    if (t.pendingAck) return 0;
    const at = t.due_at ? Date.parse(t.due_at) : NaN;
    if (!Number.isFinite(at)) return 3;
    return at <= now ? 1 : 2;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 4) return 0;
  return (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" date. */
export function isoDow(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * KELDIM is due now: an active employee, a working day for them, hired by today, nothing recorded for today, and the
 * check-in window open (from the configured time, 09:45, until their work ends). Leave, days off, an existing
 * record (also "ta’til" / "ruxsatli" set by the Rahbar) and a passed window are never asked for.
 */
export function attendanceDue(input: {
  status: string | null | undefined;
  workDays: number[] | null | undefined;
  hiredOn: string | null | undefined;
  hasRecord: boolean;
  today: string;
  nowTime: string;
  from: string;
  workEnd: string | null | undefined;
}): boolean {
  if (input.status !== 'active' || input.hasRecord) return false;
  if (!input.workDays?.includes(isoDow(input.today))) return false;
  if (input.hiredOn && input.hiredOn > input.today) return false;
  const end = (input.workEnd || '18:00').slice(0, 5);
  return input.nowTime >= input.from.slice(0, 5) && input.nowTime < end;
}
