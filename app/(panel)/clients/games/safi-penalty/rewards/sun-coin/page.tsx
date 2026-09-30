import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { SunCoinCampaignActions, SunCoinRefresh } from '@/components/pro/SunCoinCampaignForm';
import { SunCoinGiftForm, SunCoinPackForm, SunCoinPackToggle, SunCoinPurchaseActions } from '@/components/pro/SunCoinShopAdmin';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { coinAdminDashboardSchema, type CoinCampaign } from '@/lib/schemas/sun-coin';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'SUN Coin · SAFI Penalty' };

const coins = (amount: number) => `${amount.toLocaleString('en-US')} SC`;
const price = (cents: number, currency: string) => (currency === 'USD' ? `$${(cents / 100).toFixed(2)}` : `${(cents / 100).toFixed(2)} ${currency}`);
/** Price of one SC with enough digits to compare packs honestly ($0.0480 vs $0.0499). */
const perCoin = (cents: number, count: number, currency: string) => {
  const value = (cents / count / 100).toFixed(4);
  return currency === 'USD' ? `$${value}` : `${value} ${currency}`;
};
const requestLabels = { pending: { label: 'Kutilmoqda', tone: 'warning' }, fulfilled: { label: 'To‘langan', tone: 'success' }, rejected: { label: 'Rad etilgan', tone: 'danger' }, cancelled: { label: 'Bekor qilingan', tone: 'neutral' } } as const;
const campaignLabels: Record<CoinCampaign['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Qoralama', tone: 'neutral' }, active: { label: 'Eski tizim · ishlatilmaydi', tone: 'neutral' },
  paused: { label: 'Pauzada', tone: 'neutral' }, ended: { label: 'Tugatilgan', tone: 'neutral' },
};

export default async function SunCoinCampaignPage() {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_sun_coin_admin_dashboard');
  if (error) throw error;
  const dashboard = coinAdminDashboardSchema.parse(data);
  const campaigns = dashboard.campaigns.filter((campaign) => campaign.gameId === 'safi-penalty');
  const { analytics, packs, purchaseRequests } = dashboard;
  const pendingCount = purchaseRequests.filter((r) => r.status === 'pending').length;

  return <div className="space-y-8">
    <PageHeader title="SUN Coin" description="Wallet analitikasi, sovg‘alar va Coin Shop. O‘yin mukofotlari Reward Rules’da." crumbs={[
      { label: 'Game Center', href: '/clients/games' }, { label: 'SAFI Penalty', href: '/clients/games/safi-penalty' }, { label: 'SUN Coin' },
    ]} actions={<><SunCoinRefresh /><ButtonLink href="/clients/games/safi-penalty/rewards/rules" variant="primary">Reward Rules</ButtonLink></>} />

    <section aria-label="SUN Coin umumiy analitikasi">
      <SectionTitle>SUN Coin — umumiy wallet analitikasi</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Gifted" value={coins(analytics.gifted)} detail="SUN MEDIA sovg‘alari" />
        <Stat label="Purchased" value={coins(analytics.purchased)} detail="Xarid qilingan SUN Coin" />
        <Stat label="Spent" value={coins(analytics.spent)} detail="O‘yinlarda sarflangan" />
        <Stat label="Rewarded" value={coins(analytics.rewarded)} detail="O‘yin mukofotlari" />
        <Stat label="Currently circulating" value={coins(analytics.circulating)} detail="Walletlardagi jami mavjud SUN Coin" />
      </div>
      <p className="mt-3 text-sm text-muted">Barcha o‘yinlar bo‘yicha yagona SUN Coin wallet. Jami mukofot olgan foydalanuvchilar: {analytics.totalWinners.toLocaleString('en-US')}.</p>
    </section>

    <section aria-label="Sovg‘a">
      <Card className="max-w-2xl space-y-4"><SectionTitle>SUN Coin sovg‘a qilish</SectionTitle><SunCoinGiftForm /></Card>
    </section>

    <section aria-label="Coin Shop" className="space-y-4">
      <SectionTitle>Coin Shop — xarid so‘rovlari{pendingCount ? ` · ${pendingCount} ta kutilmoqda` : ''}</SectionTitle>
      <p className="text-sm text-muted">Mijoz ilovada paketni tanlaydi. To‘lov SUN MEDIA bilan shartnoma bo‘yicha qabul qilinadi; “To‘lov qabul qilindi” bosilganda server SUN Coinni bir marta hisobga yozadi (PURCHASE). SUN Coin pulga qaytarilmaydi.</p>
      {purchaseRequests.length === 0 ? <EmptyRow>Hali xarid so‘rovi yo‘q.</EmptyRow> : (
        <Table columns={['Mijoz', 'Paket', 'Narx', 'Holat', 'Sana', '']}>
          {purchaseRequests.map((r) => <tr key={r.id} className={rowClass}>
            <td className={cellClass}><div className="font-medium">{r.userName ?? '—'}</div><div className="text-sm text-muted">{r.clientName ?? ''}</div></td>
            <td className={`${cellClass} font-semibold tabular-nums`}>{coins(r.coins)}</td>
            <td className={`${cellClass} tabular-nums`}>{price(r.priceCents, r.currency)}</td>
            <td className={cellClass}><Badge dot tone={requestLabels[r.status].tone}>{requestLabels[r.status].label}</Badge>{r.note ? <div className="mt-1 text-xs text-muted">{r.note}</div> : null}</td>
            <td className={`${cellClass} text-sm text-muted`}>{formatShortDateTime(r.createdAt)}</td>
            <td className={cellClass}>{r.status === 'pending' ? <SunCoinPurchaseActions id={r.id} label={`${r.userName ?? 'Mijoz'}: ${coins(r.coins)} · ${price(r.priceCents, r.currency)}`} /> : null}</td>
          </tr>)}
        </Table>
      )}
      <Card className="space-y-5">
        <SectionTitle>Coin Shop paketlari</SectionTitle>
        {packs.length === 0 ? <EmptyRow>Paketlar yo‘q — mijozlar Coin Shop’da “Paketlar hali sozlanmagan” ko‘radi.</EmptyRow> : (
          <Table columns={['Paket', 'Narx', 'Narx / SC', 'Holat', '']}>
            {packs.map((p) => <tr key={p.id} className={rowClass}>
              <td className={`${cellClass} font-semibold tabular-nums`}>{coins(p.coins)}</td>
              <td className={`${cellClass} tabular-nums`}>{price(p.priceCents, p.currency)}</td>
              <td className={`${cellClass} tabular-nums text-muted`}>{perCoin(p.priceCents, p.coins, p.currency)}</td>
              <td className={cellClass}><Badge dot tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Ko‘rinadi' : 'Yashirin'}</Badge></td>
              <td className={cellClass}><SunCoinPackToggle id={p.id} isActive={p.isActive} /></td>
            </tr>)}
          </Table>
        )}
        <SunCoinPackForm />
      </Card>
    </section>

    <section aria-label="Eski SUN Coin kampaniyalari">
      <SectionTitle>Eski SUN Coin kampaniyalari — arxiv</SectionTitle>
      <p className="mb-4 text-sm text-muted">SAFI mukofotlari endi Reward Rules orqali beriladi; bu kampaniyalar raundlarga ta’sir qilmaydi va tarix uchun saqlanadi.</p>
      {campaigns.length === 0 ? <EmptyRow>Eski kampaniyalar yo‘q.</EmptyRow> : <div className="space-y-5">
        {campaigns.map((campaign) => {
          const state = campaignLabels[campaign.status];
          return <Card key={campaign.id} className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold">{campaign.title}</h3><p className="mt-1 text-sm text-muted">{formatShortDateTime(campaign.startsAt)} → {campaign.endsAt ? formatShortDateTime(campaign.endsAt) : 'Muddatsiz'} · Toshkent</p></div>
              <Badge dot tone={state.tone}>{state.label}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4 lg:grid-cols-4">
              {[['Campaign pool', coins(campaign.totalPool)], ['Distributed', coins(campaign.distributed)], ['Remaining', coins(campaign.remaining)], ['Total winners', String(campaign.totalWinners)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
            </dl>
            <p className="text-sm text-muted">Minimum score: {campaign.minimumScore} / 10 · {campaign.strategy === 'FIRST_ELIGIBLE' ? 'FIRST_ELIGIBLE — ro‘yxat tartibida' : 'WEIGHTED_RANDOM — nisbiy vaznlar'}</p>
            <Table columns={['Mukofot', 'G‘oliblar', 'Qoldi', 'Gol oralig‘i', 'Vazn']}>
              {[...campaign.options].sort((a, b) => a.sortOrder - b.sortOrder).map((option) => <tr key={option.id} className={rowClass}>
                <td className={`${cellClass} font-semibold`}>{coins(option.amount)}</td>
                <td className={`${cellClass} tabular-nums`}>{option.awarded}{option.quantity === null ? ' / Poolgacha' : ` / ${option.quantity}`}</td>
                <td className={`${cellClass} tabular-nums`}>{option.quantity === null ? 'Poolgacha' : option.quantity - option.awarded}</td>
                <td className={cellClass}>{Math.max(campaign.minimumScore, option.minScore)}–{option.maxScore} / 10</td>
                <td className={cellClass}>{campaign.strategy === 'WEIGHTED_RANDOM' ? option.weight : '—'}</td>
              </tr>)}
            </Table>
            {campaign.status === 'active' || campaign.status === 'paused' ? <SunCoinCampaignActions id={campaign.id} title={campaign.title} status={campaign.status} endOnly /> : null}
            <p className="break-all text-xs text-subtle">Yaratilgan: {formatShortDateTime(campaign.createdAt)} · ID: {campaign.id}</p>
          </Card>;
        })}
      </div>}
    </section>
  </div>;
}
