import { cellClass, rowClass, Table } from '@/components/panel/List';
import { Badge } from '@/components/ui/Badge';
import { can } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadEmployeeFormOptions } from '@/lib/team-options';
import { formatShortDateTime } from '@/lib/time';
import type { StaffContext } from '@/types/app';
import { GrantAccessDialog } from './GrantAccessDialog';

const PROVIDER: Record<string, string> = { google: 'Google', apple: 'Apple', email: 'Email' };

/**
 * Kirish so‘rovlari: people who signed in (usually with Google) but have no role or company yet. Nobody gets
 * anything automatically — an admin gives a role, or declines.
 */
export async function AccessRequests({ context }: { context: StaffContext }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_access_requests');
  if (error || !data || data.length === 0) return null;
  const canStaff = can(context, 'employees.manage');
  const options = canStaff ? await loadEmployeeFormOptions(context) : null;
  const { data: clients } = await supabase.from('clients').select('id, name').is('deleted_at', null).eq('status', 'active').order('name');

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[15px] font-semibold">{`Kirish so‘rovlari (${data.length})`}</h2>
      <p className="mb-3 text-sm text-muted">Tizimga kirgan, lekin hali roli yo‘q akkauntlar. Tanisangiz kirish bering, aks holda rad eting.</p>
      <Table columns={['Kim', 'Qanday kirdi', 'So‘radi', { label: '', className: 'text-right' }]}>
        {data.map((r) => (
          <tr key={r.user_id} className={rowClass}>
            <td className={cellClass}>
              <span className="font-medium">{r.full_name || '—'}</span>
              <span className="block font-mono text-[13px] text-muted">{r.email ?? '—'}</span>
            </td>
            <td className={cellClass}>
              <div className="flex flex-wrap gap-1.5">
                {(r.providers ?? []).map((p) => (
                  <Badge key={p} tone={p === 'google' ? 'info' : 'neutral'}>
                    {PROVIDER[p] ?? p}
                  </Badge>
                ))}
                {r.status !== 'active' ? <Badge tone="danger">Rad etilgan</Badge> : null}
              </div>
            </td>
            <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(r.requested_at ?? r.created_at)}</td>
            <td className={cellClass}>
              {r.status === 'active' ? (
                <GrantAccessDialog
                  userId={r.user_id}
                  email={r.email}
                  fullName={r.full_name ?? ''}
                  canStaff={canStaff}
                  staffRoles={(options?.roles ?? []).filter((x) => x.value !== 'system_owner')}
                  clients={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              ) : null}
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
