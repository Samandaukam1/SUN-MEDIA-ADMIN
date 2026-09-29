import 'server-only';

import { isSystemOwnerAccount } from '@/lib/accounts';
import { isSystemOwner, requireStaff } from '@/lib/auth';

export const PROTECTED_MESSAGE = 'Tizim egasi akkauntini faqat Tizim egasining o‘zi o‘zgartira oladi.';

/**
 * Only the system owner may block, reset, re-role or re-permission a system owner account.
 * Returns an error message for everyone else (the database refuses the same calls on its own).
 */
export async function guardSystemOwner(targetId: string): Promise<string | null> {
  const context = await requireStaff();
  if (isSystemOwner(context)) return null;
  return (await isSystemOwnerAccount(targetId)) ? PROTECTED_MESSAGE : null;
}
