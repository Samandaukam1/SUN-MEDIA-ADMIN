import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { CampaignActions, GameCampaignForm } from '@/components/pro/GameCampaignForm';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Game Center' };

const MODE: Record<string, string> = { skill: 'Mahorat', probability: 'Ehtimol', first_play_guaranteed: '1-o‘yin kafolat', next_player_guaranteed: 'Keyingi o‘yinchi' };

/** Mijozlar → O‘yinlar: branded client games (clients only), rewards in SUN MEDIA Pro days. */
export default async function GamesPage() {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const [campaignsRes, clientsRes, sessionsRes] = await Promise.all([
    supabase
      .from('game_campaigns')
      .select('id, title, template, difficulty, reward_days, win_mode, win_probability, guarantee_next, rewards_given, max_rewards_total, is_active, ends_at, client:clients(name)')
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').is('deleted_at', null).eq('status', 'active').order('name'),
    supabase.from('game_sessions').select('campaign_id, status, won'),
  ]);
  if (campaignsRes.error) throw campaignsRes.error;
  const stats = (id: string) => {
    const s = (sessionsRes.data ?? []).filter((x) => x.campaign_id === id);
    return { played: s.length, won: s.filter((x) => x.won).length, flagged: s.filter((x) => x.status === 'flagged').length };
  };

  return (
    <div>
      <PageHeader title="Game Center" description="Mijoz ilovasidagi brendli mini-o‘yinlar va mukofot kampaniyalari." />
      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><SectionTitle>SAFI Penalty</SectionTitle><p className="text-muted">Rewards · SUN Coin Campaign — pool, score shartlari va analitika.</p></div>
        <ButtonLink href="/clients/games/safi-penalty" variant="primary">Mukofotlarni boshqarish</ButtonLink>
      </Card>
      <Card className="mb-8">
        <SectionTitle>Yangi kampaniya</SectionTitle>
        <GameCampaignForm clients={clientsRes.data ?? []} />
      </Card>
      {campaignsRes.data.length === 0 ? (
        <EmptyRow>Hali kampaniya yo‘q.</EmptyRow>
      ) : (
        <Table columns={['Kampaniya', 'Qoida', 'O‘ynaldi', 'Yutdi', 'Shubhali', 'Holat', '']}>
          {campaignsRes.data.map((g) => {
            const s = stats(g.id);
            return (
              <tr key={g.id} className={rowClass}>
                <td className={cellClass}>
                  <span className="font-medium">{g.title}</span>
                  <span className="block text-[13px] text-muted">{`${g.client?.name ?? '—'} · ${g.template === 'penalty' ? 'Penalti' : g.template === 'catch' ? 'Tutish' : 'Quyish'} · ${g.reward_days} kun Pro`}</span>
                </td>
                <td className={`${cellClass} text-muted`}>
                  {`${MODE[g.win_mode] ?? g.win_mode}${g.win_mode === 'skill' ? '' : ` · ${Math.round(Number(g.win_probability) * 1000) / 10}%`}${g.guarantee_next ? ' · navbatdagi kafolatli' : ''}`}
                </td>
                <td className={`${cellClass} tabular`}>{s.played}</td>
                <td className={`${cellClass} tabular`}>{`${g.rewards_given}${g.max_rewards_total ? ` / ${g.max_rewards_total}` : ''}`}</td>
                <td className={`${cellClass} tabular`}>{s.flagged || '—'}</td>
                <td className={cellClass}>
                  <Badge tone={g.is_active ? 'success' : 'neutral'} dot>
                    {g.is_active ? (g.ends_at ? `${formatShortDateTime(g.ends_at)} gacha` : 'Faol') : 'To‘xtatilgan'}
                  </Badge>
                </td>
                <td className={cellClass}>
                  <CampaignActions id={g.id} active={g.is_active} nextMode={g.win_mode === 'next_player_guaranteed'} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
