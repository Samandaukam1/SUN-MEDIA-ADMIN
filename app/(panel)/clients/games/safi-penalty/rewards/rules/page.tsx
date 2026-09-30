import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { RewardCampaignBuilder, RewardCampaignEditor, RewardCampaignStatusActions, SafiLevelPicker } from '@/components/pro/RewardRulesAdmin';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { levelLabel, percent, rewardAdminSchema, rewardLabel, ruleOdds, type RewardCampaignRow } from '@/lib/schemas/game-rewards';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Reward Rules · SAFI Penalty' };

const statusLabels: Record<RewardCampaignRow['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'OFF · Qoralama', tone: 'neutral' }, active: { label: 'ON · Faol', tone: 'success' },
  paused: { label: 'OFF · Pauzada', tone: 'warning' }, ended: { label: 'Tugatilgan', tone: 'neutral' },
};

function availability(c: RewardCampaignRow): string | null {
  if (c.status !== 'active') return null;
  if (Date.parse(c.startsAt) > Date.now()) return 'Rejalashtirilgan — boshlanish vaqti kutilmoqda.';
  if (c.endsAt && Date.parse(c.endsAt) <= Date.now()) return 'Muddati tugagan — Reward Mode yopiq. Kampaniyani tugating yoki sanani uzaytiring.';
  if (!c.rules.some((r) => r.enabled && (r.remaining === null || r.remaining > 0))) return 'Yoqilgan va zaxirasi bor qoida qolmagan — Reward Mode yopiq.';
  return 'Reward Mode ochiq: raund tugashi bilan server mos mukofotni beradi.';
}

export default async function SafiRewardRulesPage() {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_sun_coin_admin_dashboard');
  if (error) throw error;
  const dashboard = rewardAdminSchema.parse(data);
  const level = dashboard.settings.find((s) => s.gameId === 'safi-penalty')?.difficulty ?? 'easy';
  const profile = dashboard.levels.find((l) => l.key === level);
  const campaigns = dashboard.rewardCampaigns.filter((c) => c.gameId === 'safi-penalty');
  const open = campaigns.filter((c) => c.status !== 'ended');
  const history = campaigns.filter((c) => c.status === 'ended');
  const { rewardSummary: summary } = dashboard;

  return <div className="space-y-8">
    <PageHeader title="Reward Rules" description="Qiyinlik, balans va gol soni bo‘yicha mukofotlar. Hammasi ichki: o‘yinchi faqat o‘yinni va yutganini ko‘radi."
      crumbs={[{ label: 'Game Center', href: '/clients/games' }, { label: 'SAFI Penalty', href: '/clients/games/safi-penalty' }, { label: 'Reward Rules' }]} />

    <section aria-label="Qiyinlik">
      <SectionTitle>Qiyinlik va maqsadli balans · hozir: {levelLabel(level)}</SectionTitle>
      <Card><SafiLevelPicker current={level} levels={dashboard.levels} /></Card>
    </section>

    <section aria-label="Berilgan mukofotlar">
      <SectionTitle>Berilgan mukofotlar</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Mukofotli raundlar" value={summary.rounds.toLocaleString('en-US')} detail="Reward Mode, server bergan" />
        <Stat label="SUN Coin" value={`${summary.coins.toLocaleString('en-US')} SC`} detail="Qoidalar bo‘yicha berilgan" />
        <Stat label="Pro" value={`${summary.proDays.toLocaleString('en-US')} kun`} detail="Mijoz workspace’lariga qo‘shilgan" />
        <Stat label="G‘oliblar" value={summary.winners.toLocaleString('en-US')} detail="Kamida bitta mukofot olganlar" />
      </div>
    </section>

    <section aria-label="Kampaniyalar" className="space-y-5">
      <SectionTitle>Kampaniyalar va qoidalar</SectionTitle>
      {open.length === 0 ? <EmptyRow>Faol yoki qoralama kampaniya yo‘q. Quyida yarating.</EmptyRow> : null}
      {open.map((c) => {
        const note = availability(c);
        const odds = profile ? ruleOdds(profile.distribution, c.rules) : null;
        return <Card key={c.id} className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-muted">{formatShortDateTime(c.startsAt)} → {c.endsAt ? formatShortDateTime(c.endsAt) : 'Muddatsiz'} · Toshkent</p>
            </div>
            <Badge dot tone={statusLabels[c.status].tone}>{statusLabels[c.status].label}</Badge>
          </div>
          {note ? <p className="text-sm text-muted">{note}</p> : null}
          <Table columns={['Gol', 'Mukofot', 'Holat', 'Berilgan / soni', `≈ raundlar (${levelLabel(level)})`]}>
            {c.rules.map((r) => <tr key={r.id} className={rowClass}>
              <td className={`${cellClass} font-semibold tabular-nums`}>{r.score}/10</td>
              <td className={cellClass}>{rewardLabel(r)}</td>
              <td className={cellClass}><Badge dot tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'ON' : 'OFF'}</Badge></td>
              <td className={`${cellClass} tabular-nums`}>{r.awarded}{r.quantity === null ? ' / cheklanmagan' : ` / ${r.quantity}`}{r.remaining === 0 ? ' · tugagan' : ''}</td>
              <td className={`${cellClass} tabular-nums text-muted`}>{!r.enabled ? '—' : profile && r.score > profile.top ? 'bu darajada yetib bo‘lmaydi' : odds?.has(r.score) ? percent(odds.get(r.score) ?? 0) : '—'}</td>
            </tr>)}
          </Table>
          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer font-semibold">Qoidalarni tahrirlash</summary>
            <div className="mt-4"><RewardCampaignEditor campaign={c} profile={profile} /></div>
          </details>
          <RewardCampaignStatusActions id={c.id} status={c.status} title={c.title} />
          <p className="text-xs text-subtle">G‘oliblar: {c.winners} · {c.coinsGiven.toLocaleString('en-US')} SC · {c.proDaysGiven} kun Pro · Yangilangan: {formatShortDateTime(c.updatedAt)}</p>
        </Card>;
      })}
    </section>

    <section id="new-campaign" className="scroll-mt-8">
      <Card className="space-y-4"><SectionTitle>Yangi mukofot kampaniyasi</SectionTitle><RewardCampaignBuilder profile={profile} /></Card>
    </section>

    <section aria-label="Tarix">
      <SectionTitle>Tugatilgan kampaniyalar</SectionTitle>
      {history.length === 0 ? <EmptyRow>Hali tugatilgan kampaniya yo‘q.</EmptyRow> : (
        <Table columns={['Kampaniya', 'Muddat', 'Qoidalar', 'G‘oliblar', 'Berilgan']}>
          {history.map((c) => <tr key={c.id} className={rowClass}>
            <td className={`${cellClass} font-medium`}>{c.title}</td>
            <td className={`${cellClass} text-sm text-muted`}>{formatShortDateTime(c.startsAt)} → {c.endsAt ? formatShortDateTime(c.endsAt) : '—'}</td>
            <td className={`${cellClass} text-sm`}>{c.rules.map((r) => `${r.score}→${rewardLabel(r)}${r.enabled ? '' : ' (OFF)'}`).join(' · ')}</td>
            <td className={`${cellClass} tabular-nums`}>{c.winners}</td>
            <td className={`${cellClass} text-sm tabular-nums`}>{c.coinsGiven.toLocaleString('en-US')} SC · {c.proDaysGiven} kun Pro</td>
          </tr>)}
        </Table>
      )}
    </section>
  </div>;
}
