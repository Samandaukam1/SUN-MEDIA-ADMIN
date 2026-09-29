import type { Metadata } from 'next';

import { EmployeeForm } from '@/components/accounts/AddEmployeeDialog';
import { PageHeader } from '@/components/panel/PageHeader';
import { Card } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { loadEmployeeFormOptions } from '@/lib/team-options';

export const metadata: Metadata = { title: 'Xodim qo‘shish' };

/** Jamoa → Xodim qo‘shish: a real login (Supabase Auth, created on the server) with role and permissions. */
export default async function NewEmployeePage() {
  const context = await requirePermission('employees.manage');
  const options = await loadEmployeeFormOptions(context);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Jamoa', href: '/team' }, { label: 'Xodim qo‘shish' }]}
        title="Xodim qo‘shish"
        description="Ism, lavozim, rol va ruxsatlar. Oxirida login va vaqtinchalik parolni nusxalab xodimga berasiz."
      />
      <Card className="max-w-3xl">
        <EmployeeForm {...options} />
      </Card>
    </div>
  );
}
