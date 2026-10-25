import type { Metadata, Viewport } from 'next';
import { Unbounded } from 'next/font/google';

import { ApplicationDialog } from '@/components/site/ApplicationDialog';
import { CursorGlow } from '@/components/site/CursorGlow';
import { SiteFooter, socialLinks } from '@/components/site/SiteFooter';
import { REVEAL_SCRIPT } from '@/components/site/reveal-script';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SmoothScroll } from '@/components/site/SmoothScroll';
import { getSiteUrl } from '@/lib/env.server';
import { getSiteContent, navigation } from '@/lib/site/content';
import './site.css';
import { budgetOptions } from '@/lib/site/types';

// `subsets` only picks the files that are preloaded: every subset keeps its @font-face (unicode-range), so Cyrillic or
// extended-Latin letters still get Unbounded, fetched when a page has them. The site is Uzbek Latin, so preloading the
// Latin file alone keeps ~150 KB of unused font off the critical path.
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', display: 'swap' });

export const viewport: Viewport = { themeColor: '#050506', colorScheme: 'dark' };

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteContent();
  const title = settings.seo_title || 'SUN MEDIA';
  const description = settings.seo_description || undefined;
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: title, template: '%s — SUN MEDIA' },
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: '/' },
    openGraph: { type: 'website', locale: 'uz_UZ', siteName: 'SUN MEDIA', title, description, url: '/' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const content = await getSiteContent();
  const { settings } = content;
  const nav = navigation(content);
  const site = getSiteUrl();
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SUN MEDIA',
    url: site,
    logo: `${site}/icon.png`,
    description: settings.seo_description || undefined,
    email: settings.email || undefined,
    telephone: settings.phone_primary || undefined,
    address: settings.address || undefined,
    sameAs: socialLinks(settings).map((s) => s.href),
  };

  return (
    <div data-site className={unbounded.variable}>
      <SmoothScroll />
      <SiteHeader nav={nav} ctaLabel={settings.primary_cta_label} phone={settings.phone_primary} />
      <main>{children}</main>
      <SiteFooter settings={settings} nav={nav} />
      <ApplicationDialog labels={settings} budgets={budgetOptions(content.plans)} />
      <CursorGlow />
      <div className="s-grain" aria-hidden />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, '\\u003c') }} />
      {/* After the page's markup: starts the scroll reveals without waiting for the JavaScript bundle. */}
      <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
    </div>
  );
}
