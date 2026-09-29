import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { SectionTitle } from '@/components/ui/Card';
import { requireSystemOwner } from '@/lib/auth';
import { lookup, PLATFORM_LABEL } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Integratsiyalar' };

/** Tizim boshqaruvi → Integratsiyalar: push delivery and the connected social accounts. */
export default async function IntegrationsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const [tokensRes, socialRes] = await Promise.all([
    supabase.from('push_tokens').select('id', { count: 'exact', head: true }),
    supabase
      .from('social_accounts')
      .select('id, platform, handle, connection, sync_error, last_synced_at, updated_at, client:clients(name)')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
  ]);
  const social = socialRes.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader title="Integratsiyalar" description="Push bildirishnomalar va mijozlarning ijtimoiy tarmoq akkauntlari." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Push qabul qiladigan qurilmalar" value={String(tokensRes.count ?? 0)} />
        <Stat label="Ijtimoiy akkauntlar" value={String(social.length)} />
        <Stat label="Sinxronlash xatosi" value={String(social.filter((s) => s.sync_error).length)} tone={social.some((s) => s.sync_error) ? 'warning' : 'default'} />
      </div>
      <section>
        <SectionTitle>Ijtimoiy tarmoq akkauntlari</SectionTitle>
        {social.length === 0 ? (
          <EmptyRow>Hali ulangan akkaunt yo‘q. Natijalar hozircha qo‘lda kiritiladi.</EmptyRow>
        ) : (
          <Table columns={['Mijoz', 'Platforma', 'Akkaunt', 'Ulanish', 'Oxirgi sinxronlash']}>
            {social.map((s) => (
              <tr key={s.id} className={rowClass}>
                <td className={`${cellClass} font-medium`}>{s.client?.name ?? '—'}</td>
                <td className={cellClass}>{lookup(PLATFORM_LABEL, s.platform, s.platform)}</td>
                <td className={`${cellClass} font-mono text-[13px]`}>{s.handle}</td>
                <td className={cellClass}>
                  <Badge tone={s.sync_error ? 'danger' : s.connection === 'manual' ? 'neutral' : 'success'}>
                    {s.sync_error ? 'Xato' : s.connection === 'manual' ? 'Qo‘lda' : 'Avtomatik'}
                  </Badge>
                </td>
                <td className={`${cellClass} tabular text-muted`}>{s.last_synced_at ? formatShortDateTime(s.last_synced_at) : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
