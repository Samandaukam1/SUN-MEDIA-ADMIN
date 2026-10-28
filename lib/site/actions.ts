'use server';

import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from './normalize';
import { currentVisitor as visitor } from './visitor';

// ---------------------------------------------------------------------------
// "Ariza qoldirish"
// ---------------------------------------------------------------------------

export type ApplicationField = 'firstName' | 'lastName' | 'brand' | 'phone' | 'social' | 'budget';
export type ApplicationState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<ApplicationField, string>>; code?: 'invalid' | 'rate' | 'failed' };

const TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;

/**
 * Where an application came from, from the ad link's own values only (the /ariza page passes them; the site's dialog
 * passes none). Unknown keys are dropped, values are short plain strings, and the channel is named only from what is
 * actually there — utm_source, a Meta click id, the Instagram app's own browser — never assumed.
 */
function attributionOf(raw: string, page: string, userAgent: string): Record<string, string> {
  let input: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
  } catch {
    // not JSON: no attribution
  }
  const out: Record<string, string> = {};
  for (const key of TRACKING) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, key === 'fbclid' ? 512 : 200);
    if (clean) out[key] = clean;
  }
  const inApp = /Instagram/i.test(userAgent);
  if (!Object.keys(out).length && !inApp) return {};
  const source = (out.utm_source ?? '').toLowerCase();
  const paid = !!out.fbclid || /^(cpc|ppc|cpm|paid|paid[_-]?social|social[_-]?paid|ads?)$/i.test(out.utm_medium ?? '');
  const network = /^(ig|instagram)$/.test(source) ? 'Instagram' : /^(fb|facebook|meta)$/.test(source) ? 'Facebook' : null;
  out.channel = network
    ? `${network}${paid ? ' reklama' : ''}`
    : source
      ? `UTM: ${out.utm_source!.slice(0, 60)}`
      : out.fbclid
        ? 'Meta (Instagram/Facebook) havolasi'
        : 'Instagram ilovasi';
  out.page = page;
  return out;
}

const person = (what: string) =>
  z
    .string()
    .trim()
    .min(2, { message: `${what}ni yozing` })
    .max(60, { message: 'Juda uzun' });

/** "@brend", "instagram.com/brend/", "t.me/brend" → "brend". */
const handle = (raw: string) =>
  raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');

const applicationSchema = z
  .object({
    firstName: person('Ism'),
    lastName: person('Familiya'),
    brand: z.string().trim().min(1, { message: 'Brend nomini yozing' }).max(120, { message: 'Juda uzun' }),
    phone: z
      .string()
      .transform(normalizePhone)
      .refine((v) => /^\+998[0-9]{9}$/.test(v) || (!v.startsWith('+998') && /^\+[0-9]{9,15}$/.test(v)), { message: 'Telefon raqamini to‘liq kiriting' }),
    instagram: z
      .string()
      .transform(handle)
      .refine((v) => v === '' || /^[A-Za-z0-9._]{1,30}$/.test(v), { message: 'Instagram username noto‘g‘ri' }),
    telegram: z
      .string()
      .transform(handle)
      .refine((v) => v === '' || /^[A-Za-z0-9_]{4,32}$/.test(v), { message: 'Telegram username noto‘g‘ri' }),
    budgetAmount: z
      .string()
      .transform((v) => Number(v.replace(/[^0-9.]/g, '')))
      .refine((v) => Number.isFinite(v) && v > 0 && v < 1e13, { message: 'Byudjetni tanlang yoki kiriting' }),
    budgetLabel: z.string().trim().max(120).catch(''),
    source: z.string().trim().max(200).regex(/^\/[A-Za-z0-9/_-]*$/).catch('/'),
  })
  .refine((v) => v.instagram !== '' || v.telegram !== '', { message: 'Instagram yoki Telegram username — kamida bittasini yozing', path: ['social'] });

export async function submitApplication(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  const text = (key: string) => String(formData.get(key) ?? '');

  const parsed = applicationSchema.safeParse({
    firstName: text('firstName'),
    lastName: text('lastName'),
    brand: text('brand'),
    phone: text('phone'),
    instagram: text('instagram'),
    telegram: text('telegram'),
    budgetAmount: text('budgetAmount'),
    budgetLabel: text('budgetLabel'),
    source: text('source') || '/',
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<Extract<ApplicationState, { status: 'error' }>['fieldErrors']> = {};
    for (const issue of parsed.error.issues) {
      const raw = String(issue.path[0]);
      const key = (raw === 'instagram' || raw === 'telegram' ? 'social' : raw === 'budgetAmount' ? 'budget' : raw) as ApplicationField;
      fieldErrors[key] ??= issue.message;
    }
    return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors, code: 'invalid' };
  }
  // Bots fill the hidden field or post a complete form faster than a person can type; they get a quiet "success". Checked
  // after validation, so a person who taps "Yuborish" on an empty form at once sees what is missing, never a false "qabul
  // qilindi".
  const startedAt = Number(text('startedAt'));
  if (text('website') !== '' || (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 2500)) {
    return { status: 'success' };
  }

  const who = await visitor();
  if (!who) return { status: 'error', message: 'Ariza qabul qilish vaqtincha ishlamayapti. Iltimos, qo‘ng‘iroq qiling.', code: 'failed' };
  const v = parsed.data;
  const { error } = await createAdminClient().rpc('site_apply', {
    p_first_name: v.firstName,
    p_last_name: v.lastName,
    p_brand: v.brand,
    p_phone: v.phone,
    p_instagram: v.instagram,
    p_telegram: v.telegram,
    p_budget_amount: v.budgetAmount,
    p_budget_label: v.budgetLabel,
    p_source_path: v.source,
    p_fingerprint: who.key,
    p_user_agent: who.userAgent,
    p_attribution: attributionOf(text('attribution'), v.source, who.userAgent),
  });
  if (error) {
    if (error.message === 'SITE_RATE_LIMITED') {
      return { status: 'error', message: 'Siz yaqinda ariza yubordingiz. Birozdan so‘ng qayta urinib ko‘ring.', code: 'rate' };
    }
    return { status: 'error', message: 'Arizani yuborib bo‘lmadi. Qayta urinib ko‘ring yoki qo‘ng‘iroq qiling.', code: 'failed' };
  }
  return { status: 'success' };
}
