import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { ShootingForm } from '@/components/work/ShootingForm';
import { requirePermission } from '@/lib/auth';
import { loadClients, loadStaff } from '@/lib/directory';
import { addDaysToKey, agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Yangi syomka' };

export default async function NewShootingPage() {
  await requirePermission('shootings.manage');
  const [clients, staff] = await Promise.all([loadClients(), loadStaff()]);
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Syomkalar', href: '/work/shootings' }, { label: 'Yangi' }]} title="Yangi syomka" />
      <ShootingForm clients={clients} staff={staff} defaultDate={addDaysToKey(agencyDateKey(), 1)} />
    </div>
  );
}
