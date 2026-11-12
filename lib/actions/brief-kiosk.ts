'use server';

import { createClient as createStandaloneClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { beginAttempt, finishAttempt, waitText } from '@/lib/cabinet/attempts';
import { TOKEN_COOKIE } from '@/lib/brief/server';
import { getPublicEnv } from '@/lib/env';
import { KIOSK_COOKIE } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';

/**
 * Leaving client mode: only the signed-in manager, with their own password (checked on a throw-away session under
 * the same attempt limits as the site's sign-in). The client's interview key goes too, so the next person starts clean.
 */
export async function kioskUnlock(raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const password = z.string().min(1).max(200).safeParse(raw);
  if (!password.success) return { ok: false, message: 'Parolni kiriting.' };
  const jar = await cookies();
  const { data } = await (await createClient()).auth.getUser();
  const email = data.user?.email;
  if (!email) {
    // Nobody is signed in on this device: there is nothing behind the lock.
    jar.delete(KIOSK_COOKIE);
    jar.delete({ name: TOKEN_COOKIE, path: '/suhbat' });
    return { ok: true };
  }
  const attempt = await beginAttempt(email);
  if (!attempt) return { ok: false, message: 'Tekshiruv vaqtincha ishlamayapti. Birozdan so‘ng urinib ko‘ring.' };
  if (!attempt.ok) return { ok: false, message: `Juda ko‘p noto‘g‘ri urinish. ${waitText(attempt.retryAfter)}dan so‘ng qayta urinib ko‘ring.` };
  const { url, key } = getPublicEnv();
  const probe = createStandaloneClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await probe.auth.signInWithPassword({ email, password: password.data });
  await finishAttempt(attempt.attempt, !error);
  if (error) return { ok: false, message: 'Parol noto‘g‘ri.' };
  await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);
  jar.delete(KIOSK_COOKIE);
  jar.delete({ name: TOKEN_COOKIE, path: '/suhbat' });
  return { ok: true };
}
