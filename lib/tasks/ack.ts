import type { Database } from '@/types/database';

/** A task this person still has to accept ("Vazifani qabul qildim"), as get_my_pending_acks returns it. */
export type PendingAck = Omit<Database['public']['Functions']['get_my_pending_acks']['Returns'][number], 'assignees' | 'checklist'> & {
  assignees: { name: string; accepted: boolean }[];
  checklist: string[];
};

type Row = Database['public']['Functions']['get_my_pending_acks']['Returns'][number];

export function toPending(rows: Row[] | null | undefined): PendingAck[] {
  return (rows ?? []).map((r) => ({
    ...r,
    assignees: Array.isArray(r.assignees) ? (r.assignees as { name: string; accepted: boolean }[]) : [],
    checklist: Array.isArray(r.checklist) ? (r.checklist as string[]) : [],
  }));
}

/** The attendance step of the gate: the CheckInCard's own props. */
export type GateDay = {
  record: null;
  from: string;
  workStart: string | null;
  serverNow: string;
  today: string;
  name?: string;
};

export type Gate = { pending: PendingAck[]; day: GateDay | null };
