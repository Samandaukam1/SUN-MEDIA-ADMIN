import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { can, requireStaff } from '@/lib/auth';
import { formatMoney, REQUEST_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Tariflar' };

export default async function PlansPage() {
  const context = await requireStaff();
  if (!['plans.manage', 'subscriptions.read', 'subscriptions.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const [plansRes, requestsRes, subsRes] = await Promise.all([
    supabase
      .from('plans')
      .select('id, name, price, currency, duration_months, is_public, is_active, position, client:clients(id, name), features:plan_features(quantity, is_included, service:service_types(name, unit, position))')
      .is('deleted_at', null)
      .order('is_active', { ascending: false })
      .order('position')
      .order('price'),
    supabase
      .from('plan_upgrade_requests')
      .select('id, status, message, created_at, client:clients(id, name), plan:plans!plan_upgrade_requests_requested_plan_id_fkey(name), requester:profiles!plan_upgrade_requests_requested_by_fkey(full_name)')
      .eq('status', 'pending')
      .order('created_at'),
    supabase.from('client_subscriptions').select('plan_id').eq('status', 'active'),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (requestsRes.error) throw requestsRes.error;
  const activeByPlan = new Map<string, number>();
  (subsRes.data ?? []).forEach((s) => activeByPlan.set(s.plan_id, (activeByPlan.get(s.plan_id) ?? 0) + 1));
  const manage = can(context, 'plans.manage');

  return (
    <div>
      <PageHeader
        eyebrow="Boshqaruv"
        title="Tariflar"
        description="Tarif katalogi, mijozlar obunasi va tarifni o‘zgartirish so‘rovlari."
        actions={manage ? <ButtonLink href="/plans/new" variant="primary">Yangi tarif</ButtonLink> : null}
      />

      {requestsRes.data.length ? (
        <Card className="mb-8">
          <SectionTitle>{`Kutilayotgan so‘rovlar · ${requestsRes.data.length}`}</SectionTitle>
          <ul className="divide-y divide-line">
            {requestsRes.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${r.client?.id}?tab=plan`} className="font-medium hover:underline">
                    {r.client?.name}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {[`→ ${r.plan?.name ?? '—'}`, r.requester?.full_name, formatShortDateTime(r.created_at), r.message].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge tone={REQUEST_STATUS.pending.tone}>{REQUEST_STATUS.pending.label}</Badge>
                <ButtonLink href={`/clients/${r.client?.id}?tab=plan`}>
                  Ko‘rib chiqish
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {plansRes.data.length === 0 ? (
        <EmptyRow>Hali tarif yo‘q. “Yangi tarif” orqali birinchisini yarating.</EmptyRow>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {plansRes.data.map((p) => {
            const features = [...p.features].filter((f) => f.is_included).sort((a, b) => (a.service?.position ?? 0) - (b.service?.position ?? 0));
            const active = activeByPlan.get(p.id) ?? 0;
            return (
              <Card key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/plans/${p.id}`} className="text-lg font-semibold tracking-tight hover:underline">
                      {p.name}
                    </Link>
                    <p className="mt-1 text-2xl font-bold tracking-tight">{formatMoney(p.price, p.currency)}</p>
                    <p className="text-[13px] text-muted">{p.duration_months === 1 ? 'oyiga' : `${p.duration_months} oyga`}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {p.client ? <Badge tone="violet">Maxsus: {p.client.name}</Badge> : <Badge tone="accent">Ochiq</Badge>}
                    {p.is_active ? null : <Badge>O‘chirilgan</Badge>}
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {features.map((f, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{f.service?.name}</span>
                      <span className="font-medium tabular-nums">{f.quantity == null ? '✓' : `${f.quantity} ${f.service?.unit ?? ''}`}</span>
                    </li>
                  ))}
                  {features.length === 0 ? <li className="text-muted">Tarkib belgilanmagan</li> : null}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">{active ? `${active} ta mijoz hozir shu tarifda` : 'Hozir hech kim shu tarifda emas'}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
