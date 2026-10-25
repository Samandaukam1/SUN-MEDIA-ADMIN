import 'server-only';

import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { siteContentSchema } from './schema';
import type { SiteContent, SitePage, SitePageKey, SiteSection, SiteSectionKey } from './types';

export const SITE_CONTENT_TAG = 'site-content';

/**
 * The published site, cached across requests and refreshed the moment "Sayt" saves anything
 * (revalidateTag). Read on the server with the service role (get_site_content is not callable by
 * anonymous clients); no cookies are touched, so the pages stay static.
 */
export const getSiteContent = unstable_cache(
  async (): Promise<SiteContent> => {
    const { data, error } = await createAdminClient().rpc('get_site_content');
    if (error) throw new Error(`get_site_content: ${error.message}`);
    return siteContentSchema.parse(data);
  },
  ['site-content-v1'],
  { tags: [SITE_CONTENT_TAG], revalidate: 600 },
);

export function pageOf(content: SiteContent, key: SitePageKey): SitePage | undefined {
  return content.pages.find((p) => p.key === key);
}

export function sectionOf(content: SiteContent, key: SiteSectionKey): SiteSection | undefined {
  return content.sections.find((s) => s.key === key);
}

/** A listing page with nothing published yet stays out of the menu (its URL still works). */
export function hasContent(content: SiteContent, key: SitePageKey): boolean {
  if (key === 'cases') return content.cases.length > 0;
  if (key === 'partners') return content.partners.length > 0;
  if (key === 'services') return content.services.length > 0;
  // Tariflar stays in the menu even before prices are entered (the page shows a clear empty state).
  return true;
}

export function navigation(content: SiteContent): { href: string; label: string }[] {
  return content.pages
    .filter((p) => p.key !== 'home' && p.is_published && p.show_in_nav && hasContent(content, p.key))
    .map((p) => ({ href: p.path, label: p.nav_label }));
}

export function isPublished(content: SiteContent, key: SitePageKey): boolean {
  return key === 'home' || pageOf(content, key)?.is_published === true;
}

/** <title>/description of an inner page from its "Sahifalar" settings. */
export async function pageMetadata(key: SitePageKey): Promise<Metadata> {
  const content = await getSiteContent();
  const page = pageOf(content, key);
  if (!page) return {};
  const title = page.seo_title || page.title.replaceAll('*', '');
  const description = page.seo_description || page.subtitle || content.settings.seo_description || undefined;
  return {
    title: { absolute: `${title} — SUN MEDIA` },
    description,
    alternates: { canonical: page.path },
    openGraph: { title, description, url: page.path },
  };
}
