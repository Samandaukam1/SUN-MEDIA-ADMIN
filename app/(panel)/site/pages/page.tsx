import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { PagesEditor } from '@/components/site-admin/PagesEditor';
import { requirePermission } from '@/lib/auth';
import { siteCounts } from '@/lib/site/admin';
import { SITE_PAGE_KEYS, SITE_SECTION_KEYS, type SitePage, type SiteSection } from '@/lib/site/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sahifalar · Sayt' };

export default async function SitePagesPage() {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const [pages, sections, counts] = await Promise.all([
    supabase.from('site_pages').select('*').order('sort_order').order('key'),
    supabase.from('site_sections').select('*').order('sort_order').order('key'),
    siteCounts(),
  ]);
  if (pages.error) throw pages.error;
  if (sections.error) throw sections.error;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sahifalar"
        description="Saytdagi sahifalar, menyu va bosh sahifa bloklarining tartibi."
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Sahifalar' }]}
      />
      <PagesEditor
        pages={(pages.data ?? []).filter((p) => (SITE_PAGE_KEYS as readonly string[]).includes(p.key)) as SitePage[]}
        sections={(sections.data ?? []).filter((s) => (SITE_SECTION_KEYS as readonly string[]).includes(s.key)) as SiteSection[]}
        counts={{ services: counts.services, cases: counts.cases, partners: counts.partners }}
      />
    </div>
  );
}
