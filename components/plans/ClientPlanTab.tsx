import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { formatMoney, lookup, SUBSCRIPTION_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';
import type { Database } from '@/types/database';
import { AssignPlanForm, UpgradeDecision, UsageForm } from './ClientPlanForms';

type SubStatus = Database['public']['Enums']['subscription_status'];

type ClientPlan = {
  current: {
    id: string;
    status: SubStatus;
    starts_on: string;
    ends_on: string;
    price: number;
    currency: string;
    days_total: number;
    days_left: number;
    plan: { id: string; name: string };
  } | null;
  usage: { service_key: string; service_name: string; unit: string; planned: number | null; used: number; is_included: boolean; is_quantitative: boolean }[];
  upcoming: { id: string; plan_name: string; starts_on: string; ends_on: string; price: number; currency: string } | null;
  pending_request: { id: string; plan_name: string; message: string | null; created_at: string } | null;
  last_decision: { status: 'approved' | 'rejected'; plan_name: string; response: string | null; handled_at: string } | null;
  plans: { id: string; name: string; price: number; currency: string; duration_months: number; is_custom: boolean }[];
  history: { id: string; plan_name: string; status: SubStatus; starts_on: string; ends_on: string }[];
};

function UsageBar({ used, planned }: { used: number; planned: number | null }) {
  if (planned == null || planned === 0) return <div className="h-2 rounded-full bg-surface-2" />;
  const pct = Math.min(100, Math.round((used / planned) * 100));
  const over = used > planned;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={over ? 'h-2 bg-danger' : pct >= 85 ? 'h-2 bg-warning' : 'h-2 bg-ink'} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Client → Tarif: current period and usage, requests, assigning a plan, manual corrections. */
export async function ClientPlanTab({ clientId, manage }: { clientId: string; manage: boolean }) {
  const supabase = await createClient();
  const [planRes, servicesRes, ledgerRes] = await Promise.all([
    supabase.rpc('get_client_plan', { p_client_id: clientId }),
    supabase.from('service_types').select('key, name').eq('is_active', true).eq('is_quantitative', true).order('position'),
    supabase
      .from('client_plan_usage')
      .select('id, service_key, quantity, occurred_on, note, source, author:profiles!client_plan_usage_created_by_fkey(full_name)')
      .eq('client_id', clientId)
      .eq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  if (planRes.error) throw planRes.error;
  const data = planRes.data as unknown as ClientPlan;
  const today = agencyDateKey();
  const current = data.current;
  const serviceName = new Map((servicesRes.data ?? []).map((s) => [s.key, s.name]));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <Card>
          {current ? (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Joriy tarif</p>
                  <p className="text-2xl font-bold tracking-tight">{current.plan.name}</p>
                  <p className="text-sm text-muted">
                    {`${current.starts_on} — ${current.ends_on} · ${formatMoney(current.price, current.currency)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={lookup(SUBSCRIPTION_STATUS, current.status, SUBSCRIPTION_STATUS.active).tone} dot>
                    {lookup(SUBSCRIPTION_STATUS, current.status, SUBSCRIPTION_STATUS.active).label}
                  </Badge>
                  <span className="text-[13px] text-muted">{`${current.days_left} kun qoldi`}</span>
                </div>
              </div>
              <ul className="space-y-4">
                {data.usage.map((u) => (
                  <li key={u.service_key}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span className="font-medium">{u.service_name}</span>
                      <span className={u.planned != null && u.used > u.planned ? 'font-semibold text-danger tabular-nums' : 'tabular-nums text-muted'}>
                        {u.is_quantitative ? `${u.used} / ${u.planned ?? '∞'} ${u.unit}` : u.is_included ? 'kiritilgan' : '—'}
                      </span>
                    </div>
                    {u.is_quantitative ? <UsageBar used={u.used} planned={u.planned} /> : null}
                  </li>
                ))}
                {data.usage.length === 0 ? <li className="text-sm text-muted">Tarif tarkibi bo‘sh.</li> : null}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Mijozda faol tarif yo‘q. O‘ng tomonda tarif biriktiring.</p>
          )}
        </Card>

        {data.upcoming ? (
          <Card className="border-l-4 border-l-info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Keyingi davr</p>
                <p className="text-lg font-semibold">{data.upcoming.plan_name}</p>
                <p className="text-sm text-muted">{`${data.upcoming.starts_on} — ${data.upcoming.ends_on} · ${formatMoney(data.upcoming.price, data.upcoming.currency)}`}</p>
              </div>
              <Badge tone="info" dot>
                Rejalashtirilgan
              </Badge>
            </div>
          </Card>
        ) : null}

        {!data.pending_request && data.last_decision ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-medium">{`So‘nggi so‘rov: ${data.last_decision.plan_name}`}</span>
                <span className="text-muted">{` · ${formatShortDateTime(data.last_decision.handled_at)}${data.last_decision.response ? ` · ${data.last_decision.response}` : ''}`}</span>
              </p>
              <Badge tone={data.last_decision.status === 'approved' ? 'success' : 'danger'}>{data.last_decision.status === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan'}</Badge>
            </div>
          </Card>
        ) : null}

        {data.pending_request ? (
          <Card>
            <SectionTitle>Tarifni o‘zgartirish so‘rovi</SectionTitle>
            <p className="mb-1 text-sm">
              <span className="font-medium">{data.pending_request.plan_name}</span>
              <span className="text-muted">{` · ${formatShortDateTime(data.pending_request.created_at)}`}</span>
            </p>
            {data.pending_request.message ? <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm">{data.pending_request.message}</p> : null}
            {manage ? (
              <UpgradeDecision clientId={clientId} requestId={data.pending_request.id} planName={data.pending_request.plan_name} today={today} />
            ) : (
              <p className="text-[13px] text-muted">Qarorni tarif boshqaruvchisi qabul qiladi.</p>
            )}
          </Card>
        ) : null}

        <Card>
          <SectionTitle>Tarix</SectionTitle>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted">Oldingi davrlar yo‘q.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-medium">{h.plan_name}</span>
                  <span className="text-muted">{`${h.starts_on} — ${h.ends_on}`}</span>
                  <Badge tone={lookup(SUBSCRIPTION_STATUS, h.status, SUBSCRIPTION_STATUS.expired).tone}>{lookup(SUBSCRIPTION_STATUS, h.status, SUBSCRIPTION_STATUS.expired).label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {manage ? (
        <div className="space-y-6">
          <Card>
            <SectionTitle>{current ? 'Tarifni almashtirish' : 'Tarif biriktirish'}</SectionTitle>
            <AssignPlanForm
              clientId={clientId}
              today={today}
              plans={data.plans.map((p) => ({ id: p.id, label: `${p.name} — ${formatMoney(p.price, p.currency)}${p.is_custom ? ' (maxsus)' : ''}` }))}
            />
          </Card>
          <Card>
            <SectionTitle>Qo‘lda tuzatish</SectionTitle>
            <UsageForm clientId={clientId} today={today} services={servicesRes.data ?? []} />
            {ledgerRes.data?.length ? (
              <ul className="mt-5 divide-y divide-line border-t border-line text-[13px]">
                {ledgerRes.data.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-2">
                    <span>
                      <span className={l.quantity > 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>{l.quantity > 0 ? `+${l.quantity}` : l.quantity}</span>{' '}
                      {serviceName.get(l.service_key) ?? l.service_key}
                      {l.note ? <span className="text-muted">{` · ${l.note}`}</span> : null}
                    </span>
                    <span className="shrink-0 text-muted">{[l.author?.full_name, l.occurred_on].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
