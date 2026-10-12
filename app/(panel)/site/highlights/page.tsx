import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { CollectionEditor } from '@/components/site-admin/CollectionEditor';
import { SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { loadCollection } from '@/lib/site/admin';

export const metadata: Metadata = { title: 'Raqamlar va afzalliklar · Sayt' };

export default async function SiteHighlightsPage() {
  await requirePermission('site.manage');
  const [stats, benefits] = await Promise.all([loadCollection('stats'), loadCollection('benefits')]);
  return (
    <div className="space-y-10">
      <PageHeader title="Raqamlar va afzalliklar" crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Raqamlar va afzalliklar' }]} />
      <section>
        <SectionTitle>Raqamlar</SectionTitle>
        <CollectionEditor collection="stats" rows={stats} />
      </section>
      <section>
        <SectionTitle>Nega SUN MEDIA — afzalliklar</SectionTitle>
        <CollectionEditor collection="benefits" rows={benefits} />
      </section>
    </div>
  );
}
