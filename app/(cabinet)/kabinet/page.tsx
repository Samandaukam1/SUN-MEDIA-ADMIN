import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { MonthlyBars, MonthlyLine, type ChartSeries } from '@/components/cabinet/Charts';
import { Chip, EMPTY, fileSize, Lines, MoneyCard, Panel, SectionTitle, StatCard } from '@/components/cabinet/partner/parts';
import { PartnerLogoImage } from '@/components/site/PartnerLogoImage';
import { SiteIcon } from '@/components/site/SiteIcon';
import { getSessionContext } from '@/lib/auth';
import { homeFor, isPanelUser } from '@/lib/cabinet/routing';
import { loadPartnerCabinet } from '@/lib/cabinet/partner';
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

export const metadata: Metadata = { title: 'Hamkor kabineti' };

type Params = { oy?: string; dan?: string; gacha?: string; platforma?: string; brend?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function link(base: Params, change: Partial<Params>): string {
  const merged: Record<string, string | undefined> = { ...base, ...change };
  const q = new URLSearchParams();
  for (const key of ['brend', 'oy', 'dan', 'gacha', 'platforma']) if (merged[key]) q.set(key, merged[key]!);
  const s = q.toString();
  return s ? `/kabinet?${s}` : '/kabinet';
}

const LIME = '#d4fc18';
const SILVER = '#c9c9ce';

export default async function PartnerCabinetPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=hamkor');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.temporary_password) redirect('/parol');
  const params = await searchParams;

  // The brand comes from the person's own memberships; staff may only preview a brand from the panel.
  let clientId: string | null = null;
  const preview = context.kind === 'staff';
  if (context.kind === 'client') {
    clientId = context.clients.find((c) => c.id === params.brend)?.id ?? context.clients[0]?.id ?? null;
  } else if (isPanelUser(context) && typeof params.brend === 'string' && UUID.test(params.brend)) {
    clientId = params.brend;
  }
  if (!clientId) redirect(home);

  const current = `${agencyDateKey().slice(0, 7)}-01`;
  const period = resolvePeriod(params, current);
  const [data, before] = await Promise.all([
    loadPartnerCabinet(clientId, period.from, period.to),
    loadPartnerCabinet(clientId, period.previous.from, period.previous.to),
  ]);
  if (data === 'forbidden' || before === 'forbidden') redirect(home);

  const platform = data.accounts.some((a) => a.id === params.platforma) ? params.platforma! : null;
  const base: Params = { brend: context.kind === 'client' && context.clients.length < 2 ? undefined : clientId, platforma: platform ?? undefined };
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
  const membership = context.clients.find((c) => c.id === clientId);
  const role = preview ? `${context.roles.map((r) => r.name).join(', ')} · ko‘rish rejimi` : `${membership?.role_name ?? 'Hamkor'} · ${data.client.name}`;
  const logo = data.client.logo_dark_url ?? data.client.logo_url;

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
    <>
      <CabinetHeader name={context.profile?.full_name || context.profile?.email || ''} role={role} home={home} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-20 sm:px-8 sm:pt-12">
        {preview ? (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d4fc18]/25 bg-[#d4fc18]/[0.06] px-4 py-3 text-[13.5px] text-[#e4e4e7]">
            <SiteIcon name="eye" size={16} className="text-[#d4fc18]" />
            Hamkor kabinetini SUN MEDIA xodimi sifatida ko‘ryapsiz — hamkor aynan shu nashr qilingan ma’lumotlarni ko‘radi.
            <Link href={`/clients/${clientId}?tab=stats`} className="ml-auto font-semibold text-[#d4fc18] hover:underline">
              Panelga qaytish →
            </Link>
          </p>
        ) : null}

        {/* Brand */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="lg relative grid size-[72px] shrink-0 place-items-center rounded-[22px] sm:size-20">
              {logo ? (
                <span className="relative block size-12 sm:size-14">
                  <PartnerLogoImage src={logo} alt={data.client.name} sizes="56px" fallback={<span className="font-display text-[22px] text-white">{data.client.name.slice(0, 1)}</span>} />
                </span>
              ) : (
                <span className="font-display text-[26px] text-white">{data.client.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Hamkor kabineti</p>
              <h1 className="font-display mt-1.5 text-[28px] leading-tight font-medium tracking-[-0.03em] break-words text-white sm:text-[38px]">{data.client.name}</h1>
              <p className="mt-1.5 text-[13px] text-[#8e8e96]">
                {data.updated_at ? `Oxirgi yangilanish: ${formatShortDateTime(data.updated_at)}` : 'Hali nashr qilingan ma’lumot yo‘q'}
              </p>
            </div>
          </div>
          {context.kind === 'client' && context.clients.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {context.clients.map((c) => (
                <Chip key={c.id} href={link({ ...periodParams }, { brend: c.id })} active={c.id === clientId}>
                  {c.name}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

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
          <form method="get" action="/kabinet" className="flex flex-wrap items-end gap-3">
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

        {/* Reports */}
        <div>
          <SectionTitle hint="Faqat nashr qilingan hisobotlar">Hisobotlar</SectionTitle>
          {data.reports.length ? (
            <div className="space-y-4">
              {data.reports.map((report) => (
                <Panel key={report.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[19px] font-medium text-white">{monthName(report.period_month)}</p>
                      <p className="mt-1 text-[13px] break-words text-[#8e8e96]">
                        {report.title}
                        {report.published_at ? ` · nashr: ${formatShortDateTime(report.published_at)}` : ''}
                      </p>
                    </div>
                    {report.has_pdf ? (
                      <a href={`/kabinet/hisobot/${report.id}/pdf`} className="lg inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
                        <SiteIcon name="download" size={16} /> PDF
                      </a>
                    ) : null}
                  </div>
                  {report.highlights ? <p className="mt-4 text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#d9d9de]">{report.highlights}</p> : null}
                  {report.work_done || report.work_planned ? (
                    <div className="mt-5 grid gap-5 border-t border-white/[0.06] pt-5 md:grid-cols-2">
                      <div>
                        <p className="mb-3 text-[12px] font-semibold tracking-[0.12em] text-[#8e8e96] uppercase">Bajarildi</p>
                        {report.work_done ? <Lines text={report.work_done} /> : <p className="text-[13.5px] text-[#6e6e76]">{EMPTY}</p>}
                      </div>
                      <div>
                        <p className="mb-3 text-[12px] font-semibold tracking-[0.12em] text-[#8e8e96] uppercase">Rejada</p>
                        {report.work_planned ? <Lines text={report.work_planned} /> : <p className="text-[13.5px] text-[#6e6e76]">{EMPTY}</p>}
                      </div>
                    </div>
                  ) : null}
                  {report.files.length ? (
                    <ul className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
                      {report.files.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/kabinet/fayl/${file.id}`}
                            className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-[#e4e4e7] transition-colors hover:bg-white/[0.09] hover:text-white"
                          >
                            <SiteIcon name="file" size={15} className="shrink-0 text-[#d4fc18]" />
                            <span className="truncate">{file.name}</span>
                            {file.size_bytes ? <span className="shrink-0 text-[#6e6e76]">{fileSize(file.size_bytes)}</span> : null}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel>
              <p className="text-[14px] text-[#6e6e76]">Bu davr uchun nashr qilingan hisobot yo‘q.</p>
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
