'use server';

import { redirect } from 'next/navigation';

import { safeNextPath, toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { SignInState } from './actions';
import { devQuickLoginAvailable } from './devAccess';

/** DEV ONLY — local seed accounts (supabase/seed.sql). */
const DEV_ACCOUNTS: Record<string, string> = { owner: 'owner@sunmedia.local', admin: 'admin@sunmedia.local' };

/** Real email/password sign-in with a seed account; refused outside `next dev` against the local Supabase. */
export async function devQuickSignInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (process.env.NODE_ENV !== 'development' || !devQuickLoginAvailable()) {
    return { error: 'Tezkor kirish faqat lokal development muhitida ishlaydi.' };
  }
  const email = DEV_ACCOUNTS[String(formData.get('account'))];
  if (!email) return { error: 'Noma’lum test akkaunt.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: 'SunMedia2026!' });
  if (error) return { error: toUserMessage(error) };

  redirect(safeNextPath(formData.get('next')));
}
