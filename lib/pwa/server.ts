import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import type { createClient } from '@/lib/supabase/server';

/** This device's push subscription id (set when push is turned on): signing out stops this account's pushes here. */
export const PUSH_COOKIE = 'sm_push';

/**
 * Before a sign-out: this device stops receiving the account's notifications (lock screen included). Errors never
 * block the sign-out itself.
 */
export async function revokeThisDevice(db: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  const jar = await cookies();
  const id = z.uuid().safeParse(jar.get(PUSH_COOKIE)?.value);
  if (id.success) await db.rpc('revoke_push_device' as never, { p_id: id.data } as never).then(() => undefined, () => undefined);
  jar.delete(PUSH_COOKIE);
}
