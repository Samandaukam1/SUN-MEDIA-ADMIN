import type { Metadata } from 'next';

import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { NotificationSettings } from '@/components/pwa/NotificationSettings';
import { resolvePartner } from '@/lib/cabinet/partner-context';

export const metadata: Metadata = { title: 'Bildirishnomalar' };

/** The partner's notification settings (their own account; SUN MEDIA staff previewing the cabinet see a notice). */
export default async function PartnerNotificationsPage({ searchParams }: { searchParams: Promise<{ brend?: string }> }) {
  const scope = await resolvePartner((await searchParams).brend);
  return (
    <PartnerFrame scope={scope} title="Bildirishnomalar" subtitle="Telefon, planshet va kompyuterga keladigan xabarlar.">
      {scope.preview ? (
        <p className="text-[14px] text-[#8e8e96]">Bildirishnoma sozlamalari har bir hamkorning o‘z akkauntida.</p>
      ) : (
        <div className="max-w-3xl">
          <NotificationSettings userId={scope.context.userId} tone="dark" />
        </div>
      )}
    </PartnerFrame>
  );
}
