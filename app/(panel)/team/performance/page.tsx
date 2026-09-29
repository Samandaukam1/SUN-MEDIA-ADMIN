import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { MonthPicker } from '@/components/team/MonthPicker';
import { Scorecards } from '@/components/team/Scorecards';
import { requirePermission } from '@/lib/auth';
import { monthFrom } from '@/lib/month';

export const metadata: Metadata = { title: 'Ish samaradorligi' };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('performance.read');
  const { month, current, from, to } = monthFrom((await searchParams).month);
  return (
    <div>
      <PageHeader title="Ish samaradorligi" description="Kim qancha vazifani o‘z vaqtida bajardi, davomat va syomkalar." actions={<MonthPicker path="/team/performance" month={month} current={current} />} />
      <Scorecards from={from} to={to} />
    </div>
  );
}
