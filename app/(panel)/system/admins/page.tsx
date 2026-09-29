import type { Metadata } from 'next';

import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { requireSystemOwner } from '@/lib/auth';
import { ACCOUNT_STATUS, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Adminlar' };

const LEADERSHIP = ['system_owner', 'owner', 'director', 'admin'];

/** Tizim boshqaruvi → Adminlar: who runs the agency (Tizim egasi, Rahbar, Adminlar) and their account state. */
export default async function AdminsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, role:roles!inner(key, name, rank), person:profiles!user_roles_user_id_fkey(full_name, email, status, last_seen_at, deleted_at)')
    .in('role.key', LEADERSHIP);
  if (error) throw error;
  const rows = data.filter((r) => r.person && !r.person.deleted_at).sort((a, b) => (a.role?.rank ?? 0) - (b.role?.rank ?? 0));

  return (
    <div>
      <PageHeader
        title="Adminlar"
        description="Tizim egasi, Rahbar va Adminlar. Admin hech qachon Tizim egasi akkauntini bloklay, o‘zgartira yoki parolini tiklay olmaydi."
        actions={<ButtonLink href="/team/new" variant="primary">+ Admin</ButtonLink>}
      />
      {rows.length === 0 ? (
        <EmptyRow>Hali admin yo‘q</EmptyRow>
      ) : (
        <Table columns={['Kim', 'Login', 'Rol', 'Holat', 'Oxirgi kirish']}>
          {rows.map((r) => {
            const status = lookup(ACCOUNT_STATUS, r.person!.status, ACCOUNT_STATUS.active);
            return (
              <tr key={`${r.user_id}-${r.role?.key}`} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/team/${r.user_id}?tab=access`}>
                    <span className="font-medium">{r.person!.full_name}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} font-mono text-[13px]`}>{r.person!.email ?? '—'}</td>
                <td className={cellClass}>
                  <Badge tone={r.role?.key === 'system_owner' ? 'violet' : 'accent'}>{r.role?.name}</Badge>
                </td>
                <td className={cellClass}>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{r.person!.last_seen_at ? formatShortDateTime(r.person!.last_seen_at) : 'Hali kirmagan'}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
