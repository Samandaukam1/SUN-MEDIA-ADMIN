import type { z } from 'zod';

import type { siteContentSchema } from './schema';

export const SITE_CURRENCIES = ['UZS', 'USD', 'EUR'] as const;
export type SiteCurrency = (typeof SITE_CURRENCIES)[number];

/** 5000000 UZS → "5 000 000 so‘m"; 1200 USD → "$1 200". Digits never split; a long price may wrap before "so‘m". */
/** The leading number of a tariff quantity ("10 ta", "oyiga 8 ta"), or null. */
export function quantityNumber(quantity: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(quantity ?? '');
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** "∞", "cheksiz", "chegarasiz", "unlimited", "безлимит" — an unlimited quantity. */
export function isUnlimited(quantity: string | null | undefined): boolean {
  return /∞|cheksiz|chegarasiz|limitsiz|unlimited|без ?лимит|безлимит/i.test(quantity ?? '');
}

/** A comparable quantity: a number, Infinity when unlimited, null when there is none. */
export function quantityValue(quantity: string | null | undefined): number | null {
  return isUnlimited(quantity) ? Infinity : quantityNumber(quantity);
}

/** How a quantity reads on the site: an unlimited one is a single "∞" (however it was typed). */
export function quantityLabel(quantity: string | null | undefined): string {
  return isUnlimited(quantity) ? '∞' : (quantity ?? '').trim();
}

export function formatPrice(price: number, currency: SiteCurrency): string {
  const fixed = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (cents ? `,${cents}` : '');
  if (currency === 'USD') return `$${grouped}`;
  if (currency === 'EUR') return `€${grouped}`;
  return `${grouped} so‘m`;
}

export const SITE_PAGE_KEYS = ['home', 'services', 'cases', 'partners', 'plans', 'about', 'contact'] as const;
export type SitePageKey = (typeof SITE_PAGE_KEYS)[number];

export const SITE_SECTION_KEYS = ['marquee', 'stats', 'services', 'cases', 'benefits', 'process', 'partners', 'plans', 'testimonials', 'faq', 'cta'] as const;
export type SiteSectionKey = (typeof SITE_SECTION_KEYS)[number];


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

/** Budget choices on the application form: the published tariffs with a price (the visitor may also type a sum). */
export type BudgetOption = { label: string; amount: number; plan: string };

export function budgetOptions(plans: SitePlan[]): BudgetOption[] {
  return plans
    .filter((p) => p.priceMode !== 'negotiable' && p.price !== null && Number(p.price) > 0)
    .map((p) => ({
      plan: p.name,
      amount: Number(p.price),
      label: `${p.name} — ${p.priceMode === 'from' ? 'dan ' : ''}${formatPrice(Number(p.price), p.currency)}${p.billingPeriod === 'monthly' ? ' / oy' : ''}`,
    }));
}
