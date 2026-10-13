'use server';

import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeLink, normalizePhone } from './normalize';
import { currentVisitor as visitor } from './visitor';

// ---------------------------------------------------------------------------
// "Ariza qoldirish"
// ---------------------------------------------------------------------------

export type ApplicationState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<'fullName' | 'phone' | 'link' | 'company' | 'service' | 'message', string>> };

const applicationSchema = z.object({
  fullName: z.string().trim().min(2, { message: 'Ismingizni yozing' }).max(80, { message: 'Ism juda uzun' }),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((v) => /^\+[0-9]{9,15}$/.test(v), { message: 'Telefon raqamini to‘liq kiriting' }),
  company: z.string().trim().max(120, { message: 'Juda uzun' }),
  link: z
    .string()
    .trim()
    .max(500, { message: 'Havola juda uzun' })
    .transform(normalizeLink)
    .refine((v) => v !== null, { message: 'Havolani to‘g‘ri kiriting, masalan instagram.com/brend' }),
  service: z.string().trim().max(80),
  message: z.string().trim().max(2000, { message: 'Xabar 2000 belgidan oshmasin' }),
  source: z.string().trim().max(200).regex(/^\/[A-Za-z0-9/_-]*$/).catch('/'),
});

export async function submitApplication(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  const text = (key: string) => String(formData.get(key) ?? '');
  // Bots fill the hidden field or post faster than a person can type; they get a quiet "success".
  const startedAt = Number(text('startedAt'));
  if (text('website') !== '' || (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 2500)) {
    return { status: 'success' };
  }

  const parsed = applicationSchema.safeParse({
    fullName: text('fullName'),
    phone: text('phone'),
    company: text('company'),
    link: text('link'),
    service: text('service'),
    message: text('message'),
    source: text('source') || '/',
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<Extract<ApplicationState, { status: 'error' }>['fieldErrors']> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]) as keyof typeof fieldErrors;
      fieldErrors[key] ??= issue.message;
    }
    return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors };
  }

  const who = await visitor();
  if (!who) return { status: 'error', message: 'Ariza qabul qilish vaqtincha ishlamayapti. Iltimos, qo‘ng‘iroq qiling.' };
  const v = parsed.data;
  const { error } = await createAdminClient().rpc('site_submit_application', {
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_company: v.company,
    p_link_url: v.link ?? '',
    p_service: v.service,
    p_message: v.message,
    p_source_path: v.source,
    p_fingerprint: who.key,
    p_user_agent: who.userAgent,
  });
  if (error) {
    if (error.message === 'SITE_RATE_LIMITED') {
      return { status: 'error', message: 'Siz yaqinda ariza yubordingiz. Birozdan so‘ng qayta urinib ko‘ring.' };
    }
    return { status: 'error', message: 'Arizani yuborib bo‘lmadi. Qayta urinib ko‘ring yoki qo‘ng‘iroq qiling.' };
  }
  return { status: 'success' };
}
