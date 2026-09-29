import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { RolesView } from '@/components/roles/RolesView';
import { requireSystemOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Global ruxsatlar' };

/** Tizim boshqaruvi → Global ruxsatlar: what every role may do. A change applies to everyone in that role. */
export default async function GlobalPermissionsPage() {
  await requireSystemOwner();
  return (
    <div>
      <PageHeader title="Global ruxsatlar" description="Belgini qo‘ysangiz yoki olsangiz — shu roldagi hamma odamga darhol ta’sir qiladi." />
      <RolesView editable />
    </div>
  );
}
