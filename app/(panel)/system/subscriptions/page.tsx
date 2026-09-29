import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EndSubscriptionButton, FeatureCell, GrantPlanForm, PriceInput } from '@/components/pro/SubscriptionControls';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Obunalar' };

const SOURCE: Record<string, string> = { internal: 'Ichki litsenziya', billing: 'To‘lov', promo: 'Promo kod', game: 'O‘yin', manual: 'Qo‘lda' };

/** Tizim boshqaruvi → Obunalar: who is on which SUN MEDIA plan, the plan catalogue (limits), and Pro requests. */
export default async function SubscriptionsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [wsRes, subsRes, plansRes, featuresRes, matrixRes, requestsRes] = await Promise.all([
    supabase.from('workspaces').select('id, kind, name, is_internal, inherits_agency_plan').order('kind').order('name'),
    supabase
      .from('workspace_subscriptions')
      .select('id, workspace_id, plan_key, status, source, starts_at, ends_at, note')
      .eq('status', 'active')
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order('created_at', { ascending: false }),
    supabase.from('saas_plans').select('key, name, price_cents, currency, billing_interval, rank').order('rank'),
    supabase.from('saas_features').select('key, name, audience, kind').order('position'),
    supabase.from('saas_plan_features').select('plan_key, feature_key, enabled, limit_value'),
    supabase
      .from('subscription_events')
      .select('id, workspace_id, data, created_at, actor:profiles!subscription_events_actor_id_fkey(full_name)')
      .eq('type', 'upgrade.requested')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  for (const r of [wsRes, subsRes, plansRes, featuresRes, matrixRes, requestsRes]) if (r.error) throw r.error;
  const workspaces = wsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const cell = (plan: string, feature: string) => matrixRes.data?.find((m) => m.plan_key === plan && m.feature_key === feature);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? '—';

  return (
    <div className="space-y-8">
      <PageHeader title="Obunalar" description="SUN MEDIA Pro va boshqa tariflar. Limitlar kodda emas — shu jadvalda sozlanadi. SUN MEDIA’ning o‘zi ichki muddatsiz litsenziyada." />

      <Card>
        <SectionTitle>Faol obunalar</SectionTitle>
        <Table columns={['Workspace', 'Tarif', 'Manba', 'Tugashi', '']}>
          {(subsRes.data ?? []).map((s) => (
            <tr key={s.id} className={rowClass}>
              <td className={cellClass}>{wsName(s.workspace_id)}</td>
              <td className={cellClass}>
                <Badge tone="accent">{plans.find((p) => p.key === s.plan_key)?.name ?? s.plan_key}</Badge>
              </td>
              <td className={`${cellClass} text-muted`}>{`${SOURCE[s.source] ?? s.source}${s.note ? ` · ${s.note}` : ''}`}</td>
              <td className={`${cellClass} whitespace-nowrap text-muted`}>{s.ends_at ? formatShortDateTime(s.ends_at) : 'Muddatsiz'}</td>
              <td className={cellClass}>{s.source === 'internal' ? null : <EndSubscriptionButton id={s.id} />}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-[13px] text-subtle">Obunasi yo‘q mijoz workspace’lari agentlik tarifidan foydalanadi (meros).</p>
      </Card>

      <Card>
        <SectionTitle>Obuna berish</SectionTitle>
        <GrantPlanForm workspaces={workspaces.filter((w) => !w.is_internal).map((w) => ({ id: w.id, name: `${w.name}${w.kind === 'client' ? ' (mijoz)' : ''}` }))} plans={plans.filter((p) => p.key !== 'free')} />
      </Card>

      <Card>
        <SectionTitle>Tariflar va imkoniyatlar</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
                <th className="py-3 pr-4">Imkoniyat</th>
                {plans.map((p) => (
                  <th key={p.key} className="py-3 pr-4">
                    <span className="block">{p.name}</span>
                    {p.key !== 'free' ? <PriceInput planKey={p.key} cents={p.price_cents} /> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(featuresRes.data ?? []).map((f) => (
                <tr key={f.key} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{f.name}</span>
                    <span className="block text-[12px] text-subtle">{f.audience === 'client' ? 'Mijoz ilovasi' : 'Agentlik'}</span>
                  </td>
                  {plans.map((p) => {
                    const c = cell(p.key, f.key);
                    return (
                      <td key={p.key} className="py-2.5 pr-4">
                        <FeatureCell planKey={p.key} featureKey={f.key} kind={f.kind as 'flag' | 'limit'} enabled={c?.enabled ?? false} limit={c?.limit_value ?? null} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>Pro so‘rovlari</SectionTitle>
        {(requestsRes.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">Hali so‘rov yo‘q.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {(requestsRes.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-3 py-2.5">
                <span>{`${r.actor?.full_name ?? '—'} · ${wsName(r.workspace_id)}`}</span>
                <span className="text-muted">{formatShortDateTime(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
