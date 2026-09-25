import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { myContextSchema, type StaffContext } from '@/types/app';

/** Session context for this request (deduplicated across server components). */
export const getSessionContext = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase.rpc('get_my_context');
  if (error) throw error;
  return { ...myContextSchema.parse(data), userId };
});

/** Admin panel is for SUN MEDIA staff only; client users and role-less accounts are turned away. */
export async function requireStaff(): Promise<StaffContext> {
  const context = await getSessionContext();
  if (!context) redirect('/login');
  if (context.status !== 'active' || context.kind !== 'staff') redirect('/no-access');
  return context;
}

export function can(context: StaffContext, permission: string): boolean {
  return context.roles.some((r) => r.key === 'owner') || context.permissions.includes(permission);
}

/** Throws a redirect when the permission is missing — use at the top of protected pages. */
export async function requirePermission(permission: string): Promise<StaffContext> {
  const context = await requireStaff();
  if (!can(context, permission)) redirect('/no-access?reason=permission');
  return context;
}
