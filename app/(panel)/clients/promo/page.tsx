import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { PromoForm, PromoToggle } from '@/components/pro/PromoForm';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Promo kodlar' };

const AUDIENCE: Record<string, string> = { clients: 'Mijozlar', everyone: 'Hamma', new_users: 'Yangi foydalanuvchilar', agency: 'Agentlik' };

/** Mijozlar → Promo kodlar: SUN MEDIA Pro for N days; one-time or limited, with the redemption count. */
export default async function PromoPage() {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const [codesRes, clientsRes] = await Promise.all([
    supabase
      .from('promo_codes')
      .select('id, code, title, reward_days, starts_at, expires_at, max_redemptions, per_user_limit, audience, is_active, redemption_count, eligible_client_ids')
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').is('deleted_at', null).eq('status', 'active').order('name'),
  ]);
  if (codesRes.error) throw codesRes.error;
  const clients = clientsRes.data ?? [];
  const now = Date.now();

  return (
    <div>
      <PageHeader title="Promo kodlar" description="Mijozga bir necha kunlik SUN MEDIA Pro. Kod faqat bir marta yoki belgilangan marta ishlaydi; o‘chirilmaydi, faqat to‘xtatiladi." />
      <Card className="mb-8">
        <SectionTitle>Yangi promo kod</SectionTitle>
        <PromoForm clients={clients} />
      </Card>
      {codesRes.data.length === 0 ? (
        <EmptyRow>Hali promo kod yo‘q.</EmptyRow>
      ) : (
        <Table columns={['Kod', 'Mukofot', 'Kim uchun', 'Ishlatildi', 'Muddat', 'Holat', '']}>
          {codesRes.data.map((p) => {
            const expired = p.expires_at && new Date(p.expires_at).getTime() < now;
            const usedUp = p.max_redemptions != null && p.redemption_count >= p.max_redemptions;
            return (
              <tr key={p.id} className={rowClass}>
                <td className={cellClass}>
                  <span className="font-mono font-medium">{p.code}</span>
                  <span className="block text-[13px] text-muted">{p.title}</span>
                </td>
                <td className={cellClass}>{`${p.reward_days} kun Pro`}</td>
                <td className={`${cellClass} text-muted`}>
                  {AUDIENCE[p.audience] ?? p.audience}
                  {p.eligible_client_ids.length ? ` · ${p.eligible_client_ids.map((id) => clients.find((c) => c.id === id)?.name ?? '—').join(', ')}` : ''}
                </td>
                <td className={`${cellClass} tabular`}>{`${p.redemption_count}${p.max_redemptions ? ` / ${p.max_redemptions}` : ''}`}</td>
                <td className={`${cellClass} whitespace-nowrap text-muted`}>{p.expires_at ? formatShortDateTime(p.expires_at) : 'Muddatsiz'}</td>
                <td className={cellClass}>
                  <Badge tone={!p.is_active || expired || usedUp ? 'neutral' : 'success'} dot>
                    {!p.is_active ? 'To‘xtatilgan' : expired ? 'Muddati tugagan' : usedUp ? 'Tugagan' : 'Faol'}
                  </Badge>
                </td>
                <td className={cellClass}>
                  <PromoToggle id={p.id} active={p.is_active} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
