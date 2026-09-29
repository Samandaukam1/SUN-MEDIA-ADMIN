import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { cellClass, ChipLinks, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { can, requireStaff } from '@/lib/auth';
import { lookup, PROJECT_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Loyihalar' };

const KIND: Record<string, string> = { retainer: 'Oylik xizmat', campaign: 'Kampaniya', one_off: 'Bir martalik' };

/** Mijozlar → Loyihalar: every client project with its status, dates and how much content it has. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'projects.manage') && !can(context, 'clients.read_all')) redirect('/no-access?reason=permission');
  const { all } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('projects').select('id, name, kind, status, starts_on, ends_on, client:clients(id, name), content:content_items(id)').is('deleted_at', null).order('created_at', { ascending: false });
  if (!all) query = query.in('status', ['planning', 'active', 'on_hold']);
  const { data, error } = await query;
  if (error) throw error;

  return (
    <div>
      <PageHeader title="Loyihalar" description="Mijozlar bilan kelishilgan ishlar: oylik xizmat, kampaniya yoki bir martalik loyiha. Yangi loyiha mobil ilovadan ochiladi." />
      <div className="mb-5">
        <ChipLinks
          items={[
            { label: 'Faol', href: '/clients/projects', active: !all },
            { label: 'Hammasi', href: '/clients/projects?all=1', active: !!all },
          ]}
        />
      </div>
      {data.length === 0 ? (
        <EmptyRow>Loyiha yo‘q</EmptyRow>
      ) : (
        <Table columns={['Loyiha', 'Mijoz', 'Turi', 'Muddat', 'Kontent', 'Holat']}>
          {data.map((p) => {
            const status = lookup(PROJECT_STATUS, p.status, PROJECT_STATUS.active);
            return (
              <tr key={p.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/clients/${p.client?.id}`}>
                    <span className="font-medium">{p.name}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{p.client?.name ?? '—'}</td>
                <td className={`${cellClass} text-muted`}>{KIND[p.kind] ?? p.kind}</td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>
                  {p.starts_on ? formatDateKey(p.starts_on) : '—'}
                  {p.ends_on ? ` — ${formatDateKey(p.ends_on)}` : ''}
                </td>
                <td className={`${cellClass} tabular text-muted`}>{p.content.length}</td>
                <td className={cellClass}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
