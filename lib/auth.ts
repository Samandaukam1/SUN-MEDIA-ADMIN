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

/** The Tizim egasi (system owner): the one account above everyone, web panel only. */
export function isSystemOwner(context: StaffContext): boolean {
  return context.roles.some((r) => r.key === 'system_owner');
}

export function can(context: StaffContext, permission: string): boolean {
  return isSystemOwner(context) || context.permissions.includes(permission);
}

/**
 * The web panel is for the system owner and the admins (plus read-only oversight for the Rahbar);
 * everyone else works in the mobile app.
 */
export function canUsePanel(context: StaffContext): boolean {
  return isSystemOwner(context) || ['dashboard.view', 'employees.manage', 'clients.manage'].some((p) => context.permissions.includes(p));
}

/** Tizim boshqaruvi pages and actions. */
export async function requireSystemOwner(): Promise<StaffContext> {
  const context = await requireStaff();
  if (!isSystemOwner(context)) redirect('/no-access?reason=permission');
  return context;
}

/** Throws a redirect when the permission is missing — use at the top of protected pages. */
export async function requirePermission(permission: string): Promise<StaffContext> {
  const context = await requireStaff();
  if (!can(context, permission)) redirect('/no-access?reason=permission');
  return context;
}
