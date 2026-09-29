import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatMonthKey, formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijozlar hisoboti' };

/** Hisobotlar → Mijozlar hisoboti: each client's latest monthly report and whether the client has it. */
export default async function ClientReportsPage() {
  const context = await requireStaff();
  if (!can(context, 'reports.read') && !can(context, 'reports.manage')) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, reports:monthly_reports(id, period_month, status, published_at, pdf_path, metrics:monthly_report_metrics(metric_key, value))')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name');
  if (error) throw error;

  return (
    <div>
      <PageHeader title="Mijozlar hisoboti" description="Har bir mijozning so‘nggi oylik hisoboti. Hisobot mijozning sahifasida tayyorlanadi va yuboriladi." />
      {data.length === 0 ? (
        <EmptyRow>Faol mijoz yo‘q</EmptyRow>
      ) : (
        <Table columns={['Mijoz', 'So‘nggi hisobot', 'Reja bajarilishi', 'Holat', '']}>
          {data.map((c) => {
            const latest = [...c.reports].sort((a, b) => b.period_month.localeCompare(a.period_month))[0];
            const completion = latest?.metrics.find((m) => m.metric_key === 'calendar.completion_rate')?.value;
            return (
              <tr key={c.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/clients/${c.id}?tab=reports`}>
                    <span className="font-medium">{c.name}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{latest ? formatMonthKey(latest.period_month) : 'Hali yo‘q'}</td>
                <td className={`${cellClass} tabular`}>{completion != null ? `${Math.round(Number(completion))}%` : '—'}</td>
                <td className={cellClass}>
                  {latest ? (
                    <Badge tone={latest.status === 'published' ? 'success' : 'warning'} dot>
                      {latest.status === 'published' ? `Yuborilgan · ${formatShortDateTime(latest.published_at)}` : 'Qoralama'}
                    </Badge>
                  ) : (
                    <Badge>Tayyorlanmagan</Badge>
                  )}
                </td>
                <td className={`${cellClass} relative z-10`}>
                  {latest?.pdf_path ? (
                    <a href={`/api/reports/${latest.id}/pdf`} className="text-sm font-medium hover:underline">
                      PDF
                    </a>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
