/**
 * Scheduling helpers (pure; unit-tested): the plan's real state as the owner sees it, and a small bounded pool so one
 * worker run can send several independent parts at once without opening more provider connections than allowed.
 */

import { isFinal } from './catalog';

export type PlanPhase = 'scheduled' | 'queued' | 'processing' | 'partially_completed' | 'completed' | 'paused' | 'failed' | 'cancelled';

export const PLAN_PHASE: Record<PlanPhase, { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' | 'danger' }> = {
  scheduled: { label: 'Rejalashtirilgan', tone: 'info' },
  queued: { label: 'Navbatda', tone: 'info' },
  processing: { label: 'Bajarilmoqda', tone: 'info' },
  partially_completed: { label: 'Qisman bajarilgan', tone: 'info' },
  completed: { label: 'Tugagan', tone: 'success' },
  paused: { label: 'Pauza', tone: 'warning' },
  failed: { label: 'Xato — ko‘rib chiqing', tone: 'danger' },
  cancelled: { label: 'Bekor qilingan', tone: 'neutral' },
};

type PhasePart = { state: string; due_at: string; order_id: string };
type PhaseOrder = { id: string; status: string | null };

/**
 * From the stored facts only: the plan's own status, its parts, the provider status of the sent ones, and who holds
 * its queue key. "queued" means a due part waits for another order on the same service and target (nothing else).
 */
export function planPhase(
  p: { status: string; parts: PhasePart[]; orders: PhaseOrder[]; queue: { order_id: string } | null },
  now = Date.now(),
): PlanPhase {
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'completed') return 'completed';
  if (p.status === 'paused') return p.parts.some((x) => ['rejected', 'unknown', 'not_placed'].includes(x.state)) ? 'failed' : 'paused';
  if (p.parts.some((x) => x.state === 'dispatching' || x.state === 'sending')) return 'processing';
  const next = p.parts.find((x) => x.state === 'planned');
  const due = !!next && Date.parse(next.due_at) <= now;
  const heldByOther = !!p.queue && !p.parts.some((x) => x.order_id === p.queue!.order_id);
  if (due && heldByOther) return 'queued';
  const running = p.parts.some((x) => x.state === 'sent' && !isFinal(p.orders.find((o) => o.id === x.order_id)?.status ?? null));
  if (running) return 'processing';
  if (due) return 'queued';
  return p.parts.some((x) => x.state === 'sent') ? 'partially_completed' : 'scheduled';
}

/** Runs `fn` over `items` with at most `limit` at a time; results keep the input order. */
export async function runPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return out;
}
