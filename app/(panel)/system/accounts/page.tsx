import type { Metadata } from 'next';

import { AccountsList } from '@/components/accounts/AccountsList';
import { PageHeader } from '@/components/panel/PageHeader';
import { requireSystemOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Barcha akkauntlar' };

/** Tizim boshqaruvi → Barcha akkauntlar: every login in the system, staff and clients. */
export default async function AllAccountsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireSystemOwner();
  const { kind } = await searchParams;
  return (
    <div>
      <PageHeader title="Barcha akkauntlar" description="Tizimga kira oladigan hamma: xodimlar va mijozlar." />
      <AccountsList kinds={['staff', 'client']} path="/system/accounts" filter={kind} />
    </div>
  );
}
