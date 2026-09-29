import type { Metadata } from 'next';

import { AccountsList } from '@/components/accounts/AccountsList';
import { PageHeader } from '@/components/panel/PageHeader';
import { requirePermission } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mijoz akkauntlari' };

/** Mijozlar → Mijoz akkauntlari: each client company's logins. New logins are added on the client's page. */
export default async function ClientAccountsPage() {
  await requirePermission('clients.manage');
  return (
    <div>
      <PageHeader
        title="Mijoz akkauntlari"
        description="Har bir mijozning loginlari. Yangi login mijoz sahifasidagi “Loginlar” bo‘limida qo‘shiladi; mijoz faqat kuzatadi va SUN MEDIA bilan yozishadi."
      />
      <AccountsList kinds={['client']} path="/clients/accounts" />
    </div>
  );
}
