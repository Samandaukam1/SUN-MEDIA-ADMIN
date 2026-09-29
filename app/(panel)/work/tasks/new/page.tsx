import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { TaskForm } from '@/components/work/TaskForm';
import { requirePermission } from '@/lib/auth';
import { loadClients, loadStaff } from '@/lib/directory';
import { addDaysToKey, agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Yangi vazifa' };

export default async function NewTaskPage() {
  await requirePermission('tasks.manage');
  const [clients, staff] = await Promise.all([loadClients(), loadStaff()]);
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Vazifalar', href: '/work/tasks' }, { label: 'Yangi' }]} title="Yangi vazifa" />
      <TaskForm clients={clients} staff={staff} defaultDue={`${addDaysToKey(agencyDateKey(), 1)}T18:00`} />
    </div>
  );
}
