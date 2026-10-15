import type { Metadata } from 'next';
import Link from 'next/link';

import { Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { CancelUpgrade, UpgradeButton } from '@/components/cabinet/partner/UpgradeRequest';
import { UsageBar } from '@/components/cabinet/partner/UsageBar';
import { SiteIcon } from '@/components/site/SiteIcon';
import { resolvePartner } from '@/lib/cabinet/partner-context';
import { loadPlan } from '@/lib/cabinet/partner-data';
import { formatPrice } from '@/lib/site/types';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Tarif' };

const dmy = (d: string) => d.split('-').reverse().join('.');
const price = (value: number | null, currency: string | null | undefined) =>
  value === null ? 'Kelishiladi' : formatPrice(value, currency === 'USD' ? 'USD' : currency === 'EUR' ? 'EUR' : 'UZS');

/** The partner's tariff: what it includes, how much of it this month is done, and the other tariffs SUN MEDIA offers. */
export default async function PartnerTariffPage({ searchParams }: { searchParams: Promise<{ brend?: string }> }) {
  const params = await searchParams;
  const scope = await resolvePartner(params.brend);
  const plan = await loadPlan(scope.clientId);
  const brand = new URLSearchParams(scope.brandQuery).get('brend');
  const canRequest = !scope.preview && scope.permissions.includes('client.plan.request_upgrade');

  if (!plan) {
    return (
      <PartnerFrame scope={scope} title="Tarif">
        <Panel>
          <p className="py-6 text-center text-[14px] text-[#8e8e96]">Tarifni ko‘rish huquqi berilmagan.</p>
        </Panel>
      </PartnerFrame>
    );
  }
  const current = plan.current;
  const elapsed = current ? Math.min(100, Math.max(0, Math.round(((current.days_total - current.days_left) / Math.max(1, current.days_total)) * 100))) : 0;

  return (
    <PartnerFrame scope={scope} title="Tarif" subtitle="Tarifingizga nima kiradi va shu oy qanchasi bajarildi.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel>
          {current ? (
            <>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#d4fc18] uppercase">Joriy tarif</p>
              <p className="font-display mt-2 text-[28px] leading-tight font-medium text-white">{current.plan.name}</p>
              {current.plan.description ? <p className="mt-2 text-[14px] leading-relaxed text-[#a8a8ac]">{current.plan.description}</p> : null}
              <dl className="mt-5 grid grid-cols-2 gap-3 text-[13.5px]">
                <div className="rounded-2xl bg-white/[0.04] px-3.5 py-3">
                  <dt className="text-[12px] text-[#8e8e96]">Muddat</dt>
                  <dd className="mt-0.5 text-white">
                    {dmy(current.starts_on)} – {dmy(current.ends_on)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3.5 py-3">
                  <dt className="text-[12px] text-[#8e8e96]">Narx</dt>
                  <dd className="mt-0.5 text-white">{price(current.price, current.currency)}</dd>
                </div>
              </dl>
              <div className="mt-5">
                <div className="flex justify-between text-[12.5px] text-[#a8a8ac]">
                  <span>{current.status === 'scheduled' ? 'Hali boshlanmagan' : 'Muddat o‘tishi'}</span>
                  <span>
                    <span className="font-semibold text-white">{current.days_left}</span> kun qoldi
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[#d4fc18]" style={{ width: `${elapsed}%` }} />
                </div>
              </div>
              {plan.upcoming ? (
                <p className="mt-4 text-[13px] text-[#a8a8ac]">
                  Keyingi tarif: <span className="text-white">{plan.upcoming.plan_name}</span> ({dmy(plan.upcoming.starts_on)} dan)
                </p>
              ) : null}
            </>
          ) : (
            <div className="py-4">
              <p className="font-display text-[20px] text-white">Faol tarif yo‘q</p>
              <p className="mt-2 text-[14px] text-[#a8a8ac]">Tarif biriktirilgach, xizmatlar va ularning bajarilishi shu yerda ko‘rinadi.</p>
            </div>
          )}
        </Panel>
        <Panel title="Shu oy bajarilishi" note="tarif bo‘yicha">
          {plan.usage.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {plan.usage.map((u) => (
                <UsageBar key={u.service_key} item={u} />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-[#8e8e96]">Tarifga xizmatlar hali kiritilmagan.</p>
          )}
        </Panel>
      </div>

      {plan.pending_request || plan.last_decision ? (
        <Panel>
          {plan.pending_request ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[14px] text-white">
                <SiteIcon name="clock" size={16} className="text-[#d4fc18]" />
                “{plan.pending_request.plan_name}” tarifiga o‘tish so‘rovingiz SUN MEDIA javobini kutmoqda ({formatShortDateTime(plan.pending_request.created_at)}).
              </p>
              {canRequest ? <CancelUpgrade brand={brand} requestId={plan.pending_request.id} /> : null}
            </div>
          ) : plan.last_decision ? (
            <p className="text-[14px] text-white">
              “{plan.last_decision.plan_name}” so‘rovi {plan.last_decision.status === 'approved' ? 'tasdiqlandi' : 'rad etildi'}
              {plan.last_decision.response ? `: ${plan.last_decision.response}` : '.'}
            </p>
          ) : null}
        </Panel>
      ) : null}

      <div>
        <SectionTitle hint={<Link href="/tariflar" className="hover:text-white">Saytdagi tariflar ↗</Link>}>SUN MEDIA tariflari</SectionTitle>
        {plan.plans.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.plans.map((p) => (
              <div key={p.id} className={`lg flex flex-col rounded-[26px] p-5 sm:p-6 ${p.is_current ? 'shadow-[0_0_0_1px_rgb(212_252_24/0.55)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[19px] font-medium text-white">{p.name}</p>
                  {p.is_current ? <span className="shrink-0 rounded-full bg-[#d4fc18] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0b0b0c]">Joriy</span> : null}
                  {p.is_custom && !p.is_current ? <span className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[11.5px] text-[#d9d9de]">Siz uchun</span> : null}
                </div>
                {p.description ? <p className="mt-2 text-[13.5px] leading-relaxed text-[#a8a8ac]">{p.description}</p> : null}
                <p className="font-display mt-4 text-[24px] text-white tabular-nums">
                  {price(p.price, p.currency)}
                  {p.price !== null && p.duration_months ? <span className="ml-1 text-[13px] text-[#8e8e96]">/ {p.duration_months === 1 ? 'oy' : `${p.duration_months} oy`}</span> : null}
                </p>
                {p.features.length ? (
                  <ul className="mt-4 space-y-2">
                    {p.features.map((f) => (
                      <li key={f.service_name} className="grid grid-cols-[18px_1fr] gap-2.5 text-[13.5px] text-[#e4e4e7]">
                        <span className="mt-[2px] grid size-[18px] place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
                          <SiteIcon name="check" size={11} strokeWidth={2.6} />
                        </span>
                        <span>
                          {f.service_name}
                          {f.quantity ? (
                            <span className="font-semibold text-white"> — {f.quantity} {f.unit ?? ''}</span>
                          ) : f.quantity === null && f.is_quantitative ? (
                            <span className="font-semibold text-white"> — ∞ cheksiz</span>
                          ) : null}
                          {f.note ? <span className="block text-[12px] text-[#8e8e96]">{f.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canRequest && !p.is_current && !plan.pending_request ? (
                  <div className="mt-auto pt-5">
                    <UpgradeButton brand={brand} planId={p.id} planName={p.name} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Panel>
            <p className="text-[14px] text-[#8e8e96]">
              Tariflar ro‘yxati hali kiritilmagan. Barcha tariflar:{' '}
              <Link href="/tariflar" className="text-[#d4fc18] hover:underline">
                sunmediagroup.uz/tariflar
              </Link>
            </p>
          </Panel>
        )}
      </div>

      {plan.history.length ? (
        <div>
          <SectionTitle>Oldingi tariflar</SectionTitle>
          <Panel>
            <ul className="divide-y divide-white/[0.06] text-[14px]">
              {plan.history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-white">{h.plan_name}</span>
                  <span className="text-[#8e8e96]">
                    {dmy(h.starts_on)} – {dmy(h.ends_on)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </PartnerFrame>
  );
}
