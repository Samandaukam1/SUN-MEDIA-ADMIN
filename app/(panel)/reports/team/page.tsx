import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { MonthPicker } from '@/components/team/MonthPicker';
import { Scorecards } from '@/components/team/Scorecards';
import { requirePermission } from '@/lib/auth';
import { monthFrom } from '@/lib/month';

export const metadata: Metadata = { title: 'Xodimlar KPI' };

export default async function TeamReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('performance.read');
  const { month, current, from, to } = monthFrom((await searchParams).month);
  return (
    <div>
      <PageHeader title="Xodimlar KPI" description="Oylik natijalar: o‘z vaqtida bajarish, kechikishlar, davomat va tayyorlangan ish." actions={<MonthPicker path="/reports/team" month={month} current={current} />} />
      <Scorecards from={from} to={to} />
    </div>
  );
}
