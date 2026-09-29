'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSystemOwner } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './state';

/** Tizim boshqaruvi → Sessiyalar: sign one person out everywhere (their refresh tokens are revoked). */
export async function revokeSessionsAction(userId: string): Promise<ActionState> {
  await requireSystemOwner();
  if (!z.uuid().safeParse(userId).success) return { status: 'error', message: 'Noto‘g‘ri foydalanuvchi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('system_revoke_sessions', { p_user_id: userId });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/system/sessions');
  return { status: 'success', message: 'Barcha qurilmalardan chiqarildi.' };
}
