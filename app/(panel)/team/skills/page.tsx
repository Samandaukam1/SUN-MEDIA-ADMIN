import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { SkillsCatalog } from '@/components/team/SkillsCatalog';
import { SkillsMatrix } from '@/components/team/SkillsMatrix';
import { SectionTitle } from '@/components/ui/Card';
import { loadPeople } from '@/lib/workflow';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Skilllar' };

export default async function SkillsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const [{ data, error }, people] = await Promise.all([
    supabase.from('skills').select('id, name, workflow_role, people:employee_skills(count)').order('position').order('name'),
    loadPeople(),
  ]);
  if (error) throw error;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Jamoa', href: '/team' }, { label: 'Skilllar' }]}
        title="Skilllar"
        description="Xodim nima qila olishi — roldan alohida. Ssenarist, operator va montajyor vazifa yaratishda shu belgilar bo‘yicha tanlanadi."
      />
      <section className="mb-10">
        <SectionTitle>Kim nima qila oladi</SectionTitle>
        <p className="mb-3 text-[13px] text-muted">Belgini bosing — darhol saqlanadi va “Vazifa yaratish” formasida shu zahoti ko‘rinadi.</p>
        <SkillsMatrix
          people={people.map((p) => ({ id: p.id, name: p.name, title: p.jobTitle, skills: p.skills.map((s) => s.id) }))}
          skills={data.map((s) => ({ id: s.id, name: s.name, workflowRole: s.workflow_role }))}
        />
      </section>
      <SectionTitle>Skilllar ro‘yxati</SectionTitle>
      <SkillsCatalog skills={data.map((s) => ({ id: s.id, name: s.name, workflowRole: s.workflow_role, people: s.people?.[0]?.count ?? 0 }))} />
    </div>
  );
}
