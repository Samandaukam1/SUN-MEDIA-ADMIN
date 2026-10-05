import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { EngagementDailyCap, EngagementDefinitionBuilder, EngagementDefinitionEditor, EngagementRefresh } from '@/components/pro/GameEngagementAdmin';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { engagementAdminSchema, engagementMetricLabel, type EngagementDefinition } from '@/lib/schemas/game-engagement';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Challenge va yutuqlar · Game Center' };

const count = (value: number) => value.toLocaleString('en-US');

function definitionStatus(definition: EngagementDefinition): { label: string; tone: BadgeTone } {
  if (!definition.enabled) return { label: 'OFF', tone: 'neutral' };
  if (Date.parse(definition.startsAt) > Date.now()) return { label: 'Rejalashtirilgan', tone: 'info' };
  if (definition.endsAt && Date.parse(definition.endsAt) <= Date.now()) return { label: 'Muddati tugagan', tone: 'neutral' };
  return { label: 'ON', tone: 'success' };
}

function DefinitionTable({ definitions }: { definitions: EngagementDefinition[] }) {
  if (definitions.length === 0) return <EmptyRow>Hali topshiriq yo‘q. Yangi topshiriq yarating.</EmptyRow>;
  return <Table columns={['Topshiriq', 'Maqsad', 'Mavjud mukofot', 'Kunlik limit', 'Holat / muddat', '']}>
    {definitions.map((definition) => {
      const status = definitionStatus(definition);
      return <tr key={definition.id} className={rowClass}>
        <td className={cellClass}><p className="font-medium">{definition.title}</p>{definition.description ? <p className="mt-1 max-w-72 text-sm text-muted">{definition.description}</p> : null}<p className="mt-1 text-xs text-subtle">{definition.code}</p></td>
        <td className={cellClass}><p>{engagementMetricLabel(definition.metric)}</p><p className="mt-1 font-semibold tabular-nums">{count(definition.target)}</p></td>
        <td className={cellClass}>{definition.rewardCoins > 0 ? <><p className="font-semibold tabular-nums">{count(definition.rewardCoins)} SC</p><p className="text-xs text-muted">Reward Mode · limit bo‘lsa</p></> : <span className="text-muted">Progress / yutuq</span>}</td>
        <td className={`${cellClass} tabular-nums`}>{definition.rewardCoins > 0 ? `${count(definition.dailyRewardLimit)} ta` : '—'}</td>
        <td className={cellClass}><Badge dot tone={status.tone}>{status.label}</Badge><p className="mt-2 whitespace-nowrap text-xs text-muted">{formatShortDateTime(definition.startsAt)}</p><p className="whitespace-nowrap text-xs text-muted">{definition.endsAt ? `${formatShortDateTime(definition.endsAt)} gacha` : 'Muddatsiz'}</p></td>
        <td className={cellClass}><EngagementDefinitionEditor definition={definition} /></td>
      </tr>;
    })}
  </Table>;
}

export default async function GameEngagementPage() {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_game_engagement_admin', { p_game_key: 'safi-penalty' });
  if (error) throw error;
  const dashboard = engagementAdminSchema.parse(data);
  const { analytics } = dashboard;
  return <div className="space-y-8">
    <PageHeader title="Challenge va yutuqlar" description="SAFI Penalty faolligi, kundalik topshiriqlar, yutuqlar va SUN Coin limitlari." crumbs={[{ label: 'Game Center', href: '/clients/games' }, { label: 'Challenge va yutuqlar' }]} actions={<EngagementRefresh />} />
    <section aria-label="Game Center analitikasi">
      <SectionTitle>SAFI Penalty — o‘yin faolligi</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Games played" value={count(analytics.gamesPlayed)} detail="Tugatilgan, tasdiqlangan raundlar" />
        <Stat label="Bugungi faol o‘yinchilar" value={count(analytics.dailyActivePlayers)} detail="Server kuni bo‘yicha · Toshkent" />
        <Stat label="Practice rounds" value={count(analytics.practiceRounds)} detail="Bepul mashq raundlari" />
        <Stat label="Reward rounds" value={count(analytics.rewardRounds)} detail="Reward Mode raundlari" />
        <Stat label="O‘rtacha natija" value={analytics.averageScore == null ? '—' : `${analytics.averageScore.toFixed(1)} / 10`} />
        <Stat label="Faol seriyalar" value={count(analytics.activeStreaks)} />
        <Stat label="Eng uzun seriya" value={`${count(analytics.longestStreak)} kun`} />
        <Stat label="Challenge bajarildi" value={count(analytics.challengeCompletions)} />
        <Stat label="Yutuqlar ochildi" value={count(analytics.achievementUnlocks)} />
        <Stat label="Engagement SUN Coin" value={`${count(analytics.coinsAwarded)} SC`} detail="Challenge va yutuqlardan berilgan" />
        <Stat label="SUN Coin sarflandi" value={`${count(analytics.coinsSpent)} SC`} detail="SAFI o‘yinidagi sarflar" />
      </div>
      <p className="mt-3 text-sm text-muted">Raundlar, yutuqlar va SUN Coin — jami natijalar. Bugungi faollar va faol seriyalar — joriy holat. Shaxsiy ma’lumotlar bu hisobotda berilmaydi.</p>
    </section>

    <Card className="space-y-4">
      <SectionTitle action={<Badge tone={dashboard.dailyCoinCap > 0 ? 'success' : 'neutral'}>{dashboard.dailyCoinCap > 0 ? `${count(dashboard.dailyCoinCap)} SC / kun` : 'SUN Coin — OFF'}</Badge>}>Challenge va yutuqlar iqtisodiyoti</SectionTitle>
      <EngagementDailyCap current={dashboard.dailyCoinCap} />
    </Card>

    <section className="space-y-3" aria-label="Kundalik challengelar">
      <SectionTitle>Daily challenges</SectionTitle>
      <p className="text-sm text-muted">Progress har kuni serverning Toshkent sanasi bo‘yicha yangilanadi. Har bir topshiriq bir o‘yinchi uchun kuniga bir marta bajariladi.</p>
      <DefinitionTable definitions={dashboard.definitions.filter((definition) => definition.kind === 'challenge')} />
    </section>

    <section className="space-y-3" aria-label="Yutuqlar">
      <SectionTitle>Achievements — yutuqlar</SectionTitle>
      <p className="text-sm text-muted">Har bir yutuq o‘yinchi uchun bir marta ochiladi. OFF holati oldingi progress va mukofot tarixini saqlaydi.</p>
      <DefinitionTable definitions={dashboard.definitions.filter((definition) => definition.kind === 'achievement')} />
    </section>

    <Card>
      <details>
        <summary className="cursor-pointer text-base font-semibold">Yangi challenge yoki yutuq</summary>
        <div className="mt-5 max-w-3xl"><EngagementDefinitionBuilder /></div>
      </details>
    </Card>
    <div className="flex flex-wrap gap-3"><ButtonLink href="/clients/games/safi-penalty/rewards/rules">Reward Rules</ButtonLink><ButtonLink href="/clients/games/safi-penalty/rewards/sun-coin">SUN Coin wallet va Coin Shop</ButtonLink></div>
  </div>;
}
