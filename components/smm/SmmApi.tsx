'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Tabs } from '@/components/ui/Tabs';
import { smmBalance } from '@/lib/actions/smm';
import { formatSom } from '@/lib/neosmm/decimal';
import type { Balance, Catalog, CatalogKind } from '@/lib/neosmm/server';
import type { DonatProduct, Gift, Service } from '@/lib/neosmm/catalog';
import { formatShortDateTime } from '@/lib/time';

import { DonatView, GiftsView } from './FixedViews';
import { OrdersView, type SmmOrder } from './OrdersView';
import { ServicesView } from './ServicesView';

export type SmmTab = 'hisob' | 'xizmatlar' | 'buyurtmalar' | 'donat' | 'sovgalar';
export type SmmConfig = { keyConfigured: boolean; rateUnit: number | null };

export const BOT_URL = 'https://t.me/neosmmbot';
const REFRESH_GAP_MS = 15_000;

/** The module's frame: the account balance (always on top), the sections, and the live data of the open one. */
export function SmmApi({
  tab,
  config,
  balance: initialBalance,
  orders,
  ordersError,
  catalog,
}: {
  tab: SmmTab;
  config: SmmConfig;
  balance: Balance;
  orders: SmmOrder[];
  ordersError: string | null;
  catalog: Catalog<CatalogKind> | null;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [lastGood, setLastGood] = useState<Extract<Balance, { ok: true }> | null>(initialBalance.ok ? initialBalance : null);
  const [loading, setLoading] = useState(false);
  const last = useRef(Date.now());

  const refresh = useCallback(async (force: boolean) => {
    if (!force && Date.now() - last.current < REFRESH_GAP_MS) return;
    last.current = Date.now();
    setLoading(true);
    try {
      const next = await smmBalance();
      setBalance(next);
      if (next.ok) setLastGood(next);
    } catch {
      setBalance({ ok: false, error: 'Balansni olib bo‘lmadi. Internetni tekshiring.', reason: 'network' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Back from the bot (or any other tab): the balance is asked again — returning is not a payment confirmation.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refresh(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  const balanceText = lastGood ? formatSom(lastGood.balance, lastGood.currency) : null;
  const tabs = [
    { key: 'hisob', label: 'Hisob', href: '/smm-api' },
    { key: 'xizmatlar', label: 'Xizmatlar', href: '/smm-api?bolim=xizmatlar' },
    { key: 'buyurtmalar', label: 'Buyurtmalar', href: '/smm-api?bolim=buyurtmalar', count: orders.length || undefined },
    { key: 'donat', label: 'O‘yin donati', href: '/smm-api?bolim=donat' },
    { key: 'sovgalar', label: 'Telegram sovg‘alari', href: '/smm-api?bolim=sovgalar' },
  ];

  return (
    <div className="space-y-6">
      {!config.keyConfigured ? (
        <Notice tone="danger" title="NeoSMM ulanmagan">
          Server sirlarida <code>NEOSMM_API_KEY</code> yo‘q. Kalitni Vercel’da (Settings → Environment Variables, “Sensitive”) qo‘shing — bu yerga yoki chatga yozmang.
        </Notice>
      ) : null}

      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-sm text-muted">NeoSMM balansi</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums" aria-live="polite">
            {balanceText ?? '—'}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {balance.ok ? (
              <Badge tone="success" dot>
                Ulangan
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                {balance.reason === 'config' ? 'Sozlanmagan' : 'Ulanib bo‘lmadi'}
              </Badge>
            )}
            {lastGood ? <span>Yangilangan: {formatShortDateTime(lastGood.at)}</span> : null}
            {!balance.ok && lastGood ? <span className="text-warning">— oxirgi ma’lum qiymat</span> : null}
          </p>
          {!balance.ok ? <p className="mt-2 text-[13px] text-danger">{balance.error}</p> : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refresh(true)} loading={loading} icon={<Icon name="refresh" size={16} />}>
              Balansni yangilash
            </Button>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
              <Icon name="externalLink" size={16} /> Hisobni bot orqali to‘ldirish
            </a>
          </div>
          <p className="max-w-sm text-[12.5px] text-muted sm:text-right">Hisobni NeoSMM botida to‘ldiring. So‘ng bu yerga qaytib balansni yangilang.</p>
        </div>
      </Card>

      <Tabs items={tabs} active={tab} />

      {tab === 'hisob' ? <Overview config={config} orders={orders} /> : null}
      {tab === 'xizmatlar' && catalog ? <ServicesView catalog={catalog as Catalog<'services'>} config={config} balance={lastGood} /> : null}
      {tab === 'buyurtmalar' ? <OrdersView initial={orders} error={ordersError} /> : null}
      {tab === 'donat' && catalog ? <DonatView catalog={catalog as Catalog<'donat_services'>} balance={lastGood} /> : null}
      {tab === 'sovgalar' && catalog ? <GiftsView catalog={catalog as Catalog<'gifts'>} balance={lastGood} /> : null}
    </div>
  );
}

function Overview({ config, orders }: { config: SmmConfig; orders: SmmOrder[] }) {
  const open = orders.filter((o) => o.state === 'accepted').length;
  const unclear = orders.filter((o) => o.state === 'unknown').length;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-5 text-sm">
        <p className="font-semibold">Ulanish</p>
        <Row label="API kalit" value={config.keyConfigured ? 'Sozlangan (serverda)' : 'Sozlanmagan'} tone={config.keyConfigured ? 'success' : 'danger'} />
        <Row
          label="SMM tarif birligi"
          value={config.rateUnit ? `Tasdiqlangan: ${config.rateUnit.toLocaleString('ru-RU')} ta uchun` : 'Tasdiqlanmagan — SMM narxi hisoblanmaydi'}
          tone={config.rateUnit ? 'success' : 'warning'}
        />
        <p className="text-[12.5px] text-muted">Narxlar provayderning o‘zinikidan — ustama, komissiya yoki boshqa narx qo‘shilmaydi.</p>
      </Card>
      <Card className="space-y-3 p-5 text-sm">
        <p className="font-semibold">Buyurtmalar (shu bo‘limdan berilganlari)</p>
        <Row label="Jami" value={String(orders.length)} />
        <Row label="Kuzatilmoqda" value={String(open)} />
        {unclear ? <Row label="Natija noma’lum" value={`${unclear} ta — tekshirish kerak`} tone="warning" /> : null}
        <p className="text-[12.5px] text-muted">Bot orqali berilgan buyurtmalar bu yerga kelmaydi: API ularning ro‘yxatini bermaydi.</p>
      </Card>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={`text-right font-medium ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : ''}`}>{value}</span>
    </p>
  );
}

/** Catalogue freshness line: when it was fetched, and a clear mark when it is an old copy. */
export function Freshness({ catalog, onRefresh, refreshing }: { catalog: { fetchedAt: string | null; stale: boolean; error: string | null; skipped: number }; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="space-y-2">
      {catalog.error ? (
        <Notice tone={catalog.stale ? 'warning' : 'danger'} title={catalog.stale ? 'Eski nusxa ko‘rsatilmoqda' : 'Ro‘yxatni olib bo‘lmadi'}>
          {catalog.error}
          {catalog.stale ? ' Narx va mavjudlik buyurtma oldidan qayta tekshiriladi.' : ''}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
        <span>
          {catalog.fetchedAt ? `Yangilangan: ${formatShortDateTime(catalog.fetchedAt)}` : 'Hali yuklanmagan'}
          {catalog.skipped ? ` · ${catalog.skipped} ta yozuvni o‘qib bo‘lmadi (ID yoki narx yo‘q)` : ''}
        </span>
        <Button variant="ghost" onClick={onRefresh} loading={refreshing} icon={<Icon name="refresh" size={15} />}>
          Ro‘yxatni yangilash
        </Button>
      </div>
    </div>
  );
}

export type { DonatProduct, Gift, Service };
