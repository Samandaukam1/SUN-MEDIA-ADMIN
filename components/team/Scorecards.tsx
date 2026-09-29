import { cellClass, rowClass, Table } from '@/components/panel/List';
import { EmptyRow } from '@/components/panel/Stat';
import { createClient } from '@/lib/supabase/server';

type Metrics = {
  assigned_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  on_time_rate: number | null;
  present_days: number;
  late_days: number;
  absent_days: number;
  shootings_assigned: number;
  editor?: { videos_edited: number; revisions: number } | null;
  smm?: { published: number } | null;
};

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}%`);

/** Monthly results per employee (get_employee_scorecards), in one readable table. */
export async function Scorecards({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_employee_scorecards', { p_from: from, p_to: to });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ ...r, metrics: r.metrics as unknown as Metrics }));
  if (rows.length === 0) return <EmptyRow>Bu oy uchun ma’lumot yo‘q</EmptyRow>;
  return (
    <Table columns={['Xodim', 'Vazifa bajarildi', 'O‘z vaqtida', 'Kechikkan', 'Davomat', 'Syomka', 'Natija']}>
      {rows
        .sort((a, b) => (b.metrics.on_time_rate ?? -1) - (a.metrics.on_time_rate ?? -1))
        .map((r) => {
          const m = r.metrics;
          const scheduled = m.present_days + m.late_days + m.absent_days;
          const attendance = scheduled ? (100 * (m.present_days + m.late_days)) / scheduled : null;
          const output = [m.editor?.videos_edited ? `${m.editor.videos_edited} video` : null, m.smm?.published ? `${m.smm.published} post` : null].filter(Boolean).join(' · ');
          return (
            <tr key={r.user_id} className={rowClass}>
              <td className={`${cellClass} font-medium`}>{r.full_name}</td>
              <td className={`${cellClass} tabular`}>
                {m.completed_tasks}/{m.assigned_tasks}
              </td>
              <td className={`${cellClass} tabular`}>{pct(m.on_time_rate)}</td>
              <td className={`${cellClass} tabular ${m.overdue_tasks ? 'text-danger' : 'text-muted'}`}>{m.overdue_tasks}</td>
              <td className={`${cellClass} tabular`}>
                {pct(attendance)}
                {m.late_days ? <span className="text-muted"> · {m.late_days} kech</span> : null}
              </td>
              <td className={`${cellClass} tabular text-muted`}>{m.shootings_assigned}</td>
              <td className={`${cellClass} text-muted`}>{output || '—'}</td>
            </tr>
          );
        })}
    </Table>
  );
}
