import 'server-only';

import { isSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { StaffContext } from '@/types/app';

export type Option = { value: string; label: string; description?: string };

/**
 * Everything the "new employee" form needs: roles this admin may give (never above their own), clients,
 * the permissions they may pass on, what each role already includes, and the login domain.
 */
export async function loadEmployeeFormOptions(context: StaffContext) {
  const supabase = await createClient();
  const [rolesRes, clientsRes, domainRes, catalogueRes, grantsRes] = await Promise.all([
    supabase.from('roles').select('id, key, name, rank, description').eq('scope', 'staff').order('rank'),
    supabase.from('clients').select('id, name, code, industry').is('deleted_at', null).eq('status', 'active').order('name'),
    supabase.from('app_settings').select('value').eq('key', 'accounts.login_domain').maybeSingle(),
    supabase.from('permissions').select('key').eq('scope', 'staff').order('key'),
    supabase.from('role_permissions').select('permission_key, role:roles!inner(key, scope)').eq('role.scope', 'staff'),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  const roles = rolesRes.data;
  const myRank = Math.min(...context.roles.map((r) => roles.find((x) => x.key === r.key)?.rank ?? 1000));
  const owner = isSystemOwner(context);

  const rolePermissions: Record<string, string[]> = {};
  for (const g of grantsRes.data ?? []) {
    const key = g.role?.key;
    if (key) (rolePermissions[key] ??= []).push(g.permission_key);
  }

  return {
    // Only the system owner may create another system owner; everyone else stays below their own rank.
    roles: roles
      .filter((r) => (r.key === 'system_owner' ? owner : r.rank >= myRank))
      .map((r) => ({ value: r.key, label: r.name, description: r.description ?? undefined })),
    clients: (clientsRes.data ?? []).map((c) => ({ value: c.id, label: c.name, description: c.industry ?? c.code })),
    // A person can only pass on what they have (the database enforces the same rule).
    permissions: owner ? (catalogueRes.data ?? []).map((p) => p.key) : context.permissions.filter((p) => !p.startsWith('client.')),
    rolePermissions,
    loginDomain: typeof domainRes.data?.value === 'string' ? domainRes.data.value : 'sunmedia.uz',
  };
}
