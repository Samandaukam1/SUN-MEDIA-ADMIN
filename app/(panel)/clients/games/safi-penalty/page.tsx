import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { SunCoinIcon } from '@/components/ui/SunCoinIcon';
import { requirePermission } from '@/lib/auth';

export const metadata: Metadata = { title: 'SAFI Penalty · Rewards' };

export default async function SafiRewardsPage() {
  await requirePermission('promo.manage');
  return <div>
    <PageHeader title="SAFI Penalty" description="10 ta zarba. Mukofotlar mahorat orqali olingan natijaga qarab beriladi." crumbs={[{ label: 'Game Center', href: '/clients/games' }, { label: 'SAFI Penalty' }]} />
    <SectionTitle>Rewards</SectionTitle>
    <Card className="max-w-2xl space-y-4">
      <h2 className="flex items-center gap-3 text-xl font-semibold"><SunCoinIcon size={40} />SUN Coin Campaign</h2>
      <p className="text-muted">Reward pool, mukofot variantlari, g‘oliblar soni va score shartlarini boshqaring. PRO mukofotlari mustaqil ishlaydi.</p>
      <ButtonLink href="/clients/games/safi-penalty/rewards/sun-coin" variant="primary">SUN Coin kampaniyalari</ButtonLink>
    </Card>
  </div>;
}
