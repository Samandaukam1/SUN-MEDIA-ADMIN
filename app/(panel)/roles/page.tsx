import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { RolesView } from '@/components/roles/RolesView';
import { can, isSystemOwner, requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Rollar va ruxsatlar' };

/** Jamoa → Rollar va ruxsatlar: what each role may do (editable only by the Tizim egasi). */
export default async function RolesPage() {
  const context = await requireStaff();
  if (!can(context, 'roles.manage') && !can(context, 'employees.manage')) redirect('/no-access?reason=permission');
  return (
    <div>
      <PageHeader title="Rollar va ruxsatlar" description="Har bir rol nimani ko‘ra va qila olishi." />
      <RolesView editable={isSystemOwner(context)} />
    </div>
  );
}
