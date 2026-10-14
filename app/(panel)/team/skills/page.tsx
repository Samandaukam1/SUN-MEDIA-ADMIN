import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { SkillsCatalog } from '@/components/team/SkillsCatalog';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Skilllar' };

export default async function SkillsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.from('skills').select('id, name, workflow_role, people:employee_skills(count)').order('position').order('name');
  if (error) throw error;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Jamoa', href: '/team' }, { label: 'Skilllar' }]}
        title="Skilllar"
        description="Xodim nima qila olishi — roldan alohida. Belgilangan skilllar vazifa yaratishda ssenarist, operator va montajyorni tanlash uchun ishlatiladi."
      />
      <SkillsCatalog skills={data.map((s) => ({ id: s.id, name: s.name, workflowRole: s.workflow_role, people: s.people?.[0]?.count ?? 0 }))} />
    </div>
  );
}
