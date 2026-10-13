import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Panel } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { ReportCard } from '@/components/cabinet/partner/ReportCard';
import { loadPartnerCabinet } from '@/lib/cabinet/partner';
import { resolvePartner } from '@/lib/cabinet/partner-context';
import { shiftMonth } from '@/lib/cabinet/stats';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Hisobotlar' };

/** Every published monthly report of the last two years, newest first. */
export default async function PartnerReportsPage({ searchParams }: { searchParams: Promise<{ brend?: string }> }) {
  const scope = await resolvePartner((await searchParams).brend);
  const current = `${agencyDateKey().slice(0, 7)}-01`;
  const data = await loadPartnerCabinet(scope.clientId, shiftMonth(current, -23), current);
  if (data === 'forbidden') redirect(scope.home);
  return (
    <PartnerFrame scope={scope} title="Hisobotlar" subtitle="SUN MEDIA nashr qilgan oylik hisobotlar: nima qilindi, natija va keyingi reja.">
      {data.reports.length ? (
        <div className="space-y-4">
          {data.reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <Panel>
          <p className="py-6 text-center text-[14px] text-[#8e8e96]">Hali nashr qilingan hisobot yo‘q. SUN MEDIA oy yakunida hisobotni shu yerga joylaydi.</p>
        </Panel>
      )}
    </PartnerFrame>
  );
}
