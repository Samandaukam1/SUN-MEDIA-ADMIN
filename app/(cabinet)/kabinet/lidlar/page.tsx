import type { Metadata } from 'next';
import Link from 'next/link';

import { MonthlyBars } from '@/components/cabinet/Charts';
import { Chip, Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { SiteIcon } from '@/components/site/SiteIcon';
import { partnerHref, resolvePartner } from '@/lib/cabinet/partner-context';
import { LEAD_PERIODS, loadCrmReports, loadLeads, type LeadPeriod } from '@/lib/cabinet/partner-data';
import { formatNumber } from '@/lib/cabinet/stats';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Lidlar' };

const PERIOD_LABEL: Record<LeadPeriod, string> = { today: 'Bugun', '7d': '7 kun', '30d': '30 kun', all: 'Hammasi' };
const KIND_LABEL: Record<string, string> = { weekly: 'Haftalik hisobot', monthly: 'Oylik hisobot', custom: 'Hisobot' };
const PLATFORM: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', fb: 'Facebook', ig: 'Instagram', messenger: 'Messenger' };

function dateRange(from: string, to: string) {
  const f = from.split('-').reverse().join('.');
  const t = to.split('-').reverse().join('.');
  return from === to ? f : `${f} – ${t}`;
}

/** Leads SUN MEDIA's ads brought in (only the ones delivered to the partner) and the lead reports sent to them. */
export default async function PartnerLeadsPage({ searchParams }: { searchParams: Promise<{ brend?: string; davr?: string; oldin?: string }> }) {
  const params = await searchParams;
  const scope = await resolvePartner(params.brend);
  const period: LeadPeriod = (LEAD_PERIODS as readonly string[]).includes(params.davr ?? '') ? (params.davr as LeadPeriod) : '30d';
  const before = params.oldin && !Number.isNaN(Date.parse(params.oldin)) ? params.oldin : null;
  const [leads, reports] = await Promise.all([loadLeads(scope.clientId, period, before, 30), loadCrmReports(scope.clientId).catch(() => [])]);

  if (!leads) {
    return (
      <PartnerFrame scope={scope} title="Lidlar">
        <Panel>
          <p className="py-6 text-center text-[14px] text-[#8e8e96]">Lidlarni ko‘rish huquqi berilmagan. Brend rahbari yoki SUN MEDIA bilan bog‘laning.</p>
        </Panel>
      </PartnerFrame>
    );
  }
  const last = leads.leads.at(-1);
  const more = leads.leads.length === 30 && last;

  return (
    <PartnerFrame scope={scope} title="Lidlar" subtitle="Reklamadan kelgan va SUN MEDIA sizga yetkazgan mijozlar so‘rovlari.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LEAD_PERIODS.map((p) => (
          <Link key={p} href={partnerHref(scope, '/kabinet/lidlar', { davr: p })} className={`lg rounded-[22px] p-4 transition-transform hover:-translate-y-0.5 sm:p-5 ${p === period ? 'shadow-[0_0_0_1px_rgb(212_252_24/0.55)]' : ''}`}>
            <p className="text-[12.5px] font-medium text-[#a8a8ac]">{p === 'all' ? 'Jami lidlar' : `Lidlar · ${PERIOD_LABEL[p].toLowerCase()}`}</p>
            <p className="font-display mt-2 text-[28px] leading-none font-medium text-white tabular-nums">{formatNumber(leads.counts[p])}</p>
          </Link>
        ))}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {LEAD_PERIODS.map((p) => (
            <Chip key={p} href={partnerHref(scope, '/kabinet/lidlar', { davr: p })} active={p === period}>
              {PERIOD_LABEL[p]}
            </Chip>
          ))}
        </div>
        {leads.leads.length ? (
          <ul className="space-y-2.5">
            {leads.leads.map((lead) => {
              const extra = Object.entries(lead.fields ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
              return (
                <li key={lead.id} className="lg rounded-[22px] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-semibold break-words text-white">{lead.full_name || 'Ism ko‘rsatilmagan'}</p>
                      <p className="mt-1 text-[12.5px] break-words text-[#8e8e96]">
                        {[lead.campaign_name, lead.ad_name, lead.form_name].filter(Boolean).join(' · ') || 'Reklama so‘rovi'}
                        {lead.platform ? ` · ${PLATFORM[lead.platform] ?? lead.platform}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-[12.5px] text-[#a8a8ac]">{formatShortDateTime(lead.lead_at)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lead.phone ? (
                      <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#d4fc18] px-4 text-[13.5px] font-semibold text-[#0b0b0c]">
                        <SiteIcon name="phone" size={15} /> {lead.phone}
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[13.5px] text-white hover:bg-white/[0.1]">
                        <SiteIcon name="mail" size={15} /> {lead.email}
                      </a>
                    ) : null}
                  </div>
                  {extra.length ? (
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[13px] sm:grid-cols-2">
                      {extra.slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex min-w-0 gap-2">
                          <dt className="shrink-0 text-[#6e6e76]">{k.replace(/_/g, ' ')}:</dt>
                          <dd className="min-w-0 break-words text-[#d9d9de]">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Panel>
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-white/[0.05] text-[#8e8e96]">
                <SiteIcon name="target" size={22} />
              </div>
              <p className="text-[15px] font-medium text-white">{leads.counts.all ? 'Bu davrda lid yo‘q' : 'Hali lid yetkazilmagan'}</p>
              <p className="mt-1.5 max-w-md text-[13.5px] text-[#8e8e96]">
                {leads.counts.all
                  ? 'Boshqa davrni tanlang.'
                  : 'Reklama Meta orqali ulanganda kelgan so‘rovlar SUN MEDIA tekshiruvidan so‘ng shu yerda paydo bo‘ladi.'}
              </p>
            </div>
          </Panel>
        )}
        {more ? (
          <div className="mt-4 flex justify-center">
            <Link href={partnerHref(scope, '/kabinet/lidlar', { davr: period, oldin: last.lead_at })} className="lg inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
              Oldingi lidlar →
            </Link>
          </div>
        ) : null}
      </div>

      <div>
        <SectionTitle hint="SUN MEDIA yuborgan lid hisobotlari">Lid hisobotlari</SectionTitle>
        {reports.length ? (
          <div className="space-y-3">
            {reports.map((r, i) => (
              <details key={r.id} open={i === 0} className="lg group rounded-[22px] p-4 sm:p-5">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-white">{KIND_LABEL[r.kind] ?? 'Hisobot'} · {dateRange(r.period_start, r.period_end)}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#8e8e96]">Yuborildi: {formatShortDateTime(r.sent_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[22px] text-white tabular-nums">{formatNumber(r.data.total)}</span>
                    <span className="text-[12.5px] text-[#8e8e96]">lid</span>
                    <SiteIcon name="arrowRight" size={16} className="text-[#6e6e76] transition-transform group-open:rotate-90" />
                  </div>
                </summary>
                <div className="mt-4 space-y-5 border-t border-white/[0.06] pt-4">
                  {r.note ? <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-[#d9d9de]">{r.note}</p> : null}
                  {r.data.daily.length > 1 ? (
                    <MonthlyBars
                      months={r.data.daily.map((d) => d.date)}
                      dayLabels
                      series={[{ key: 'leads', label: 'Lidlar', color: '#d4fc18', values: r.data.daily.map((d) => d.count) }]}
                    />
                  ) : null}
                  {r.data.by_campaign.length ? (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold tracking-[0.12em] text-[#8e8e96] uppercase">Kampaniyalar bo‘yicha</p>
                      <ul className="space-y-1.5">
                        {r.data.by_campaign.map((c) => (
                          <li key={c.name} className="flex items-center gap-3 text-[13.5px]">
                            <span className="min-w-0 flex-1 truncate text-[#d9d9de]">{c.name}</span>
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06] sm:w-40">
                              <span className="block h-full rounded-full bg-[#d4fc18]" style={{ width: `${Math.round((c.count / Math.max(1, r.data.total)) * 100)}%` }} />
                            </span>
                            <span className="w-10 text-right font-semibold text-white tabular-nums">{c.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.data.daily_average !== undefined ? <p className="text-[13px] text-[#8e8e96]">Kuniga o‘rtacha: {formatNumber(r.data.daily_average)} ta</p> : null}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Panel>
            <p className="text-[13.5px] text-[#8e8e96]">Hali lid hisoboti yuborilmagan. SUN MEDIA haftalik yoki oylik hisobot yuborganda shu yerda chiqadi.</p>
          </Panel>
        )}
      </div>
    </PartnerFrame>
  );
}
