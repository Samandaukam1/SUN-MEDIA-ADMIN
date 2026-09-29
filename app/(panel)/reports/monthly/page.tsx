import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { MonthPicker } from '@/components/team/MonthPicker';
import { can, requireStaff } from '@/lib/auth';
import { monthFrom } from '@/lib/month';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Oylik natijalar' };

const compact = (v: number | null | undefined) => (v == null ? '—' : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} mln` : v >= 10_000 ? `${Math.round(v / 1000)} ming` : String(Math.round(v)));

/** Hisobotlar → Oylik natijalar: all clients side by side for one month (from the generated reports). */
export default async function MonthlyResultsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'reports.read') && !can(context, 'reports.manage')) redirect('/no-access?reason=permission');
  const { month, current } = monthFrom((await searchParams).month);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('id, status, client:clients(id, name), metrics:monthly_report_metrics(metric_key, value, target_value)')
    .eq('period_month', month)
    .order('created_at');
  if (error) throw error;

  return (
    <div>
      <PageHeader title="Oylik natijalar" description="Tarif bo‘yicha nima yetkazildi va ijtimoiy tarmoqdagi natija — barcha mijozlar bitta jadvalda." actions={<MonthPicker path="/reports/monthly" month={month} current={current} />} />
      {data.length === 0 ? (
        <EmptyRow>Bu oy uchun hali hisobot tayyorlanmagan. Hisobot mijoz sahifasidagi “Hisobotlar” bo‘limida tayyorlanadi.</EmptyRow>
      ) : (
        <Table columns={['Mijoz', 'Reels', 'Stories', 'Postlar', 'Syomka', 'Reja', 'Ko‘rish', 'Obunachi']}>
          {data.map((r) => {
            const m = (key: string) => r.metrics.find((x) => x.metric_key === key);
            const pair = (key: string) => {
              const x = m(key);
              return x ? `${Math.round(Number(x.value ?? 0))}${x.target_value != null ? `/${Math.round(Number(x.target_value))}` : ''}` : '—';
            };
            const completion = m('calendar.completion_rate')?.value;
            const growth = m('social.followers_growth')?.value;
            return (
              <tr key={r.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/clients/${r.client?.id}?tab=reports`}>
                    <span className="font-medium">{r.client?.name}</span>
                    <span className="block text-[13px] text-muted">{r.status === 'published' ? 'Mijozga yuborilgan' : 'Qoralama'}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} tabular`}>{pair('delivery.reels')}</td>
                <td className={`${cellClass} tabular`}>{pair('delivery.stories')}</td>
                <td className={`${cellClass} tabular`}>{pair('delivery.posts')}</td>
                <td className={`${cellClass} tabular`}>{pair('delivery.shooting_days')}</td>
                <td className={`${cellClass} tabular`}>{completion != null ? `${Math.round(Number(completion))}%` : '—'}</td>
                <td className={`${cellClass} tabular`}>{compact(m('social.views')?.value != null ? Number(m('social.views')!.value) : null)}</td>
                <td className={`${cellClass} tabular ${growth != null && Number(growth) > 0 ? 'text-success' : ''}`}>{growth != null ? `${Number(growth) > 0 ? '+' : ''}${compact(Number(growth))}` : '—'}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
