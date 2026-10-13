'use server';

import { createClient as createStandaloneClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { getPublicEnv } from '@/lib/env';
import { toUserMessage } from '@/lib/errors';
import { passwordProblem } from '@/lib/password-policy';
import { currentVisitor, loginKey } from '@/lib/site/visitor';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { myContextSchema } from '@/types/app';
import { destinationFor, homeFor } from './routing';

// ---------------------------------------------------------------------------
// Attempt limits (database, by one-way keys of the visitor's IP and of the login)
// ---------------------------------------------------------------------------

type Attempt = { ok: true; attempt: number; remaining: number } | { ok: false; retryAfter: number };

const attemptSchema = z.union([
  z.object({ ok: z.literal(true), attempt: z.number(), remaining: z.number() }),
  z.object({ ok: z.literal(false), retryAfter: z.number() }),
]);

async function beginAttempt(email: string): Promise<Attempt | null> {
  const visitor = await currentVisitor();
  const account = await loginKey(email);
  if (!visitor || !account) return null;
  const { data, error } = await createAdminClient().rpc('site_login_begin', { p_visitor: visitor.key, p_account: account });
  if (error) return null;
  const parsed = attemptSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function finishAttempt(attempt: number, success: boolean): Promise<void> {
  await createAdminClient()
    .rpc('site_login_finish', { p_attempt: attempt, p_success: success })
    .then(
      () => undefined,
      () => undefined,
    );
}

function waitText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} daqiqa${s ? ` ${s} soniya` : ''}` : `${s} soniya`;
}

const UNAVAILABLE = 'Kirish vaqtincha ishlamayapti. Birozdan so‘ng qayta urinib ko‘ring.';

// ---------------------------------------------------------------------------
// Sign in from the website footer ("Xodimlar uchun" / "Hamkorlar uchun")
// ---------------------------------------------------------------------------

export type CabinetLoginState =
  | { status: 'idle' }
  | { status: 'error'; email: string; message: string; fieldErrors?: Partial<Record<'email' | 'password', string>>; retryAfter?: number };

const loginSchema = z.object({
  email: z.email({ message: 'Email manzilini to‘g‘ri kiriting (masalan, ism@kompaniya.uz)' }),
  password: z.string().min(1, { message: 'Parolni kiriting' }).max(200, { message: 'Parol juda uzun' }),
});

/**
 * One sign-in for everyone. Where the account lands is decided after the password check, from its own roles in the
 * database; which footer button opened the form does not matter.
 */
export async function cabinetSignIn(_prev: CabinetLoginState, formData: FormData): Promise<CabinetLoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') ?? '' });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<'email' | 'password', string>> = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] as 'email' | 'password';
      fieldErrors[key] ??= issue.message;
    });
    return { status: 'error', email, message: 'Maydonlarni tekshiring.', fieldErrors };
  }

  const attempt = await beginAttempt(email);
  if (!attempt) return { status: 'error', email, message: UNAVAILABLE };
  if (!attempt.ok) {
    return {
      status: 'error',
      email,
      message: `Juda ko‘p noto‘g‘ri urinish. ${waitText(attempt.retryAfter)}dan so‘ng qayta urinib ko‘ring.`,
      retryAfter: attempt.retryAfter,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  await finishAttempt(attempt.attempt, !error);
  if (error) {
    const wrong = error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message);
    const left = wrong && attempt.remaining <= 2 ? ` Yana ${attempt.remaining} ta urinish qoldi.` : '';
    return { status: 'error', email, message: `${toUserMessage(error)}${left}` };
  }

  const { data, error: contextError } = await supabase.rpc('get_my_context');
  const context = contextError ? null : (myContextSchema.safeParse(data).data ?? null);
  const to = destinationFor(context, formData.get('next'));
  if (!to) {
    await supabase.auth.signOut({ scope: 'local' });
    return {
      status: 'error',
      email,
      message:
        context?.status === 'pending'
          ? 'Akkauntingizga hali kirish huquqi berilmagan. SUN MEDIA administratoriga murojaat qiling.'
          : 'Akkaunt bloklangan yoki faol emas. SUN MEDIA administratoriga murojaat qiling.',
    };
  }
  redirect(to);
}

const AREA: Record<string, string> = {
  '/panel': 'Boshqaruv paneli',
  '/xodim': 'Xodim kabineti',
  '/kabinet': 'Hamkor kabineti',
  '/parol': 'Parolni almashtirish',
};

/** The footer form asks first: an already signed-in visitor gets a "continue" card instead of the form. */
export async function cabinetSession(): Promise<{ name: string; to: string; area: string } | null> {
  const context = await getSessionContext().catch(() => null);
  const to = destinationFor(context, null);
  if (!context || !to) return null;
  return { name: context.profile?.full_name || context.profile?.email || '', to, area: AREA[to] ?? '' };
}

/** "Boshqa akkaunt bilan kirish": ends this browser's session only. */
export async function cabinetSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
}

// ---------------------------------------------------------------------------
// Password change (forced after an admin-issued temporary password, or by choice)
// ---------------------------------------------------------------------------

export type PasswordState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<'current' | 'password' | 'repeat', string>> };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const context = await getSessionContext();
  const home = homeFor(context);
  if (!context || !home) redirect('/');
  const email = context.profile?.email;
  if (!email) return { status: 'error', message: 'Akkauntda email yo‘q. SUN MEDIA administratoriga murojaat qiling.' };

  const current = String(formData.get('current') ?? '');
  const password = String(formData.get('password') ?? '');
  const repeat = String(formData.get('repeat') ?? '');
  const fieldErrors: Partial<Record<'current' | 'password' | 'repeat', string>> = {};
  if (!current) fieldErrors.current = 'Joriy (vaqtinchalik) parolni kiriting';
  const problem = passwordProblem(password, { email, previous: current });
  if (problem) fieldErrors.password = problem;
  if (!fieldErrors.password && password !== repeat) fieldErrors.repeat = 'Parollar bir xil emas';
  if (Object.keys(fieldErrors).length) return { status: 'error', message: 'Maydonlarni tekshiring.', fieldErrors };

  // The current password is checked on a separate, throw-away session (counted against the same attempt limits).
  const attempt = await beginAttempt(email);
  if (!attempt) return { status: 'error', message: UNAVAILABLE };
  if (!attempt.ok) return { status: 'error', message: `Juda ko‘p noto‘g‘ri urinish. ${waitText(attempt.retryAfter)}dan so‘ng qayta urinib ko‘ring.` };
  const { url, key } = getPublicEnv();
  const probe = createStandaloneClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: wrong } = await probe.auth.signInWithPassword({ email, password: current });
  await finishAttempt(attempt.attempt, !wrong);
  if (wrong) {
    const invalid = wrong.code === 'invalid_credentials' || /invalid login credentials/i.test(wrong.message);
    return invalid
      ? { status: 'error', message: 'Joriy parol noto‘g‘ri.', fieldErrors: { current: 'Joriy parol noto‘g‘ri' } }
      : { status: 'error', message: toUserMessage(wrong) };
  }
  await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === 'same_password') return { status: 'error', message: 'Yangi parol eskisidan farq qilsin.', fieldErrors: { password: 'Yangi parol eskisidan farq qilsin' } };
    if (error.code === 'reauthentication_needed' || error.code === 'session_expired') {
      return { status: 'error', message: 'Xavfsizlik uchun qaytadan kiring, so‘ng parolni almashtiring.' };
    }
    return { status: 'error', message: toUserMessage(error) };
  }
  const { error: markError } = await supabase.rpc('mark_password_changed');
  if (markError) return { status: 'error', message: 'Parol almashtirildi, lekin holat saqlanmadi. Sahifani yangilang.' };
  redirect(home);
}
