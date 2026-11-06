'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { smmCancel, smmOrders, smmRefill, smmRefresh, smmResolve } from '@/lib/actions/smm';
import { isCompleted, isFinal, statusLabel } from '@/lib/neosmm/catalog';
import { decCmp, decText, formatSom, parseDec } from '@/lib/neosmm/decimal';
import { UNKNOWN_RESULT } from '@/lib/neosmm/submit';
import { formatShortDateTime } from '@/lib/time';

export type SmmOrder = Awaited<ReturnType<typeof smmOrders>>['orders'][number];

const KIND = { smm: 'SMM', gift: 'Sovg‘a', donat: 'Donat' } as const;
const POLL_MS = 45_000;
const open = (o: SmmOrder) => o.state === 'accepted' && (!isFinal(o.status) || (!!o.refill_id && !isFinal(o.refill_status)));
const stuck = (o: SmmOrder) => o.state === 'unknown' || (o.state === 'submitting' && Date.now() - Date.parse(o.created_at) > 120_000);

/** Orders made from this module (the API cannot list the bot's older ones), kept in the database. */
export function OrdersView({ initial, error: initialError }: { initial: SmmOrder[]; error: string | null }) {
  const [orders, setOrders] = useState(initial);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<'all' | keyof typeof KIND>('all');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const active = orders.some(open);

  const reload = useCallback(async (manual: boolean) => {
    setBusy((b) => b ?? 'refresh');
    try {
      const r = await smmRefresh(manual);
      const list = await smmOrders();
      if (list.ok) setOrders(list.orders);
      setError(list.ok ? (r.failed ? `${r.failed} ta buyurtma holatini olib bo‘lmadi — keyinroq yana urinib ko‘riladi.` : null) : list.message);
      setCheckedAt(new Date().toISOString());
    } catch {
      setError('Holatlarni yangilab bo‘lmadi. Oxirgi ma’lum holat ko‘rsatilmoqda.');
    } finally {
      setBusy((b) => (b === 'refresh' ? null : b));
    }
  }, []);

  // Open orders are followed while this page is visible; hidden or all finished — no polling.
  useEffect(() => {
    if (!active) return;
    const tick = () => document.visibilityState === 'visible' && void reload(false);
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active, reload]);

  const act = async (id: string, run: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(id);
    try {
      const res = await run();
      setMessages((m) => ({ ...m, [id]: res.message }));
      await reload(true);
    } catch {
      setMessages((m) => ({ ...m, [id]: 'Amalni bajarib bo‘lmadi. Holatni yangilab ko‘ring.' }));
    } finally {
      setBusy(null);
    }
  };

  const list = useMemo(() => orders.filter((o) => kind === 'all' || o.kind === kind), [orders, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Turi">
          {(['all', 'smm', 'gift', 'donat'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`h-9 rounded-full border px-3.5 text-sm font-medium ${kind === k ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}
            >
              {k === 'all' ? 'Hammasi' : KIND[k]} · {k === 'all' ? orders.length : orders.filter((o) => o.kind === k).length}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void reload(true)} loading={busy === 'refresh'} icon={<Icon name="refresh" size={16} />}>
          Holatlarni yangilash
        </Button>
      </div>
      {checkedAt ? <p className="text-[12.5px] text-muted">Tekshirildi: {formatShortDateTime(checkedAt)}</p> : null}
      {error ? <Notice tone="warning">{error}</Notice> : null}

      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Bu yerdan hali buyurtma berilmagan.</Card>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id}>
              <OrderCard order={o} busy={busy} message={messages[o.id]} onAct={act} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  order: o,
  busy,
  message,
  onAct,
}: {
  order: SmmOrder;
  busy: string | null;
  message?: string;
  onAct: (id: string, run: () => Promise<{ ok: boolean; message: string }>) => Promise<void>;
}) {
  const [showCode, setShowCode] = useState(false);
  const [manualId, setManualId] = useState('');
  const status = statusLabel(o.status);
  const est = parseDec(o.estimate);
  const charge = parseDec(o.charge);
  const diff = est && charge && decCmp(est, charge) !== 0 ? { n: charge.n * 10n ** BigInt(Math.max(est.s, charge.s) - charge.s) - est.n * 10n ** BigInt(Math.max(est.s, charge.s) - est.s), s: Math.max(est.s, charge.s) } : null;
  const canCancel = o.kind === 'smm' && o.state === 'accepted' && o.can_cancel && !isFinal(o.status) && !o.cancel_requested_at;
  const canRefill = o.kind === 'smm' && o.state === 'accepted' && o.can_refill && (isCompleted(o.status) || /partial/i.test(o.status ?? '')) && (!o.refill_id || isFinal(o.refill_status));

  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <Badge>{KIND[o.kind as keyof typeof KIND] ?? o.kind}</Badge>
            {o.provider_order_id ? <span className="font-medium text-ink">#{o.provider_order_id}</span> : null}
            <span>{formatShortDateTime(o.created_at)}</span>
          </p>
          <p className="mt-1 font-medium break-words">
            {o.item_name} <span className="text-muted">· ID {o.item_id}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] break-all text-muted">{o.target}</p>
        </div>
        <div className="shrink-0 text-right">
          {o.state === 'accepted' ? (
            <>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              {o.status && status.label !== o.status ? <p className="mt-1 text-[11.5px] text-muted">Provayder: {o.status}</p> : null}
            </>
          ) : o.state === 'rejected' ? (
            <Badge tone="danger">Qabul qilinmadi</Badge>
          ) : o.state === 'not_placed' ? (
            <Badge>Yuborilmagan</Badge>
          ) : stuck(o) ? (
            <Badge tone="warning">{UNKNOWN_RESULT}</Badge>
          ) : (
            <Badge tone="info">Yuborilmoqda…</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {o.quantity ? <span>Miqdor: {o.quantity.toLocaleString('ru-RU')}</span> : null}
        <span>
          Tarif: {formatSom(o.price, o.currency)}
          {o.kind === 'smm' ? (o.price_unit ? ` / ${o.price_unit.toLocaleString('ru-RU')} ta` : ' (birligi tasdiqlanmagan)') : ''}
        </span>
        {o.estimate ? <span>{o.kind === 'smm' ? 'Taxminiy' : 'Narx'}: {formatSom(o.estimate, o.currency)}</span> : null}
        {o.charge ? (
          <span className="font-medium">
            Yechildi (provayder): {formatSom(o.charge, o.currency)}
            {diff ? <span className={diff.n > 0n ? 'text-danger' : 'text-success'}> ({diff.n > 0n ? '+' : '−'}{formatSom(decText({ n: diff.n < 0n ? -diff.n : diff.n, s: diff.s }), o.currency)} farq)</span> : null}
          </span>
        ) : null}
        {o.remains && o.remains !== '0' ? <span>Qoldi: {o.remains}</span> : null}
        {o.start_count ? <span>Boshlang‘ich: {o.start_count}</span> : null}
        {o.refill_id ? <span>Refill #{o.refill_id}: {statusLabel(o.refill_status).label}</span> : null}
        {o.cancel_requested_at ? <span>Bekor qilish so‘ralgan: {formatShortDateTime(o.cancel_requested_at)}</span> : null}
      </div>

      {o.error && o.state !== 'accepted' ? <p className="text-[12.5px] text-danger">{o.error}</p> : null}
      {o.error && o.state === 'accepted' && o.kind === 'donat' ? <p className="text-[12.5px] text-muted">Sabab: {o.error}</p> : null}

      {o.code ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
          <span className="text-muted">Vaucher kodi:</span>
          {showCode ? (
            <>
              <code className="font-semibold break-all">{o.code}</code>
              <CopyButton value={o.code} label="Nusxalash" variant="ghost" />
            </>
          ) : (
            <Button variant="ghost" onClick={() => setShowCode(true)}>
              Ko‘rsatish
            </Button>
          )}
        </div>
      ) : null}

      {stuck(o) ? (
        <div className="space-y-2 rounded-xl border border-warning/30 bg-warning-soft p-3">
          <p>Javob kelmadi — buyurtma provayderga tushgan bo‘lishi ham mumkin. Avtomatik qayta yuborilmaydi. NeoSMM botida tekshiring:</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12.5px]">
              Topilgan buyurtma raqami
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="h-10 w-40 rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent"
              />
            </label>
            <Button variant="secondary" disabled={!manualId || !!busy} loading={busy === o.id} onClick={() => void onAct(o.id, () => smmResolve(o.id, Number(manualId)))}>
              Biriktirish
            </Button>
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                if (confirm('Botda bu buyurtma yo‘q ekaniga ishonchingiz komilmi?')) void onAct(o.id, () => smmResolve(o.id, null));
              }}
            >
              Provayderga tushmagan
            </Button>
          </div>
        </div>
      ) : null}

      {canCancel || canRefill ? (
        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <Button
              variant="danger"
              loading={busy === o.id}
              disabled={!!busy}
              onClick={() => {
                if (confirm('Provayderga bekor qilish so‘rovi yuborilsinmi? Bu pul qaytdi degani emas — natija holatda ko‘rinadi.')) void onAct(o.id, async () => {
                  const r = await smmCancel([o.id]);
                  return { ok: r.ok, message: r.results[0]?.message ?? r.message };
                });
              }}
            >
              Bekor qilish
            </Button>
          ) : null}
          {canRefill ? (
            <Button variant="secondary" loading={busy === o.id} disabled={!!busy} onClick={() => void onAct(o.id, () => smmRefill(o.id))}>
              Qayta tiklash (refill)
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-[12.5px] text-muted">{message}</p> : null}
    </Card>
  );
}
