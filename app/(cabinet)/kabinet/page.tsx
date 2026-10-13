import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { MonthlyBars } from '@/components/cabinet/Charts';
import { PostRow, VisitCard } from '@/components/cabinet/partner/EventCards';
import { Lines, Panel } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { UsageBar } from '@/components/cabinet/partner/UsageBar';
import { SiteIcon } from '@/components/site/SiteIcon';
import { loadPartnerCabinet } from '@/lib/cabinet/partner';
import { partnerHref, resolvePartner, type PartnerScope } from '@/lib/cabinet/partner-context';
import { loadChatRoom, loadHome, loadLeads, loadMessages } from '@/lib/cabinet/partner-data';
import { change, formatNumber, monthlySeries, monthName, monthsBetween, shiftMonth } from '@/lib/cabinet/stats';
import { CONTENT_TYPE, TEAM_ROLE_LABEL, lookup } from '@/lib/labels';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Hamkor kabineti' };

function More({ scope, path, children }: { scope: PartnerScope; path: string; children: ReactNode }) {
  return (
    <Link href={partnerHref(scope, path)} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#d4fc18] hover:underline">
      {children} <SiteIcon name="arrowRight" size={14} />
    </Link>
  );
}

function Kpi({ label, value, hint, href }: { label: string; value: string; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[12.5px] font-medium text-[#a8a8ac]">{label}</p>
      <p className="font-display mt-2 text-[26px] leading-none font-medium text-white tabular-nums sm:text-[28px]">{value}</p>
      {hint ? <p className="mt-auto pt-3 text-[12px] leading-snug text-[#8e8e96]">{hint}</p> : null}
    </>
  );
  const cls = 'lg flex min-h-[124px] flex-col rounded-[22px] p-4 sm:p-5';
  return href ? (
    <Link href={href} className={`${cls} transition-transform hover:-translate-y-0.5`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** "Umumiy": the partner's whole picture on one page — tariff, this month, growth, our next visits, leads, chat, team. */
export default async function PartnerHomePage({ searchParams }: { searchParams: Promise<{ brend?: string }> }) {
  const scope = await resolvePartner((await searchParams).brend);
  const current = `${agencyDateKey().slice(0, 7)}-01`;
  const from = shiftMonth(current, -5);
  const [home, cabinet, leads, room] = await Promise.all([
    loadHome(scope.clientId),
    loadPartnerCabinet(scope.clientId, from, current),
    loadLeads(scope.clientId, '30d', null, 4).catch(() => null),
    loadChatRoom(scope.clientId).catch(() => null),
  ]);
  if (cabinet === 'forbidden') redirect(scope.home);
  const messages = room ? (await loadMessages(room.id, null).catch(() => [])).filter((m) => !m.is_system && !m.deleted_at).slice(-3) : [];

  const months = monthsBetween(from, current);
  const series = monthlySeries(cabinet.metrics, months);
  const withData = series.filter((s) => s.totals);
  const last = withData.at(-1) ?? null;
  const prev = withData.at(-2) ?? null;
  const followers = last?.totals?.followers ?? null;
  const followersGrowth = last?.totals?.followers_growth ?? null;
  const viewsChange = last && prev ? change(last.totals!.views, prev.totals!.views) : null;

  const sub = home?.subscription ?? null;
  const daysLeft = sub ? Math.max(0, Math.round((Date.parse(`${sub.ends_on}T23:59:59+05:00`) - Date.now()) / 86_400_000)) : null;
  const delivered = Object.entries(home?.month_delivered ?? {})
    .filter(([, n]) => n > 0)
    .map(([type, n]) => `${lookup(CONTENT_TYPE, type, type)} ${n}`)
    .join(' · ');
  const visits = (home?.upcoming ?? []).filter((e) => e.event_type === 'shooting').slice(0, 3);
  const posts = (home?.upcoming ?? []).filter((e) => e.event_type === 'publication').slice(0, 4);
  const report = cabinet.reports[0] ?? null;
  const firstName = (scope.context.profile?.full_name ?? '').split(' ')[0];

  return (
    <PartnerFrame
      scope={scope}
      title={scope.preview ? 'Umumiy ko‘rinish' : `Salom${firstName ? `, ${firstName}` : ''}`}
      subtitle={
        sub ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#d4fc18]/12 px-2.5 py-0.5 text-[12.5px] font-semibold text-[#d4fc18]">Tarif: {sub.plan_name}</span>
            {daysLeft !== null ? <span>{daysLeft} kun qoldi</span> : null}
          </span>
        ) : (
          'SUN MEDIA bilan ishingiz bir joyda.'
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Bu oy chiqarildi" value={formatNumber(home?.stats.published_month ?? 0)} hint={delivered || 'kontent'} href={partnerHref(scope, '/kabinet/reja')} />
        <Kpi label="Bu oy syomkalar" value={formatNumber(home?.stats.shootings_month ?? 0)} hint={visits[0] ? `Keyingisi: ${formatShortDateTime(visits[0].starts_at)}` : 'tashriflar'} href={partnerHref(scope, '/kabinet/reja')} />
        {leads ? (
          <Kpi label="Lidlar · 30 kun" value={formatNumber(leads.counts['30d'])} hint={`Bugun: ${leads.counts.today}`} href={partnerHref(scope, '/kabinet/lidlar')} />
        ) : (
          <Kpi label="Ishlab chiqarishda" value={formatNumber(home?.stats.in_production ?? 0)} hint="kontent tayyorlanmoqda" />
        )}
        <Kpi
          label="Obunachilar"
          value={followers !== null ? formatNumber(followers, true) : '—'}
          hint={
            followers === null
              ? 'Ma’lumot kiritilmagan'
              : followersGrowth !== null
                ? `${followersGrowth >= 0 ? '+' : '−'}${formatNumber(Math.abs(followersGrowth))} · ${monthName(last!.month)}`
                : monthName(last!.month)
          }
          href={partnerHref(scope, '/kabinet/natijalar')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Panel
            title="O‘sish"
            note={
              viewsChange !== null && last && prev
                ? `Ko‘rishlar ${viewsChange >= 0 ? '↑' : '↓'} ${formatNumber(Math.abs(viewsChange))}% · ${monthName(prev.month)}ga nisbatan`
                : 'oxirgi 6 oy'
            }
          >
            {withData.length ? (
              <MonthlyBars
                months={months}
                series={[
                  { key: 'views', label: 'Ko‘rishlar', color: '#d4fc18', values: series.map((s) => s.totals?.views ?? null) },
                  { key: 'reach', label: 'Qamrov', color: '#c9c9ce', values: series.map((s) => s.totals?.reach ?? null) },
                ]}
              />
            ) : (
              <p className="py-10 text-center text-[13.5px] text-[#6e6e76]">Statistika hali nashr qilinmagan.</p>
            )}
            <div className="mt-4 flex justify-end">
              <More scope={scope} path="/kabinet/natijalar">
                Barcha natijalar
              </More>
            </div>
          </Panel>

          <Panel title="Keyingi tashriflar va postlar" note="14 kun">
            {visits.length || posts.length ? (
              <div className="space-y-4">
                {visits.length ? (
                  <div className="space-y-3">
                    {visits.map((e) => (
                      <VisitCard key={e.entity_id} event={e} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[13.5px] text-[#8e8e96]">Yaqin 14 kunda syomka rejalashtirilmagan.</p>
                )}
                {posts.length ? (
                  <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06] pt-3">
                    {posts.map((e) => (
                      <PostRow key={e.entity_id} event={e} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-[14px] text-[#8e8e96]">Yaqin 14 kunga syomka yoki post rejalashtirilmagan.</p>
            )}
            <div className="mt-4 flex justify-end">
              <More scope={scope} path="/kabinet/reja">
                To‘liq reja
              </More>
            </div>
          </Panel>

          {report ? (
            <Panel title="Oxirgi hisobot" note={monthName(report.period_month)}>
              {report.highlights ? <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#d9d9de]">{report.highlights}</p> : null}
              {report.work_done ? (
                <div className={report.highlights ? 'mt-4' : ''}>
                  <Lines text={report.work_done} />
                </div>
              ) : null}
              <div className="mt-4 flex justify-end">
                <More scope={scope} path="/kabinet/hisobotlar">
                  Hisobotlar
                </More>
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          {home?.usage.length ? (
            <Panel title="Tarif bajarilishi" note="shu oy">
              <ul className="divide-y divide-white/[0.06]">
                {home.usage.slice(0, 6).map((u) => (
                  <UsageBar key={u.service_key} item={u} />
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <More scope={scope} path="/kabinet/tarif">
                  Tarif
                </More>
              </div>
            </Panel>
          ) : null}

          {leads ? (
            <Panel title="So‘nggi lidlar" note={`30 kunda ${leads.counts['30d']} ta`}>
              {leads.leads.length ? (
                <ul className="divide-y divide-white/[0.06]">
                  {leads.leads.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] text-white">{l.full_name || 'Ism ko‘rsatilmagan'}</p>
                        <p className="truncate text-[12px] text-[#8e8e96]">{l.campaign_name || l.form_name || 'Reklama so‘rovi'}</p>
                      </div>
                      {l.phone ? (
                        <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c]" aria-label={`${l.full_name ?? ''} — qo‘ng‘iroq`}>
                          <SiteIcon name="phone" size={15} />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-[#8e8e96]">Oxirgi 30 kunda lid kelmagan.</p>
              )}
              <div className="mt-3 flex justify-end">
                <More scope={scope} path="/kabinet/lidlar">
                  Barcha lidlar
                </More>
              </div>
            </Panel>
          ) : null}

          {room ? (
            <Panel title="Chat" note="SUN MEDIA jamoasi">
              {messages.length ? (
                <ul className="space-y-2">
                  {messages.map((m) => (
                    <li key={m.id} className="rounded-2xl bg-white/[0.04] px-3.5 py-2.5">
                      <p className="text-[12px] text-[#8e8e96]">
                        <span className="font-semibold text-[#d9d9de]">{m.sender_id === scope.context.userId ? 'Siz' : m.sender_label || m.sender?.full_name || 'SUN MEDIA'}</span> ·{' '}
                        {formatShortDateTime(m.created_at)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13.5px] break-words text-[#e4e4e7]">{m.body || (m.attachments.length ? 'Fayl' : '')}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-[#8e8e96]">Savolingiz bormi? Jamoangizga shu yerdan yozing.</p>
              )}
              <Link href={partnerHref(scope, '/kabinet/chat')} className="s-btn s-btn-lime mt-4 h-11 w-full text-[14px]">
                <SiteIcon name="message" size={17} /> {scope.preview ? 'Chatni ko‘rish' : 'Yozish'}
              </Link>
            </Panel>
          ) : null}

          {home?.team.length ? (
            <Panel title="Sizning jamoangiz">
              <ul className="space-y-2.5">
                {home.team.map((t) => (
                  <li key={`${t.user_id}-${t.team_role}`} className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[13px] font-semibold text-white">
                      {t.full_name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-white">{t.full_name}</p>
                      <p className="text-[12px] text-[#8e8e96]">{t.team_role ? lookup(TEAM_ROLE_LABEL, t.team_role, t.team_role) : 'SUN MEDIA'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </PartnerFrame>
  );
}
