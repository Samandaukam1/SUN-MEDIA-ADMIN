import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type StaffOption = { id: string; name: string; roles: string[]; jobTitle: string | null };
export type ClientOption = { id: string; name: string; projects: { id: string; name: string }[] };

/** Active staff for "who does it" selects (RLS decides who the admin may see). */
export async function loadStaff(): Promise<StaffOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, status, employee:employees!inner(job_title, status), user_roles!user_roles_user_id_fkey(role:roles(key))')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('full_name');
  if (error) throw error;
  return data
    .filter((p) => p.employee?.status !== 'terminated')
    .map((p) => ({ id: p.id, name: p.full_name, jobTitle: p.employee?.job_title ?? null, roles: p.user_roles.map((r) => r.role?.key).filter((k): k is string => !!k) }));
}

/** Active clients with their open projects. */
export async function loadClients(): Promise<ClientOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, projects(id, name, status, deleted_at)')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    projects: (c.projects ?? []).filter((p) => !p.deleted_at && p.status !== 'cancelled' && p.status !== 'completed').map((p) => ({ id: p.id, name: p.name })),
  }));
}
