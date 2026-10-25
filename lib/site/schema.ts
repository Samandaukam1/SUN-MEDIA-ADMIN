import { z } from 'zod';

import { SITE_CURRENCIES, SITE_PAGE_KEYS, SITE_SECTION_KEYS } from './types';

/*
 * What public.get_site_content() returns: the published site in one document. Only the server parses it
 * (lib/site/content.ts); the site's browser code takes the plain helpers and types from ./types, so zod stays off
 * the public pages.
 */
const nullableText = z.string().nullable();

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
      slug: z.string(),
      name: z.string(),
      logoUrl: nullableText,
      sinceYear: z.number().nullable(),
      industry: z.string(),
      highlight: z.string(),
      description: z.string(),
      websiteUrl: nullableText,
      coverUrl: nullableText.default(null),
      story: z.string().default(''),
      services: z.array(z.string()).default([]),
      results: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
      timeline: z.array(z.object({ period: z.string(), title: z.string(), text: z.string() })).default([]),
      gallery: z.array(z.string()).default([]),
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
