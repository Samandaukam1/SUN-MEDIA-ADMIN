import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { CollectionEditor } from '@/components/site-admin/CollectionEditor';
import { SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { loadCollection } from '@/lib/site/admin';

export const metadata: Metadata = { title: 'Jarayon va savollar · Sayt' };

export default async function SiteProcessPage() {
  await requirePermission('site.manage');
  const [steps, faqs] = await Promise.all([loadCollection('steps'), loadCollection('faqs')]);
  return (
    <div className="space-y-10">
      <PageHeader title="Jarayon va savollar" crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Jarayon va savollar' }]} />
      <section>
        <SectionTitle>Ish jarayoni</SectionTitle>
        <CollectionEditor collection="steps" rows={steps} />
      </section>
      <section>
        <SectionTitle>Savol-javoblar</SectionTitle>
        <CollectionEditor collection="faqs" rows={faqs} />
      </section>
    </div>
  );
}
