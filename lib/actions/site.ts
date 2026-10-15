'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { getPublicEnv } from '@/lib/env';
import { toUserMessage } from '@/lib/errors';
import { isCollectionKey, SITE_COLLECTIONS, type SiteCollectionKey, type SiteField } from '@/lib/site/collections';
import { SITE_CONTENT_TAG } from '@/lib/site/content';
import { normalizeHttpsLink, normalizePhone, slugify } from '@/lib/site/normalize';
import { SITE_ICON_KEYS, SITE_PAGE_KEYS, SITE_SECTION_KEYS } from '@/lib/site/types';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

/** Every save shows on the public site at once (cached content + static pages). */
function refreshSite(adminPath?: string) {
  revalidateTag(SITE_CONTENT_TAG);
  revalidatePath('/', 'layout');
  if (adminPath) revalidatePath(adminPath);
}

/** Public brand imagery: site uploads live under branding/site/, client logos elsewhere in branding/. */
const brandingPrefix = () => `${getPublicEnv().url}/storage/v1/object/public/branding/`;

/** Images must come from our own storage (an upload here, or a client logo already in "branding"). */
function ownImage(value: string): boolean {
  return value.startsWith(brandingPrefix()) && value.length <= 600 && !/\s/.test(value) && !value.includes('..');
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Optional https link: '' → null, "brend.uz" → https://brend.uz. */
const linkSchema = () =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .nullable()
      .transform((v, ctx) => {
        if (v === null) return null;
        const link = normalizeHttpsLink(v);
        if (!link || link.length > 300) {
          ctx.addIssue({ code: 'custom', message: 'Havolani to‘g‘ri kiriting (https://…)' });
          return z.NEVER;
        }
        return link;
      }),
  );

function fieldSchema(f: SiteField) {
  const max = f.max ?? 500;
  switch (f.type) {
    case 'text':
    case 'textarea': {
      const s = z.string().trim().max(max, { message: `${max} belgidan oshmasin` });
      return f.required ? s.min(1, { message: `${f.label} kerak` }) : s;
    }
    case 'slug':
      return z.string().trim().max(80).transform((v) => slugify(v));
    case 'url':
      return linkSchema();
    case 'image':
      return z.preprocess(blankToNull, z.string().refine(ownImage, { message: 'Rasmni shu yerda yuklang' }).nullable());
    case 'gallery':
      return z.array(z.string().refine(ownImage, { message: 'Rasmni shu yerda yuklang' })).max(f.items ?? 12, { message: `${f.items ?? 12} tagacha rasm` });
    case 'list':
      return z
        .array(z.string())
        .transform((items) => items.map((i) => i.trim()).filter(Boolean))
        .pipe(z.array(z.string().max(max, { message: `Har biri ${max} belgigacha` })).max(f.items ?? 8, { message: `${f.items ?? 8} tagacha` }));
    case 'results':
      return z
        .array(z.object({ value: z.string().trim(), label: z.string().trim() }))
        .transform((rows) => rows.filter((r) => r.value || r.label))
        .pipe(
          z
            .array(
              z.object({
                value: z.string().min(1, { message: 'Qiymatni yozing' }).max(16, { message: 'Qiymat 16 belgigacha' }),
                label: z.string().min(1, { message: 'Izohni yozing' }).max(60, { message: 'Izoh 60 belgigacha' }),
              }),
            )
            .max(f.items ?? 6, { message: `${f.items ?? 6} tagacha natija` }),
        );
    case 'timeline':
      return z
        .array(z.object({ period: z.string().trim(), title: z.string().trim(), text: z.string().trim() }))
        .transform((rows) => rows.filter((r) => r.period || r.title || r.text))
        .pipe(
          z
            .array(
              z.object({
                period: z.string().max(40, { message: 'Davr 40 belgigacha' }),
                title: z.string().min(1, { message: 'Bosqich nomini yozing' }).max(80, { message: 'Nomi 80 belgigacha' }),
                text: z.string().max(400, { message: 'Matn 400 belgigacha' }),
              }),
            )
            .max(f.items ?? 12, { message: `${f.items ?? 12} tagacha bosqich` }),
        );
    case 'icon':
      return z.enum(SITE_ICON_KEYS as [string, ...string[]]).catch('spark');
    case 'partner':
      return z.preprocess(blankToNull, z.uuid().nullable());
    case 'boolean':
      return z.boolean();
    case 'year':
      return z.preprocess(
        (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
        z.number().int().min(1990, { message: '1990–2100' }).max(2100, { message: '1990–2100' }).nullable(),
      );
  }
}

function collectionSchema(key: SiteCollectionKey) {
  return z.object(Object.fromEntries(SITE_COLLECTIONS[key].fields.map((f) => [f.key, fieldSchema(f)])));
}

/** Storage files a row points at (images + galleries), to remove the ones nothing uses any more. */
function imagesOf(key: SiteCollectionKey, row: Record<string, unknown> | null | undefined): string[] {
  if (!row) return [];
  return SITE_COLLECTIONS[key].fields.flatMap((f) => {
    const v = row[f.key];
    if (f.type === 'image' && typeof v === 'string') return [v];
    if (f.type === 'gallery' && Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  });
}

/** Deletes files this section uploaded (branding/site/…); client logos it merely points at are left alone. */
async function removeImages(urls: string[]) {
  const prefix = `${brandingPrefix()}site/`;
  const paths = urls.filter((u) => u.startsWith(prefix) && !u.includes('..')).map((u) => decodeURIComponent(u.slice(brandingPrefix().length)));
  if (!paths.length) return;
  const supabase = await createClient();
  await supabase.storage.from('branding').remove(paths);
}

type Row = Record<string, unknown> & { id: string };

async function uniqueSlug(table: 'site_cases' | 'site_partners', base: string, id: string | null): Promise<string> {
  const supabase = await createClient();
  const root = base || `${table === 'site_cases' ? 'keys' : 'hamkor'}-${Date.now().toString(36)}`;
  const { data } = await supabase.from(table).select('id, slug').like('slug', `${root}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== id).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root.slice(0, 74)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root.slice(0, 70)}-${Date.now().toString(36)}`;
}

export async function saveSiteItem(collection: string, id: string | null, values: Record<string, unknown>): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!isCollectionKey(collection)) return { status: 'error', message: 'Noma’lum bo‘lim.' };
  const config = SITE_COLLECTIONS[collection];
  const parsed = collectionSchema(collection).safeParse(values);
  if (!parsed.success) return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const data: Record<string, unknown> = { ...parsed.data };
  if (collection === 'cases') data.slug = await uniqueSlug('site_cases', (data.slug as string) || slugify(String(data.title)), id);
  if (collection === 'partners') data.slug = await uniqueSlug('site_partners', (data.slug as string) || slugify(String(data.name)), id);

  const supabase = await createClient();
  // The generated types are per table; `data` was validated against this table's own columns above.
  const table = () => supabase.from(config.table as 'site_faqs');

  let previous: Row | null = null;
  if (id) {
    previous = ((await table().select('*').eq('id', id).maybeSingle()).data as Row | null) ?? null;
    if (!previous) return { status: 'error', message: 'Yozuv topilmadi. Sahifani yangilang.' };
    const { error } = await table().update(data as never).eq('id', id);
    if (error) return { status: 'error', message: toUserMessage(error) };
  } else {
    const { data: last } = await table().select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const { error } = await table().insert({ ...data, sort_order: (last?.[0]?.sort_order ?? -1) + 1 } as never);
    if (error) return { status: 'error', message: toUserMessage(error) };
  }

  const kept = new Set(imagesOf(collection, data));
  await removeImages(imagesOf(collection, previous).filter((u) => !kept.has(u)));
  refreshSite(`/site/${collection}`);
  return { status: 'success', message: id ? 'Saqlandi. Saytda yangilandi.' : 'Qo‘shildi. Saytda chiqdi.' };
}

export async function deleteSiteItem(collection: string, id: string): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!isCollectionKey(collection)) return { status: 'error', message: 'Noma’lum bo‘lim.' };
  const supabase = await createClient();
  const table = SITE_COLLECTIONS[collection].table as 'site_faqs';
  const { data: row } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  await removeImages(imagesOf(collection, row as Record<string, unknown> | null));
  refreshSite(`/site/${collection}`);
  return { status: 'success', message: 'O‘chirildi.' };
}

export async function setSiteItemPublished(collection: string, id: string, published: boolean): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!isCollectionKey(collection)) return { status: 'error', message: 'Noma’lum bo‘lim.' };
  const supabase = await createClient();
  const { error } = await supabase.from(SITE_COLLECTIONS[collection].table as 'site_faqs').update({ is_published: published }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite(`/site/${collection}`);
  return { status: 'success', message: published ? 'Saytda ko‘rinadi.' : 'Saytdan yashirildi.' };
}

/** Moves a row one place up or down and renumbers the list 0…n. */
export async function moveSiteItem(collection: string, id: string, direction: -1 | 1): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!isCollectionKey(collection)) return { status: 'error', message: 'Noma’lum bo‘lim.' };
  const supabase = await createClient();
  const table = SITE_COLLECTIONS[collection].table as 'site_faqs';
  const { data, error } = await supabase.from(table).select('id, sort_order, created_at').order('sort_order').order('created_at');
  if (error || !data) return { status: 'error', message: toUserMessage(error) };
  const ids = data.map((r) => r.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return { status: 'idle' };
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const changes = ids.map((rowId, index) => ({ rowId, index })).filter(({ rowId, index }) => data.find((r) => r.id === rowId)?.sort_order !== index);
  for (const { rowId, index } of changes) {
    const { error: e } = await supabase.from(table).update({ sort_order: index }).eq('id', rowId);
    if (e) return { status: 'error', message: toUserMessage(e) };
  }
  refreshSite(`/site/${collection}`);
  return { status: 'success' };
}

// ---------------------------------------------------------------------------
// Texts and contacts (site_settings)
// ---------------------------------------------------------------------------

const optionalPhone = z.preprocess(
  blankToNull,
  z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (v === null) return null;
      const phone = normalizePhone(v);
      if (!/^\+[0-9]{9,15}$/.test(phone)) {
        ctx.addIssue({ code: 'custom', message: 'Masalan: +998 90 123 45 67' });
        return z.NEVER;
      }
      return phone;
    }),
);
const optionalLink = linkSchema();
const text = (max: number, required = false) => {
  const s = z.string().trim().max(max, { message: `${max} belgidan oshmasin` });
  return required ? s.min(1, { message: 'To‘ldiring' }) : s;
};
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max, { message: `${max} belgidan oshmasin` }).nullable());

const settingsSchema = z.object({
  hero_eyebrow: text(80),
  hero_title: text(160, true),
  hero_subtitle: text(400),
  primary_cta_label: text(40, true),
  secondary_cta_label: text(40, true),
  about_title: text(160),
  about_body: text(3000),
  cta_title: text(160),
  cta_subtitle: text(400),
  phone_primary: optionalPhone,
  phone_secondary: optionalPhone,
  email: z.preprocess(blankToNull, z.email({ message: 'Email manzilini to‘g‘ri kiriting' }).max(120).nullable()),
  address: optionalText(200),
  working_hours: optionalText(80),
  map_url: optionalLink,
  telegram_url: optionalLink,
  instagram_url: optionalLink,
  youtube_url: optionalLink,
  tiktok_url: optionalLink,
  facebook_url: optionalLink,
  linkedin_url: optionalLink,
  form_title: text(120, true),
  form_subtitle: text(300),
  form_button_label: text(40, true),
  form_link_label: text(60, true),
  form_link_placeholder: text(120),
  form_success_title: text(120, true),
  form_success_text: text(300),
  footer_note: text(200),
  gate_label: text(40, true),
  seo_title: text(80),
  seo_description: text(200),
});

export type SiteSettingsInput = z.input<typeof settingsSchema>;

export async function saveSiteSettings(values: Record<string, unknown>): Promise<ActionState> {
  await requirePermission('site.manage');
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('site_settings').update(parsed.data).eq('id', true);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/texts');
  return { status: 'success', message: 'Saqlandi. Saytda yangilandi.' };
}

// ---------------------------------------------------------------------------
// Pages and landing blocks
// ---------------------------------------------------------------------------

const pageSchema = z.object({
  nav_label: text(30, true),
  title: text(160, true),
  subtitle: text(400),
  seo_title: text(80),
  seo_description: text(200),
  is_published: z.boolean(),
  show_in_nav: z.boolean(),
});

export async function saveSitePage(key: string, values: Record<string, unknown>): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!(SITE_PAGE_KEYS as readonly string[]).includes(key)) return { status: 'error', message: 'Noma’lum sahifa.' };
  const parsed = pageSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const data = key === 'home' ? { ...parsed.data, is_published: true, show_in_nav: false } : parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('site_pages').update(data).eq('key', key as (typeof SITE_PAGE_KEYS)[number]);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/pages');
  return { status: 'success', message: 'Sahifa saqlandi.' };
}

const sectionSchema = z.object({ eyebrow: text(40), title: text(160), subtitle: text(400), is_visible: z.boolean() });

export async function saveSiteSection(key: string, values: Record<string, unknown>): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!(SITE_SECTION_KEYS as readonly string[]).includes(key)) return { status: 'error', message: 'Noma’lum blok.' };
  const parsed = sectionSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('site_sections').update(parsed.data).eq('key', key as (typeof SITE_SECTION_KEYS)[number]);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/pages');
  return { status: 'success', message: 'Blok saqlandi.' };
}

/** Reorders the menu pages or the landing blocks. */
export async function moveSiteOrder(kind: 'pages' | 'sections', key: string, direction: -1 | 1): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const table = kind === 'pages' ? 'site_pages' : 'site_sections';
  const { data, error } = await supabase.from(table).select('key, sort_order').order('sort_order').order('key');
  if (error || !data) return { status: 'error', message: toUserMessage(error) };
  const keys = data.map((r) => r.key as string);
  const from = keys.indexOf(key);
  const to = from + direction;
  // The landing page stays first in the menu list.
  if (from < 0 || to < 0 || to >= keys.length || (kind === 'pages' && (keys[to] === 'home' || key === 'home'))) return { status: 'idle' };
  [keys[from], keys[to]] = [keys[to], keys[from]];
  for (const [index, k] of keys.entries()) {
    if (data.find((r) => r.key === k)?.sort_order === index) continue;
    const { error: e } =
      kind === 'pages'
        ? await supabase.from('site_pages').update({ sort_order: index }).eq('key', k as (typeof SITE_PAGE_KEYS)[number])
        : await supabase.from('site_sections').update({ sort_order: index }).eq('key', k as (typeof SITE_SECTION_KEYS)[number]);
    if (e) return { status: 'error', message: toUserMessage(e) };
  }
  refreshSite('/site/pages');
  return { status: 'success' };
}

// ---------------------------------------------------------------------------
// Applications ("Arizalar") — a plain inbox, no CRM
// ---------------------------------------------------------------------------

export async function setApplicationStatus(id: string, status: 'new' | 'seen' | 'archived'): Promise<ActionState> {
  await requirePermission('site.manage');
  if (!['new', 'seen', 'archived'].includes(status)) return { status: 'error', message: 'Noma’lum holat.' };
  const supabase = await createClient();
  const { error } = await supabase.from('site_applications').update({ status }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/site/applications');
  revalidatePath('/site');
  return { status: 'success' };
}

export async function deleteApplication(id: string): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('site_applications').delete().eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/site/applications');
  revalidatePath('/site');
  return { status: 'success', message: 'Ariza o‘chirildi.' };
}

/** Images uploaded in an editor that was then cancelled. */
export async function discardSiteUploads(urls: string[]): Promise<void> {
  await requirePermission('site.manage');
  if (!Array.isArray(urls) || !urls.length) return;
  await removeImages(urls.filter((u) => typeof u === 'string').slice(0, 20));
}

// ---------------------------------------------------------------------------
// Tariffs ("Sayt › Tariflar")
// ---------------------------------------------------------------------------

const planItemSchema = z.object({
  id: z.preprocess(blankToNull, z.uuid().nullable()).optional(),
  name: z.string().trim().min(1, { message: 'Xizmat nomini yozing' }).max(120, { message: '120 belgigacha' }),
  quantity: z.string().trim().max(40, { message: '40 belgigacha' }),
  note: z.string().trim().max(160, { message: '160 belgigacha' }),
  // The system service this line is ('' = matched by name, or a new one).
  service_key: z.string().trim().max(60).regex(/^([a-z][a-z0-9_]*)?$/).default(''),
});

const planSchema = z
  .object({
    name: z.string().trim().min(1, { message: 'Tarif nomini yozing' }).max(80, { message: '80 belgigacha' }),
    description: z.string().trim().max(400, { message: '400 belgigacha' }),
    price_mode: z.enum(['fixed', 'from', 'negotiable']),
    price: z.preprocess(
      (v) => (typeof v === 'string' ? (v.replace(/[\s ,']/g, '') === '' ? null : Number(v.replace(/[\s ,']/g, ''))) : v),
      z.number({ message: 'Narxni raqam bilan yozing' }).min(0, { message: 'Narx manfiy bo‘lmaydi' }).max(999_999_999_999, { message: 'Juda katta narx' }).nullable(),
    ),
    currency: z.enum(['UZS', 'USD', 'EUR']),
    billing_period: z.enum(['monthly', 'one_time']),
    is_featured: z.boolean(),
    is_published: z.boolean(),
  })
  .refine((v) => v.price_mode === 'negotiable' || v.price !== null, { path: ['price'], message: 'Narxni kiriting yoki “Kelishiladi”ni tanlang' });

export type PlanItemInput = { id?: string | null; name: string; quantity: string; note: string; service_key: string };

export async function savePlan(id: string | null, values: Record<string, unknown>, items: PlanItemInput[]): Promise<ActionState> {
  await requirePermission('site.manage');
  const parsed = planSchema.safeParse(values);
  const parsedItems = z.array(planItemSchema).max(30, { message: '30 tagacha xizmat' }).safeParse(items);
  if (!parsed.success || !parsedItems.success) {
    const fieldErrors: Record<string, string> = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues);
    if (!parsedItems.success) {
      for (const issue of parsedItems.error.issues) {
        const key = issue.path.length >= 2 ? `items.${String(issue.path[0])}.${String(issue.path[1])}` : 'items';
        fieldErrors[key] ??= issue.message;
      }
    }
    return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('site_save_plan', {
    p_plan: { ...parsed.data, id, price: parsed.data.price_mode === 'negotiable' ? null : parsed.data.price },
    p_items: parsedItems.data.map((item) => ({ id: item.id ?? null, name: item.name, quantity: item.quantity, note: item.note, service_key: item.service_key })),
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/plans');
  return { status: 'success', message: id ? 'Tarif saqlandi: saytda ham, tizimda ham yangilandi.' : 'Tarif qo‘shildi: saytda ham, tizimda ham.' };
}

export async function deletePlan(id: string): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('site_plans').delete().eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/plans');
  return { status: 'success', message: 'Tarif o‘chirildi.' };
}

export async function setPlanPublished(id: string, published: boolean): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('site_plans').update({ is_published: published }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/plans');
  return { status: 'success' };
}

/** Only one tariff carries "Tavsiya etiladi": marking one clears the others first. */
export async function setPlanFeatured(id: string, featured: boolean): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  if (featured) {
    const { error: clear } = await supabase.from('site_plans').update({ is_featured: false }).eq('is_featured', true).neq('id', id);
    if (clear) return { status: 'error', message: toUserMessage(clear) };
  }
  const { error } = await supabase.from('site_plans').update({ is_featured: featured }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshSite('/site/plans');
  return { status: 'success' };
}

export async function movePlan(id: string, direction: -1 | 1): Promise<ActionState> {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.from('site_plans').select('id, sort_order, created_at').order('sort_order').order('created_at');
  if (error || !data) return { status: 'error', message: toUserMessage(error) };
  const ids = data.map((r) => r.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return { status: 'idle' };
  [ids[from], ids[to]] = [ids[to], ids[from]];
  for (const [index, rowId] of ids.entries()) {
    if (data.find((r) => r.id === rowId)?.sort_order === index) continue;
    const { error: e } = await supabase.from('site_plans').update({ sort_order: index }).eq('id', rowId);
    if (e) return { status: 'error', message: toUserMessage(e) };
  }
  refreshSite('/site/plans');
  return { status: 'success' };
}
