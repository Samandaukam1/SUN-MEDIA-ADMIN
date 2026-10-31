'use client';

import { useCallback, useEffect, useState } from 'react';

import { listenTopic } from '@/lib/realtime/topic';
import { getBrowserClient } from '@/lib/supabase/client';
import { formatShortDateTime, formatTime } from '@/lib/time';
import { agencyToday } from '@/lib/attendance';

export type AckRow = {
  userId: string;
  name: string;
  required: boolean;
  acknowledgedAt: string | null;
};

const when = (iso: string) => (agencyToday(new Date(iso)) === agencyToday() ? formatTime(iso) : formatShortDateTime(iso));

/**
 * Who of the task's people has accepted it ("Qabul qildi · 14:32") and who not yet — updated the moment someone
 * presses "Vazifani qabul qildim" (the staff topic carries only ids; the rows are read again under row-level security).
 * A count, not progress: accepting is not doing.
 */
export function AckStatus({ taskId, initial }: { taskId: string; initial: AckRow[] }) {
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);

  const reload = useCallback(async () => {
    const { data, error } = await getBrowserClient()
      .from('task_assignments')
      .select('user_id, ack_required, acknowledged_at, person:profiles!task_assignments_user_id_fkey(full_name)')
      .eq('task_id', taskId);
    if (error || !data) return;
    setRows(
      data
        .map((r) => ({
          userId: r.user_id,
          name: r.person?.full_name ?? '—',
          required: r.ack_required,
          acknowledgedAt: r.acknowledged_at,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, [taskId]);

  useEffect(() => listenTopic('staff', 'change', (p) => p.table === 'task_assignments' && p.task_id === taskId && void reload()), [taskId, reload]);

  if (!rows.length) return <p className="text-sm text-muted">Hali hech kim biriktirilmagan.</p>;
  const required = rows.filter((r) => r.required);
  const accepted = required.filter((r) => r.acknowledgedAt);
  return (
    <div className="space-y-3 text-sm">
      {required.length ? (
        <p className="font-medium" aria-live="polite">
          {required.length} xodimdan {accepted.length} nafari qabul qildi.
        </p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.userId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{r.name}</span>
            {r.acknowledgedAt ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-success">
                <span className="size-2 rounded-full bg-success" />
                Qabul qildi · {when(r.acknowledgedAt)}
              </span>
            ) : r.required ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-warning">
                <span className="size-2 rounded-full bg-warning" />
                Hali qabul qilmagan
              </span>
            ) : (
              <span className="shrink-0 text-muted" title="Bu biriktirish qabul qilish tizimidan oldin qilingan">
                —
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
