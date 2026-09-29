import type { Metadata } from 'next';

import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Integratsiyalar' };

/** Mijozlar → Integratsiyalar: which client has Meta (pages, Instagram, forms, ad accounts) connected and working. */
export default async function IntegrationsPage() {
  await requirePermission('integrations.manage');
  const supabase = await createClient();
  const [clientsRes, assetsRes] = await Promise.all([
    supabase.from('clients').select('id, name, code, status').is('deleted_at', null).in('status', ['active', 'paused']).order('name'),
    supabase.from('meta_assets').select('client_id, asset_type, status, last_synced_at, sync_error').neq('status', 'disconnected'),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  const byClient = new Map<string, NonNullable<typeof assetsRes.data>>();
  for (const a of assetsRes.data ?? []) byClient.set(a.client_id, [...(byClient.get(a.client_id) ?? []), a]);

  return (
    <div>
      <PageHeader title="Integratsiyalar" description="Meta: Facebook sahifasi (lidlar), Instagram (statistika), lid formalar va reklama akkauntlari. Ulash uchun mijozni oching." />
      {clientsRes.data.length === 0 ? (
        <EmptyRow>Faol mijoz yo‘q.</EmptyRow>
      ) : (
        <Table columns={['Mijoz', 'Sahifa', 'Instagram', 'Lid forma', 'Reklama akk.', 'Holat']}>
          {clientsRes.data.map((c) => {
            const list = byClient.get(c.id) ?? [];
            const count = (t: string) => list.filter((a) => a.asset_type === t).length;
            const errors = list.filter((a) => a.status === 'error');
            const ig = list.find((a) => a.asset_type === 'instagram');
            return (
              <tr key={c.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/clients/${c.id}?tab=integrations`}>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-[13px] text-muted">{c.code}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} tabular`}>{count('page') || '—'}</td>
                <td className={`${cellClass} text-muted`}>{ig ? (ig.last_synced_at ? formatShortDateTime(ig.last_synced_at) : 'kutilmoqda') : '—'}</td>
                <td className={`${cellClass} tabular`}>{count('lead_form') || '—'}</td>
                <td className={`${cellClass} tabular`}>{count('ad_account') || '—'}</td>
                <td className={cellClass}>
                  {list.length === 0 ? (
                    <Badge>Ulanmagan</Badge>
                  ) : errors.length ? (
                    <Badge tone="danger" dot>{`${errors.length} ta xato`}</Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Ishlayapti
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
