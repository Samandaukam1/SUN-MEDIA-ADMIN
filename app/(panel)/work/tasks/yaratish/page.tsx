import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { ContentTaskForm } from '@/components/work/ContentTaskForm';
import { requirePermission } from '@/lib/auth';
import { loadClients } from '@/lib/directory';
import { createClient } from '@/lib/supabase/server';
import { loadPeople } from '@/lib/workflow';

export const metadata: Metadata = { title: 'Vazifa yaratish' };

/** "+ Vazifa yaratish": one content task with its script, equipment, shooting, montaj and post stages. */
export default async function CreateContentTaskPage({ searchParams }: { searchParams: Promise<{ mijoz?: string }> }) {
  await requirePermission('tasks.manage');
  const { mijoz } = await searchParams;
  const supabase = await createClient();
  const [clients, people, equipment] = await Promise.all([
    loadClients(),
    loadPeople(),
    supabase.from('equipment').select('id, name').eq('is_active', true).order('position').order('name'),
  ]);
  if (equipment.error) throw equipment.error;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Vazifalar', href: '/work/tasks' }, { label: 'Vazifa yaratish' }]}
        title="Vazifa yaratish"
        description="Kontent, ssenariy, jihozlar, syomka, montaj va post — bitta vazifada. Xodimlar skilli bo‘yicha tanlanadi."
      />
      <ContentTaskForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        people={people}
        equipment={equipment.data}
        defaultClient={clients.some((c) => c.id === mijoz) ? mijoz : undefined}
      />
    </div>
  );
}
