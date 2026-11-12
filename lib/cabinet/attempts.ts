import 'server-only';

import { z } from 'zod';

import { currentVisitor, loginKey } from '@/lib/site/visitor';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Attempt limits (database, by one-way keys of the visitor's IP and of the login)
// ---------------------------------------------------------------------------

export type Attempt = { ok: true; attempt: number; remaining: number } | { ok: false; retryAfter: number };

const attemptSchema = z.union([
  z.object({ ok: z.literal(true), attempt: z.number(), remaining: z.number() }),
  z.object({ ok: z.literal(false), retryAfter: z.number() }),
]);

export async function beginAttempt(email: string): Promise<Attempt | null> {
  const visitor = await currentVisitor();
  const account = await loginKey(email);
  if (!visitor || !account) return null;
  const { data, error } = await createAdminClient().rpc('site_login_begin', { p_visitor: visitor.key, p_account: account });
  if (error) return null;
  const parsed = attemptSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function finishAttempt(attempt: number, success: boolean): Promise<void> {
  await createAdminClient()
    .rpc('site_login_finish', { p_attempt: attempt, p_success: success })
    .then(
      () => undefined,
      () => undefined,
    );
}

export function waitText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} daqiqa${s ? ` ${s} soniya` : ''}` : `${s} soniya`;
}

