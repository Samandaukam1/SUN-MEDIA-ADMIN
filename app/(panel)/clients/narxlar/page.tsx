import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PricingTable } from '@/components/clients/PricingTable';
import { PageHeader } from '@/components/panel/PageHeader';
import { can, requireStaff } from '@/lib/auth';
import { tariffOptions, type Billing } from '@/lib/billing';
import { getSiteContent } from '@/lib/site/content';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Narxlar va to‘lovlar' };

/** Mijozlar → Narxlar: the tariff, agreed price, period, next payment and status of every client (finance only). */
export default async function PricesPage() {
  const context = await requireStaff();
  if (!can(context, 'finance.read') && !can(context, 'subscriptions.manage')) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const [clients, billing, content] = await Promise.all([
    supabase.from('clients').select('id, name, status').is('deleted_at', null).order('name'),
    supabase.from('client_billing').select('*'),
    getSiteContent(),
  ]);
  if (clients.error) throw clients.error;
  const money = new Map(((billing.data ?? []) as (Billing & { client_id: string })[]).map((b) => [b.client_id, b]));
  const rows = clients.data
    .map((c) => ({ id: c.id, name: c.name, active: c.status === 'active', billing: money.get(c.id) ?? null }))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(!!a.billing) - Number(!!b.billing) || a.name.localeCompare(b.name));
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Mijozlar', href: '/clients' }, { label: 'Narxlar va to‘lovlar' }]}
        title="Narxlar va to‘lovlar"
        description="Har bir mijoz uchun tarif, kelishilgan narx, to‘lov davri, keyingi to‘lov va holat. Narxi kiritilmaganlar yuqorida. Ko‘zcha summalarni yashiradi."
      />
      <PricingTable rows={rows} tariffs={tariffOptions(content.plans)} today={agencyDateKey()} canEdit={can(context, 'subscriptions.manage')} />
    </div>
  );
}
