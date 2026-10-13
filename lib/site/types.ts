import { z } from 'zod';

/** What public.get_site_content() returns: the published site in one document. */
const nullableText = z.string().nullable();

export const SITE_CURRENCIES = ['UZS', 'USD', 'EUR'] as const;
export type SiteCurrency = (typeof SITE_CURRENCIES)[number];

/** 5000000 UZS → "5 000 000 so‘m"; 1200 USD → "$1 200". Digits never split; a long price may wrap before "so‘m". */
export function formatPrice(price: number, currency: SiteCurrency): string {
  const fixed = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (cents ? `,${cents}` : '');
  if (currency === 'USD') return `$${grouped}`;
  if (currency === 'EUR') return `€${grouped}`;
  return `${grouped} so‘m`;
}

export const siteSettingsSchema = z.object({
  hero_eyebrow: z.string(),
  hero_title: z.string(),
  hero_subtitle: z.string(),
  primary_cta_label: z.string(),
  secondary_cta_label: z.string(),
  about_title: z.string(),
  about_body: z.string(),
  cta_title: z.string(),
  cta_subtitle: z.string(),
  phone_primary: nullableText,
  phone_secondary: nullableText,
  email: nullableText,
  address: nullableText,
  working_hours: nullableText,
  map_url: nullableText,
  telegram_url: nullableText,
  instagram_url: nullableText,
  youtube_url: nullableText,
  tiktok_url: nullableText,
  facebook_url: nullableText,
  linkedin_url: nullableText,
  form_title: z.string(),
  form_subtitle: z.string(),
  form_button_label: z.string(),
  form_link_label: z.string(),
  form_link_placeholder: z.string(),
  form_success_title: z.string(),
  form_success_text: z.string(),
  footer_note: z.string(),
  gate_label: z.string(),
  seo_title: z.string(),
  seo_description: z.string(),
  updated_at: z.string(),
});

export const SITE_PAGE_KEYS = ['home', 'services', 'cases', 'partners', 'plans', 'about', 'contact'] as const;
export type SitePageKey = (typeof SITE_PAGE_KEYS)[number];

export const SITE_SECTION_KEYS = ['marquee', 'stats', 'services', 'cases', 'benefits', 'process', 'partners', 'plans', 'testimonials', 'faq', 'cta'] as const;
export type SiteSectionKey = (typeof SITE_SECTION_KEYS)[number];

const pageSchema = z.object({
  key: z.enum(SITE_PAGE_KEYS),
  path: z.string(),
  nav_label: z.string(),
  title: z.string(),
  subtitle: z.string(),
  seo_title: z.string(),
  seo_description: z.string(),
  is_published: z.boolean(),
  show_in_nav: z.boolean(),
  sort_order: z.number(),
});

const sectionSchema = z.object({
  key: z.enum(SITE_SECTION_KEYS),
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string(),
  is_visible: z.boolean(),
  sort_order: z.number(),
});

const partnerRef = z.object({ id: z.string(), name: z.string(), logoUrl: nullableText }).nullable();

export const siteContentSchema = z.object({
  settings: siteSettingsSchema,
  pages: z.array(pageSchema),
  sections: z.array(sectionSchema),
  stats: z.array(z.object({ id: z.string(), value: z.string(), label: z.string(), description: z.string() })),
  services: z.array(
    z.object({ id: z.string(), title: z.string(), summary: z.string(), details: z.string(), bullets: z.array(z.string()), icon: z.string() }),
  ),
  partners: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      logoUrl: nullableText,
      sinceYear: z.number().nullable(),
      industry: z.string(),
      highlight: z.string(),
      description: z.string(),
      websiteUrl: nullableText,
    }),
  ),
  cases: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      partner: partnerRef,
      clientName: z.string(),
      category: z.string(),
      year: z.number().nullable(),
      summary: z.string(),
      challenge: z.string(),
      solution: z.string(),
      results: z.array(z.object({ value: z.string(), label: z.string() })),
      coverUrl: nullableText,
      gallery: z.array(z.string()),
      videoUrl: nullableText,
      isFeatured: z.boolean(),
    }),
  ),
  testimonials: z.array(
    z.object({ id: z.string(), quote: z.string(), authorName: z.string(), authorRole: z.string(), avatarUrl: nullableText, partner: partnerRef }),
  ),
  benefits: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), icon: z.string() })),
  steps: z.array(z.object({ id: z.string(), title: z.string(), description: z.string() })),
  faqs: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string() })),
  plans: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        price: z.coerce.number().nullable(),
        currency: z.enum(SITE_CURRENCIES),
        priceMode: z.enum(['fixed', 'from', 'negotiable']),
        billingPeriod: z.enum(['monthly', 'one_time']),
        isFeatured: z.boolean(),
        items: z.array(z.object({ id: z.string(), name: z.string(), quantity: z.string(), note: z.string() })),
      }),
    )
    .default([]),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type SiteSettings = SiteContent['settings'];
export type SitePage = SiteContent['pages'][number];
export type SiteSection = SiteContent['sections'][number];
export type SiteService = SiteContent['services'][number];
export type SitePartner = SiteContent['partners'][number];
export type SiteCase = SiteContent['cases'][number];
export type SiteTestimonial = SiteContent['testimonials'][number];
export type SiteBenefit = SiteContent['benefits'][number];
export type SiteStep = SiteContent['steps'][number];
export type SiteFaq = SiteContent['faqs'][number];
export type SiteStat = SiteContent['stats'][number];
export type SitePlan = SiteContent['plans'][number];

/** Icons the editor offers for services and benefits (drawn by components/site/SiteIcon). */
export const SITE_ICONS = [
  ['spark', 'Uchqun'],
  ['strategy', 'Strategiya'],
  ['camera', 'Kamera'],
  ['film', 'Video / montaj'],
  ['design', 'Dizayn'],
  ['target', 'Nishon / reklama'],
  ['chart', 'Grafik / natija'],
  ['team', 'Jamoa'],
  ['app', 'Ilova'],
  ['eye', 'Ko‘z / shaffoflik'],
  ['bolt', 'Tezlik'],
  ['send', 'Yetkazish'],
  ['star', 'Yulduz'],
  ['shield', 'Ishonch'],
  ['globe', 'Global'],
  ['message', 'Xabar'],
  ['heart', 'Yurak'],
  ['megaphone', 'Ovoz / PR'],
] as const;
export type SiteIconName = (typeof SITE_ICONS)[number][0];
export const SITE_ICON_KEYS = SITE_ICONS.map(([key]) => key) as SiteIconName[];

/** "Brendingizni *ko‘rinadigan* qilamiz" → plain and highlighted runs (asterisks mark the lime words). */
export function accentRuns(text: string): { text: string; accent: boolean }[] {
  const runs: { text: string; accent: boolean }[] = [];
  text.split('*').forEach((part, i) => {
    if (part) runs.push({ text: part, accent: i % 2 === 1 });
  });
  return runs;
}

export function plainTitle(text: string): string {
  return text.replaceAll('*', '');
}

/** +998901234567 → +998 90 123 45 67 (other countries stay as typed). */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return phone.startsWith('+') ? phone : `+${digits}`;
}

/** Years of partnership, counted from the year it started ("2021-yildan · 4 yil"). */
export function partnershipYears(sinceYear: number | null, now = new Date()): number | null {
  if (!sinceYear) return null;
  return Math.max(0, now.getFullYear() - sinceYear);
}
