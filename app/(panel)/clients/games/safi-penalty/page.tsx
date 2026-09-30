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
    <PageHeader title="SAFI Penalty" description="10 ta zarba. Natijani server hal qiladi; mukofotni SUN MEDIA qoidalari belgilaydi." crumbs={[{ label: 'Game Center', href: '/clients/games' }, { label: 'SAFI Penalty' }]} />
    <SectionTitle>Rewards</SectionTitle>
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Reward Rules</h2>
        <p className="text-muted">Qiyinlik darajasi va maqsadli balans, gol soni bo‘yicha mukofotlar (SUN Coin yoki Pro kunlari), ON/OFF, soni, kampaniya sanalari va zaxira. O‘yinchiga ko‘rinmaydi.</p>
        <ButtonLink href="/clients/games/safi-penalty/rewards/rules" variant="primary">Reward Rules</ButtonLink>
      </Card>
      <Card className="space-y-4">
        <h2 className="flex items-center gap-3 text-xl font-semibold"><SunCoinIcon size={40} />SUN Coin</h2>
        <p className="text-muted">Wallet analitikasi, sovg‘a qilish, Coin Shop paketlari va xarid so‘rovlari, eski SUN Coin kampaniyalari arxivi.</p>
        <ButtonLink href="/clients/games/safi-penalty/rewards/sun-coin">SUN Coin va Coin Shop</ButtonLink>
      </Card>
    </div>
  </div>;
}
