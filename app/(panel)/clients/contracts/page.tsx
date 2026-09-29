import type { Metadata } from 'next';

import { AddContractDialog } from '@/components/clients/AddContractDialog';
import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { requirePermission } from '@/lib/auth';
import { CONTRACT_STATUS, formatMoney, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Shartnomalar' };

/** Mijozlar → Shartnomalar: number, period, amount and whether it is still in force. */
export default async function ContractsPage() {
  await requirePermission('contracts.manage');
  const supabase = await createClient();
  const [{ data, error }, clients] = await Promise.all([
    supabase.from('contracts').select('id, number, title, starts_on, ends_on, amount, currency, status, client:clients(id, name)').is('deleted_at', null).order('starts_on', { ascending: false }),
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
  ]);
  if (error) throw error;
  const today = agencyDateKey();

  return (
    <div>
      <PageHeader title="Shartnomalar" description="Har bir mijoz bilan tuzilgan shartnomalar va ularning muddati." actions={<AddContractDialog clients={clients.data ?? []} today={today} />} />
      {data.length === 0 ? (
        <EmptyRow>Hali shartnoma kiritilmagan. “+ Shartnoma” tugmasi bilan qo‘shing.</EmptyRow>
      ) : (
        <Table columns={['Shartnoma', 'Mijoz', 'Muddat', 'Summa', 'Holat']}>
          {data.map((c) => {
            const ending = c.status === 'active' && c.ends_on && c.ends_on >= today && c.ends_on <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
            const status = lookup(CONTRACT_STATUS, c.status, CONTRACT_STATUS.draft);
            return (
              <tr key={c.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/clients/${c.client?.id}`}>
                    <span className="font-medium">№ {c.number}</span>
                    {c.title ? <span className="block text-[13px] text-muted">{c.title}</span> : null}
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{c.client?.name ?? '—'}</td>
                <td className={`${cellClass} tabular whitespace-nowrap ${ending ? 'font-medium text-warning' : 'text-muted'}`}>
                  {formatDateKey(c.starts_on)} — {c.ends_on ? formatDateKey(c.ends_on) : 'muddatsiz'}
                  {ending ? ' · tez tugaydi' : ''}
                </td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{c.amount != null ? formatMoney(c.amount, c.currency) : '—'}</td>
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
