import type { Metadata } from 'next';

import { AccountsList } from '@/components/accounts/AccountsList';
import { PageHeader } from '@/components/panel/PageHeader';
import { requireSystemOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Bloklangan akkauntlar' };

/** Tizim boshqaruvi → Bloklangan akkauntlar: suspended or disabled logins; open one to unblock. */
export default async function LocksPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireSystemOwner();
  const { kind } = await searchParams;
  return (
    <div>
      <PageHeader title="Bloklangan akkauntlar" description="To‘xtatilgan yoki o‘chirilgan loginlar. Qatorni ochib, akkauntni qayta faollashtirish mumkin." />
      <AccountsList kinds={['staff', 'client']} path="/system/locks" filter={kind} onlyBlocked />
    </div>
  );
}
