import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { SmmApi, type SmmTab } from '@/components/smm/SmmApi';
import { smmOrders } from '@/lib/actions/smm';
import { loadBalance, loadCatalog, requireSmmOwner, smmConfig } from '@/lib/neosmm/server';

export const metadata: Metadata = { title: 'Smm Api', robots: { index: false, follow: false } };
// The owner's live account: rendered for each request, never cached anywhere.
export const dynamic = 'force-dynamic';

const TABS: SmmTab[] = ['hisob', 'xizmatlar', 'buyurtmalar', 'donat', 'sovgalar'];
const CATALOG = { xizmatlar: 'services', donat: 'donat_services', sovgalar: 'gifts' } as const;

/** Smm Api — the owner's NeoSMM account inside the panel: balance, every service, orders, game donat, Telegram gifts. */
export default async function SmmApiPage({ searchParams }: { searchParams: Promise<{ bolim?: string }> }) {
  const owner = await requireSmmOwner();
  const { bolim } = await searchParams;
  const tab = TABS.includes(bolim as SmmTab) ? (bolim as SmmTab) : 'hisob';
  const config = smmConfig();
  const kind = tab in CATALOG ? CATALOG[tab as keyof typeof CATALOG] : null;
  const [balance, orders, catalog] = await Promise.all([loadBalance(), smmOrders(), kind ? loadCatalog(owner, kind) : Promise.resolve(null)]);

  return (
    <div className="pb-28">
      <PageHeader title="Smm Api" description="NeoSMM hisobingiz: balans, barcha xizmatlar va buyurtmalar — provayderning asl narxlarida." />
      <SmmApi
        tab={tab}
        config={{ keyConfigured: config.keyConfigured, rateUnit: config.rateUnit }}
        balance={balance}
        orders={orders.orders}
        ordersError={orders.ok ? null : orders.message}
        catalog={catalog}
      />
    </div>
  );
}
