import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { ContentForm } from '@/components/work/ContentForm';
import { saveContentAction } from '@/lib/actions/work';
import { requirePermission } from '@/lib/auth';
import { loadClients, loadStaff } from '@/lib/directory';

export const metadata: Metadata = { title: 'Yangi kontent' };

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requirePermission('content.manage');
  const [{ client }, clients, staff] = await Promise.all([searchParams, loadClients(), loadStaff()]);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Kontent', href: '/work/content' }, { label: 'Yangi' }]}
        title="Yangi kontent"
        description="Mijoz, nomi va turi yetarli — qolganini keyin ham to‘ldirish mumkin."
      />
      <ContentForm action={saveContentAction.bind(null, null)} clients={clients} staff={staff} defaults={{ clientId: client }} cancelHref="/work/content" />
    </div>
  );
}
