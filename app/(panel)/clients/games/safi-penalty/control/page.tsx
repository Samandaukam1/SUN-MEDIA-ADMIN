import { PageHeader } from '@/components/panel/PageHeader';
import { Stat } from '@/components/panel/Stat';
import { Card, SectionTitle } from '@/components/ui/Card';
import { SafiProductionAdmin } from '@/components/pro/SafiProductionAdmin';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safiAdmin } from '@/lib/schemas/safi-production';
export default async function SafiControlPage() {
  await requirePermission('promo.manage');
  const client = await createClient();
  const { data, error } = await client.rpc('get_safi_admin' as never);
  if (error) throw error;
  const dashboard = safiAdmin.parse(data);
  const a = dashboard.analytics;
  return <div className="space-y-8">
    <PageHeader title="SAFI o‘yin boshqaruvi" description="Rejimlar, mavsumlar, Boss tadbirlari, kosmetika va tasdiqlangan natijalar." crumbs={[{ label: 'Game Center', href: '/clients/games' }, { label: 'SAFI boshqaruv' }]} />
    <div className="grid gap-4 md:grid-cols-4"><Stat label="Berilgan kampaniya sovg‘alari" value={String(a.campaignDistributed)} /><Stat label="Qaytgan o‘yinchilar" value={String(a.returningPlayers)} /><Stat label="1-kun retention" value={a.retentionDay1 == null ? '—' : `${a.retentionDay1}%`} /><Stat label="Eng mashhur buyum" value={a.mostPopularCosmetic?.title ?? '—'} detail={a.mostPopularCosmetic ? `${a.mostPopularCosmetic.purchases} xarid` : 'Xarid ma’lumoti mavjud emas'} /></div>
    <Card className="space-y-4"><SectionTitle>Natijalar taqsimoti</SectionTitle><div className="flex h-40 items-end gap-2">{a.scoreDistribution.map((x) => <div key={x.score} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="text-xs text-muted">{x.rounds}</span><div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(2,x.rounds/Math.max(1,...a.scoreDistribution.map((p) => p.rounds))*100)}px` }} /><span className="text-xs">{x.score}</span></div>)}</div></Card>
    <Card className="space-y-4"><SectionTitle>Jami zarba xaritasi</SectionTitle><div className="grid grid-cols-5 gap-2">{a.zoneHeatmap.map((z) => <div key={z.zone} className="rounded-xl bg-surface-2 p-3 text-center"><p className="font-semibold">{z.goals}/{z.shots}</p><p className="text-xs text-muted">{z.shots ? `${Math.round(z.goals/z.shots*100)}% gol` : '—'}</p></div>)}</div></Card>
    <Card className="space-y-4"><SectionTitle>Mukofot zaxirasi</SectionTitle>{a.remainingRewardPool.length ? a.remainingRewardPool.map((c) => <div key={c.campaignId}><p className="font-semibold">{c.title}</p>{c.rules?.map((r,i) => <p key={i} className="text-sm text-muted">{r.amount} {r.type === 'SUN_COIN' ? 'SC' : 'kun Pro'} · {r.remaining == null ? 'Miqdor cheklanmagan' : `${r.remaining} ta qolgan`}</p>)}</div>) : <p className="text-muted">Faol mukofot kampaniyasi yo‘q.</p>}</Card>
    <SafiProductionAdmin data={dashboard} />
  </div>;
}
