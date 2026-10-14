import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type TeamMember = { id: string; name: string; title: string; lastSeen: string | null; rank: number };

/** Everyone at SUN MEDIA (active staff accounts), leadership first, with their full names and last activity. */
export async function loadTeam(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, last_seen_at, status, employee:employees!inner(job_title, status, list:employee_skills(skill:skills(name))), user_roles!user_roles_user_id_fkey(role:roles(name, rank, scope))',
    )
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;
  return data
    .filter((p) => p.employee && p.employee.status !== 'terminated')
    .map((p) => {
      const roles = p.user_roles.map((r) => r.role).filter((r): r is NonNullable<typeof r> => !!r && r.scope === 'staff');
      const best = roles.sort((a, b) => a.rank - b.rank)[0];
      const skills = (p.employee?.list ?? []).map((s) => s.skill?.name).filter(Boolean) as string[];
      return {
        id: p.id,
        name: p.full_name,
        title: p.employee?.job_title || skills.slice(0, 2).join(', ') || best?.name || 'Xodim',
        lastSeen: p.last_seen_at,
        rank: best?.rank ?? 99,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
