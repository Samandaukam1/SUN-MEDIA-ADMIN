'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createGateToken, GATE_COOKIE, GATE_TTL_SECONDS, gateSecret, verifyGateToken, visitorKey } from './gate-token';
import { normalizeLink, normalizePhone } from './normalize';

async function visitor(): Promise<{ key: string; userAgent: string } | null> {
  const secret = gateSecret();
  if (!secret) return null;
  const h = await headers();
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return { key: await visitorKey(secret, ip), userAgent: (h.get('user-agent') ?? '').slice(0, 300) };
}

// ---------------------------------------------------------------------------
// Footer gate
// ---------------------------------------------------------------------------

export type GateResult =
  | { status: 'open'; to: string }
  | { status: 'invalid'; remaining: number }
  | { status: 'locked'; retryAfter: number }
  | { status: 'error'; message: string };

/** Footer link pressed: signed-in staff go straight to the panel; a code typed in the last 30 minutes skips the prompt. */
export async function gateShortcut(): Promise<string | null> {
  const context = await getSessionContext().catch(() => null);
  if (context?.kind === 'staff' && context.status === 'active') return '/panel';
  const store = await cookies();
  return (await verifyGateToken(store.get(GATE_COOKIE)?.value, gateSecret())) ? '/login' : null;
}

export async function openGate(code: string): Promise<GateResult> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return { status: 'invalid', remaining: -1 };
  const secret = gateSecret();
  const who = await visitor();
  if (!secret || !who) return { status: 'error', message: 'Kirish vaqtincha ishlamayapti.' };

  const { data, error } = await createAdminClient().rpc('site_gate_verify', { p_code: code, p_fingerprint: who.key });
  if (error) return { status: 'error', message: 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.' };
  const result = z
    .object({ ok: z.boolean(), reason: z.string().optional(), remaining: z.number().optional(), retryAfter: z.number().optional() })
    .parse(data);

  if (result.ok) {
    const store = await cookies();
    store.set(GATE_COOKIE, await createGateToken(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: GATE_TTL_SECONDS,
    });
    return { status: 'open', to: '/login' };
  }
  if (result.reason === 'locked') return { status: 'locked', retryAfter: result.retryAfter ?? 900 };
  if (result.reason === 'not_configured') return { status: 'error', message: 'Kirish kodi hali o‘rnatilmagan.' };
  return { status: 'invalid', remaining: result.remaining ?? 0 };
}

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
