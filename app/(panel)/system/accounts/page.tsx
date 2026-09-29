import type { Metadata } from 'next';

import { AccessRequests } from '@/components/accounts/AccessRequests';
import { AccountsList } from '@/components/accounts/AccountsList';
import { PageHeader } from '@/components/panel/PageHeader';
import { requireSystemOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Barcha akkauntlar' };

/** Tizim boshqaruvi → Barcha akkauntlar: every login in the system, staff and clients. */
export default async function AllAccountsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const context = await requireSystemOwner();
  const { kind } = await searchParams;
  return (
    <div>
      <PageHeader title="Barcha akkauntlar" description="Tizimga kira oladigan hamma: xodimlar va mijozlar." />
      <AccessRequests context={context} />
      <AccountsList kinds={['staff', 'client']} path="/system/accounts" filter={kind} />
    </div>
  );
}
