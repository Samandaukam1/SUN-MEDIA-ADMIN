import { cellClass, ChipLinks, RowLink, rowClass, Table } from '@/components/panel/List';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ACCOUNT_STATUS, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

type Kind = 'staff' | 'client';

/**
 * Logins as a table: staff (Jamoa → Akkauntlar), clients (Mijozlar → Mijoz akkauntlari) or both with a filter
 * (Tizim boshqaruvi → Barcha akkauntlar). Opening a row leads to the page with reset / block actions.
 */
export async function AccountsList({ kinds, path, filter, onlyBlocked = false }: { kinds: Kind[]; path: string; filter?: string; onlyBlocked?: boolean }) {
  const supabase = await createClient();
  const [staffRes, clientRes] = await Promise.all([
    kinds.includes('staff')
      ? supabase
          .from('profiles')
          .select('id, full_name, email, status, last_seen_at, employee:employees!inner(job_title), user_roles!user_roles_user_id_fkey(role:roles(name))')
          .is('deleted_at', null)
          .order('full_name')
      : null,
    kinds.includes('client')
      ? supabase
          .from('client_members')
          .select('user_id, client:clients(id, name), role:roles(name), person:profiles!client_members_user_id_fkey(full_name, email, status, last_seen_at, deleted_at)')
          .order('created_at')
      : null,
  ]);
  if (staffRes?.error) throw staffRes.error;
  if (clientRes?.error) throw clientRes.error;

  const shown: Kind | undefined = kinds.length > 1 && (filter === 'staff' || filter === 'client') ? filter : undefined;
  const rows = [
    ...(staffRes?.data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      email: p.email,
      status: p.status,
      last: p.last_seen_at,
      kind: 'staff' as const,
      detail: p.user_roles.map((r) => r.role?.name).filter(Boolean).join(', ') || p.employee?.job_title || 'Xodim',
      href: `/team/${p.id}?tab=account`,
    })),
    ...(clientRes?.data ?? [])
      .filter((m) => m.person && !m.person.deleted_at)
      .map((m) => ({
        id: `${m.user_id}:${m.client?.id}`,
        name: m.person!.full_name,
        email: m.person!.email,
        status: m.person!.status,
        last: m.person!.last_seen_at,
        kind: 'client' as const,
        detail: `${m.role?.name ?? 'Mijoz'} · ${m.client?.name ?? ''}`,
        href: `/clients/${m.client?.id}?tab=users`,
      })),
  ]
    .filter((r) => !shown || r.kind === shown)
    .filter((r) => !onlyBlocked || r.status !== 'active');

  return (
    <div>
      {kinds.length > 1 ? (
        <div className="mb-5">
          <ChipLinks
            items={[
              { label: 'Hammasi', href: path, active: !shown },
              { label: 'Xodimlar', href: `${path}?kind=staff`, active: shown === 'staff' },
              { label: 'Mijozlar', href: `${path}?kind=client`, active: shown === 'client' },
            ]}
          />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyRow>{onlyBlocked ? 'Bloklangan akkaunt yo‘q.' : 'Akkaunt topilmadi.'}</EmptyRow>
      ) : (
        <Table columns={['Kim', 'Login', 'Rol', 'Holat', 'Oxirgi kirish']}>
          {rows.map((r) => {
            const status = lookup(ACCOUNT_STATUS, r.status, ACCOUNT_STATUS.active);
            return (
              <tr key={r.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={r.href}>
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-[13px] text-muted">{r.kind === 'staff' ? 'SUN MEDIA xodimi' : 'Mijoz'}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} font-mono text-[13px]`}>{r.email ?? '—'}</td>
                <td className={`${cellClass} text-muted`}>{r.detail}</td>
                <td className={cellClass}>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{r.last ? formatShortDateTime(r.last) : 'Hali kirmagan'}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
