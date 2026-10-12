import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { CollectionEditor } from '@/components/site-admin/CollectionEditor';
import { ButtonLink } from '@/components/ui/Button';
import { requirePermission } from '@/lib/auth';
import { clientPresets, loadCollection, partnerOptions } from '@/lib/site/admin';
import { SITE_COLLECTIONS, type SiteCollectionKey } from '@/lib/site/collections';

/** Lists that have a page of their own; stats/benefits and steps/faqs share "highlights" and "process". */
const STANDALONE: SiteCollectionKey[] = ['services', 'cases', 'partners', 'testimonials'];
const PUBLIC_PATH: Partial<Record<SiteCollectionKey, string>> = { services: '/xizmatlar', cases: '/keyslar', partners: '/hamkorlar' };

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }): Promise<Metadata> {
  const { collection } = await params;
  const config = SITE_COLLECTIONS[collection as SiteCollectionKey];
  return { title: config ? `${config.title} · Sayt` : 'Sayt' };
}

export default async function SiteCollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  await requirePermission('site.manage');
  const { collection } = await params;
  if (!(STANDALONE as string[]).includes(collection)) notFound();
  const key = collection as SiteCollectionKey;
  const config = SITE_COLLECTIONS[key];
  const needsPartners = key === 'cases' || key === 'testimonials';
  const [rows, partners, presets] = await Promise.all([
    loadCollection(key),
    needsPartners ? partnerOptions() : Promise.resolve([]),
    key === 'partners' ? clientPresets() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: config.title }]}
        actions={PUBLIC_PATH[key] ? <ButtonLink href={PUBLIC_PATH[key]!}>Saytda ko‘rish</ButtonLink> : undefined}
      />
      <CollectionEditor collection={key} rows={rows} partners={partners} presets={presets} />
    </div>
  );
}
