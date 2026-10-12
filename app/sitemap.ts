import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/env.server';
import { getSiteContent, hasContent } from '@/lib/site/content';

export const revalidate = 3600;

/** Published pages of the public site and every published case. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const content = await getSiteContent();
  const updated = new Date(content.settings.updated_at);
  const pages = content.pages
    .filter((p) => p.is_published && hasContent(content, p.key))
    .map((p) => ({ url: `${site}${p.path === '/' ? '' : p.path}`, lastModified: updated, priority: p.key === 'home' ? 1 : 0.8 }));
  const casesOpen = content.pages.some((p) => p.key === 'cases' && p.is_published);
  const cases = casesOpen ? content.cases.map((c) => ({ url: `${site}/keyslar/${c.slug}`, lastModified: updated, priority: 0.6 })) : [];
  return [...pages, ...cases];
}
