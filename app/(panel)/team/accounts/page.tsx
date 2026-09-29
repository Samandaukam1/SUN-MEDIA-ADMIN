import type { Metadata } from 'next';

import { AccessRequests } from '@/components/accounts/AccessRequests';
import { AccountsList } from '@/components/accounts/AccountsList';
import { PageHeader } from '@/components/panel/PageHeader';
import { requirePermission } from '@/lib/auth';

export const metadata: Metadata = { title: 'Akkauntlar' };

/** Jamoa → Akkauntlar: every staff login with its status; open a row to reset the password or block. */
export default async function StaffAccountsPage() {
  const context = await requirePermission('employees.manage');
  return (
    <div>
      <PageHeader title="Akkauntlar" description="Xodimlarning loginlari. Parolni tiklash yoki bloklash uchun qatorni oching." />
      <AccessRequests context={context} />
      <AccountsList kinds={['staff']} path="/team/accounts" />
    </div>
  );
}
