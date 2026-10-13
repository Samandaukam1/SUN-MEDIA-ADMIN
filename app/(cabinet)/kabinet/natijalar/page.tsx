import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MonthlyBars, MonthlyLine, type ChartSeries } from '@/components/cabinet/Charts';
import { Chip, EMPTY, Lines, MoneyCard, Panel, SectionTitle, StatCard } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { SiteIcon } from '@/components/site/SiteIcon';
import { loadPartnerCabinet } from '@/lib/cabinet/partner';
import { resolvePartner } from '@/lib/cabinet/partner-context';
import {
  filterRows,
  formatNumber,
  monthlySeries,
  monthName,
  monthsBetween,
  periodLabel,
  resolvePeriod,
  shiftMonth,
  totals,
  type Totals,
} from '@/lib/cabinet/stats';
import { PLATFORM_LABEL, PROJECT_STATUS, lookup } from '@/lib/labels';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Natijalar' };

type Params = { oy?: string; dan?: string; gacha?: string; platforma?: string; brend?: string };

function link(base: Params, change: Partial<Params>): string {
  const merged: Record<string, string | undefined> = { ...base, ...change };
  const q = new URLSearchParams();
  for (const key of ['brend', 'oy', 'dan', 'gacha', 'platforma']) if (merged[key]) q.set(key, merged[key]!);
  const s = q.toString();
  return s ? `/kabinet/natijalar?${s}` : '/kabinet/natijalar';
}

const LIME = '#d4fc18';
const SILVER = '#c9c9ce';

export default async function PartnerResultsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const scope = await resolvePartner(params.brend);
  const clientId = scope.clientId;

  const current = `${agencyDateKey().slice(0, 7)}-01`;
  const period = resolvePeriod(params, current);
  const [data, before] = await Promise.all([
    loadPartnerCabinet(clientId, period.from, period.to),
    loadPartnerCabinet(clientId, period.previous.from, period.previous.to),
  ]);
  if (data === 'forbidden' || before === 'forbidden') redirect(scope.home);

  const platform = data.accounts.some((a) => a.id === params.platforma) ? params.platforma! : null;
  const base: Params = { brend: new URLSearchParams(scope.brandQuery).get('brend') ?? undefined, platforma: platform ?? undefined };
  const periodParams: Params = { oy: params.oy, dan: params.dan, gacha: params.gacha };

  const rows = filterRows(data.metrics, period.from, period.to, platform);
  const prevRows = filterRows(before.metrics, period.previous.from, period.previous.to, platform);
  const now: Totals = totals(rows);
  const prev: Totals = totals(prevRows);
  const comparable = prev.months_with_data > 0;
  const prevName = periodLabel(period.previous.from, period.previous.to);
  const compare = comparable ? 'oldingi davrga nisbatan' : null;
  const p = (v: number | null) => (comparable ? v : undefined);

  const months = monthsBetween(period.from, period.to);
  const series = monthlySeries(rows, months);
  const pick = (k: keyof Totals) => series.map((s) => (s.totals ? (s.totals[k] as number | null) : null));
  const sources = new Set(rows.map((r) => r.source));
  const lastSync = rows.filter((r) => r.source === 'api').map((r) => r.synced_at ?? r.updated_at).sort().at(-1);
  const currencies = new Set(rows.filter((r) => r.ad_spend !== null).map((r) => r.ad_currency));
  const spendUnit = currencies.size === 1 ? ([...currencies][0] === 'USD' ? 'usd' : 'uzs') : null;

  // Reports are newest first: the newest one that lists finished work, and the newest one with a plan.
  const doneReport = data.reports.find((r) => r.work_done || r.delivery.length) ?? null;
  const planReport = data.reports.find((r) => r.work_planned) ?? null;

  const presets: { label: string; params: Params }[] = [
    { label: 'Joriy oy', params: { oy: current.slice(0, 7) } },
    { label: 'O‘tgan oy', params: { oy: shiftMonth(current, -1).slice(0, 7) } },
    { label: '3 oy', params: { dan: shiftMonth(current, -2).slice(0, 7), gacha: current.slice(0, 7) } },
    { label: '6 oy', params: { dan: shiftMonth(current, -5).slice(0, 7), gacha: current.slice(0, 7) } },
    { label: '12 oy', params: { dan: shiftMonth(current, -11).slice(0, 7), gacha: current.slice(0, 7) } },
  ];
  const presetActive = (pp: Params) => {
    const r = resolvePeriod(pp, current);
    return r.from === period.from && r.to === period.to;
  };
  const monthOptions = monthsBetween(shiftMonth(current, -23), current).reverse();
  const nothing = rows.length === 0 && data.reports.length === 0;

  const activitySeries: ChartSeries[] = [
    { key: 'likes', label: 'Layklar', color: LIME, values: pick('likes') },
    { key: 'comments', label: 'Izohlar', color: '#f4f4f5', values: pick('comments') },
    { key: 'shares', label: 'Ulashishlar', color: '#8e8e96', values: pick('shares') },
    { key: 'saves', label: 'Saqlashlar', color: '#7d9410', values: pick('saves') },
  ];
  const has = (list: ChartSeries[]) => list.some((s) => s.values.some((v) => v !== null));

  return (
    <PartnerFrame
      scope={scope}
      title="Natijalar"
      subtitle={data.updated_at ? `Oxirgi yangilanish: ${formatShortDateTime(data.updated_at)}` : 'Hali nashr qilingan ma’lumot yo‘q'}
    >
        {/* Filters */}
        <div className="lg space-y-4 rounded-[26px] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <SiteIcon name="calendar" size={17} className="mr-1 text-[#8e8e96]" />
            {presets.map((preset) => (
              <Chip key={preset.label} href={link(base, preset.params)} active={presetActive(preset.params)}>
                {preset.label}
              </Chip>
            ))}
          </div>
          <form method="get" action="/kabinet/natijalar" className="flex flex-wrap items-end gap-3">
            {base.brend ? <input type="hidden" name="brend" value={base.brend} /> : null}
            {platform ? <input type="hidden" name="platforma" value={platform} /> : null}
            <label className="text-[12px] text-[#8e8e96]">
              Dan
              <select name="dan" defaultValue={period.from.slice(0, 7)} className="mt-1 block h-10 rounded-xl border border-white/10 bg-[#111113] px-3 text-[13.5px] text-white">
                {monthOptions.map((m) => (
                  <option key={m} value={m.slice(0, 7)}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-[#8e8e96]">
              Gacha
              <select name="gacha" defaultValue={period.to.slice(0, 7)} className="mt-1 block h-10 rounded-xl border border-white/10 bg-[#111113] px-3 text-[13.5px] text-white">
                {monthOptions.map((m) => (
                  <option key={m} value={m.slice(0, 7)}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="h-10 rounded-xl bg-white/[0.08] px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-white/[0.14]">
              Ko‘rsatish
            </button>
          </form>
          {data.accounts.length > 1 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
              <Chip href={link({ ...base, ...periodParams }, { platforma: undefined })} active={!platform}>
                Barcha platformalar
              </Chip>
              {data.accounts.map((a) => (
                <Chip key={a.id} href={link({ ...base, ...periodParams }, { platforma: a.id })} active={platform === a.id}>
                  {lookup(PLATFORM_LABEL, a.platform, a.platform)} · @{a.handle}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5 px-1 text-[13px] leading-relaxed text-[#a8a8ac]">
          <p>
            <span className="font-semibold text-white">Davr: {periodLabel(period.from, period.to)}</span>
            {platform ? ` · ${data.accounts.find((a) => a.id === platform)?.handle ? `@${data.accounts.find((a) => a.id === platform)!.handle}` : ''}` : ''}. Kartalar
            va grafiklar shu davrning bir xil ma’lumotidan hisoblangan.
          </p>
          <p>
            {comparable
              ? `Foizlar oldingi davr — ${prevName} — bilan solishtirilgan.`
              : `Oldingi davr (${prevName}) uchun ma’lumot yo‘q, shuning uchun o‘sish foizi ko‘rsatilmaydi.`}
          </p>
          {sources.size ? (
            <p>
              Manba:{' '}
              {[
                sources.has('manual') ? 'SUN MEDIA tomonidan qo‘lda kiritilgan raqamlar' : null,
                sources.has('api') ? `Instagram’dan avtomatik sinxronlangan${lastSync ? ` (oxirgi: ${formatShortDateTime(lastSync)})` : ''}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </p>
          ) : null}
        </div>

        {nothing ? (
          <Panel>
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.05] text-[#8e8e96]">
                <SiteIcon name="chart" size={24} />
              </div>
              <p className="font-display text-[17px] text-white">Bu davr uchun ma’lumot hali nashr qilinmagan</p>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[#a8a8ac]">
                SUN MEDIA statistika va hisobotni nashr qilgach, ular shu yerda ko‘rinadi. Boshqa davrni tanlab ko‘ring.
              </p>
            </div>
          </Panel>
        ) : null}

        {rows.length ? (
          <>
            <div>
              <SectionTitle hint={period.length > 1 ? 'Ko‘rishlar va qamrov — oylar yig‘indisi' : undefined}>Auditoriya</SectionTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Ko‘rishlar" value={now.views} previous={p(prev.views)} compareLabel={compare} />
                <StatCard label="Qamrov (reach)" value={now.reach} previous={p(prev.reach)} compareLabel={compare} />
                <StatCard
                  label="Obunachilar"
                  value={now.followers}
                  previous={p(prev.followers)}
                  compareLabel={compare}
                  hint={now.followers_growth !== null ? `${now.followers_growth >= 0 ? '+' : '−'}${formatNumber(Math.abs(now.followers_growth))} shu davrda` : undefined}
                />
                <StatCard
                  label="Obunachilar o‘sishi"
                  value={now.followers_growth}
                  previous={p(prev.followers_growth)}
                  compareLabel={compare}
                  hint="Oy boshi va oxiri kiritilgan oylar bo‘yicha"
                />
              </div>
            </div>

            <div>
              <SectionTitle>Faollik</SectionTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard label="Layklar" value={now.likes} previous={p(prev.likes)} compareLabel={compare} />
                <StatCard label="Izohlar" value={now.comments} previous={p(prev.comments)} compareLabel={compare} />
                <StatCard label="Ulashishlar" value={now.shares} previous={p(prev.shares)} compareLabel={compare} />
                <StatCard label="Saqlashlar" value={now.saves} previous={p(prev.saves)} compareLabel={compare} />
                <StatCard
                  className="max-lg:col-span-2"
                  label="Engagement"
                  value={now.engagement_rate}
                  suffix="%"
                  previous={p(prev.engagement_rate)}
                  compareLabel={compare}
                  hint="Faollik ÷ qamrov"
                />
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <SectionTitle>Kontent</SectionTitle>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Reels" value={now.reels} previous={p(prev.reels)} compareLabel={compare} />
                  <StatCard label="Postlar" value={now.posts} previous={p(prev.posts)} compareLabel={compare} />
                  <StatCard label="Stories" value={now.stories} previous={p(prev.stories)} compareLabel={compare} />
                </div>
              </div>
              <div>
                <SectionTitle>Reklama</SectionTitle>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MoneyCard className="max-sm:col-span-2" label="Xarajat" value={now.ad_spend} />
                  <StatCard label="Lidlar" value={now.leads} previous={p(prev.leads)} compareLabel={compare} />
                  <MoneyCard label="Lid narxi (CPL)" value={now.cpl} hint={now.cpl ? 'Xarajat ÷ lidlar' : undefined} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Ko‘rishlar va qamrov" note="oyma-oy">
                {pick('views').some((v) => v !== null) || pick('reach').some((v) => v !== null) ? (
                  <MonthlyBars
                    months={months}
                    series={[
                      { key: 'views', label: 'Ko‘rishlar', color: LIME, values: pick('views') },
                      { key: 'reach', label: 'Qamrov', color: SILVER, values: pick('reach') },
                    ]}
                  />
                ) : (
                  <p className="py-12 text-center text-[13.5px] text-[#6e6e76]">{EMPTY}</p>
                )}
              </Panel>
              <Panel title="Obunachilar" note="oy oxiridagi soni">
                {pick('followers').some((v) => v !== null) ? (
                  <MonthlyLine months={months} series={{ key: 'followers', label: 'Obunachilar', color: LIME, values: pick('followers') }} />
                ) : (
                  <p className="py-12 text-center text-[13.5px] text-[#6e6e76]">{EMPTY}</p>
                )}
              </Panel>
              <Panel title="Faollik" note="layk, izoh, ulashish, saqlash">
                {has(activitySeries) ? <MonthlyBars months={months} series={activitySeries} stacked /> : <p className="py-12 text-center text-[13.5px] text-[#6e6e76]">{EMPTY}</p>}
              </Panel>
              <Panel title="Reklama va lidlar" note={spendUnit ? 'xarajat va lidlar' : 'lidlar'}>
                {pick('leads').some((v) => v !== null) || (spendUnit && rows.some((r) => r.ad_spend !== null)) ? (
                  <div className="space-y-8">
                    {pick('leads').some((v) => v !== null) ? (
                      <MonthlyBars months={months} series={[{ key: 'leads', label: 'Lidlar', color: LIME, values: pick('leads') }]} />
                    ) : null}
                    {spendUnit ? (
                      <MonthlyBars
                        months={months}
                        unit={spendUnit}
                        series={[
                          {
                            key: 'spend',
                            label: 'Xarajat',
                            color: SILVER,
                            values: series.map((s) => (s.totals?.ad_spend ? (Object.values(s.totals.ad_spend)[0] ?? null) : null)),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p className="py-12 text-center text-[13.5px] text-[#6e6e76]">{EMPTY}</p>
                )}
              </Panel>
            </div>
          </>
        ) : null}

        {/* Work */}
        {!nothing ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Bajarilgan ishlar" note={doneReport ? `${monthName(doneReport.period_month)} hisobotidan` : undefined}>
              {doneReport ? (
                <div className="space-y-5">
                  <Lines text={doneReport.work_done} />
                  {doneReport.delivery.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {doneReport.delivery.map((d) => (
                        <div key={d.label} className="rounded-2xl bg-white/[0.04] px-3 py-2.5">
                          <p className="truncate text-[12px] text-[#8e8e96]" title={d.label}>
                            {d.label}
                          </p>
                          <p className="mt-0.5 text-[15px] font-semibold text-white tabular-nums">
                            {d.value === null ? '—' : formatNumber(d.value)}
                            {d.target !== null ? <span className="text-[#8e8e96]"> / {formatNumber(d.target)}</span> : null}
                            {d.unit ? <span className="ml-1 text-[12px] font-normal text-[#8e8e96]">{d.unit}</span> : null}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[14px] text-[#6e6e76]">{EMPTY}</p>
              )}
            </Panel>
            <Panel title="Rejadagi ishlar" note={planReport ? `${monthName(planReport.period_month)} hisobotidan` : undefined}>
              {planReport ? <Lines text={planReport.work_planned} /> : <p className="text-[14px] text-[#6e6e76]">{EMPTY}</p>}
            </Panel>
          </div>
        ) : null}

        {data.projects.length ? (
          <Panel title="Loyihalar jarayoni">
            <ul className="divide-y divide-white/[0.06]">
              {data.projects.map((project) => {
                const pct = project.tasks_total ? Math.round((project.tasks_done / project.tasks_total) * 100) : null;
                const status = lookup(PROJECT_STATUS, project.status as keyof typeof PROJECT_STATUS, { label: project.status, tone: 'neutral' as const });
                return (
                  <li key={project.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_240px] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold break-words text-white">{project.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-[#8e8e96]">
                        {status.label}
                        {project.starts_on ? ` · ${project.starts_on.split('-').reverse().join('.')}` : ''}
                        {project.ends_on ? ` – ${project.ends_on.split('-').reverse().join('.')}` : ''}
                      </p>
                    </div>
                    {pct !== null ? (
                      <div>
                        <div className="flex justify-between text-[12px] text-[#a8a8ac]">
                          <span>
                            {project.tasks_done} / {project.tasks_total} bosqich
                          </span>
                          <span className="font-semibold text-white">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-[#d4fc18]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-[#6e6e76]">Bosqichlar hali belgilanmagan</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

    </PartnerFrame>
  );
}
