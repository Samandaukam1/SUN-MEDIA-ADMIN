import 'server-only';

import { randomInt } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

// Ambiguous characters (0/O, 1/l/I) are left out so a password can be dictated over the phone.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';

const pick = (set: string) => set[randomInt(set.length)];

/**
 * Temporary password like "X9fa-K82p!": upper, digits, lower, a dash and a symbol (10 chars, ~50 bits).
 * Generated with the CSPRNG, shown to the admin once and never stored by the application.
 */
export function generateTemporaryPassword(): string {
  const first = [pick(UPPER), pick(DIGITS), pick(LOWER), pick(LOWER)].join('');
  const second = [pick(UPPER), pick(DIGITS), pick(DIGITS), pick(LOWER), pick(SYMBOLS)].join('');
  return `${first}-${second}`;
}

/** "Forever" for Supabase Auth bans (100 years). */
const BAN_FOREVER = '876000h';

export type CreatedLogin = { userId: string; email: string; password: string };

/**
 * Creates the Auth login with the service role. This is the ONLY step that needs it; roles,
 * memberships and permissions are written by the caller's own session through provisioning RPCs.
 */
export async function createLogin(email: string, fullName: string): Promise<CreatedLogin> {
  const password = generateTemporaryPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw error ?? new Error('User was not created');
  return { userId: data.user.id, email, password };
}

/** Compensation when provisioning fails after the login was created. */
export async function deleteLogin(userId: string): Promise<void> {
  await createAdminClient().auth.admin.deleteUser(userId);
}

/** Sets a new temporary password (after the database authorized the reset). */
export async function setTemporaryPassword(userId: string): Promise<string> {
  const password = generateTemporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) throw error;
  return password;
}

/**
 * Blocks or unblocks sign-in. Row access is already cut by RLS the moment the profile status changes;
 * the ban also stops refresh tokens so open sessions end.
 */
export async function setLoginBlocked(userId: string, blocked: boolean): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: blocked ? BAN_FOREVER : 'none' });
  if (error) throw error;
}
