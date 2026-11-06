'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { smmPlace, smmReview, type OrderInput, type Review } from '@/lib/actions/smm';
import { adapterOf, lines, SUBSCRIPTION_COST, UNSUPPORTED_TYPE, type DonatProduct, type Gift, type Service } from '@/lib/neosmm/catalog';
import { formatSom } from '@/lib/neosmm/decimal';
import type { Balance } from '@/lib/neosmm/server';

export type OrderTarget = { kind: 'smm'; service: Service } | { kind: 'gift'; gift: Gift } | { kind: 'donat'; product: DonatProduct };
type PublicReview = Omit<Review, 'providerParams'>;

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Form → server review → "Buyurtmani tasdiqlash". Money is spent only on that last button, once. */
export function OrderDialog({
  target,
  rateUnit = null,
  balance,
  onClose,
}: {
  target: OrderTarget;
  rateUnit?: number | null;
  balance: Extract<Balance, { ok: true }> | null;
  onClose: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const [drip, setDrip] = useState(false);
  const [acceptUnverified, setAcceptUnverified] = useState(false);
  const [review, setReview] = useState<PublicReview | null>(null);
  const [busy, setBusy] = useState<'review' | 'place' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const name = target.kind === 'smm' ? target.service.name : target.kind === 'gift' ? target.gift.name : target.product.name;
  const id = target.kind === 'smm' ? target.service.id : target.kind === 'gift' ? target.gift.id : target.product.id;
  const adapter = target.kind === 'smm' ? adapterOf(target.service.type) : null;
  const cannot =
    target.kind === 'smm' && !adapter ? UNSUPPORTED_TYPE(target.service.type) : target.kind === 'smm' && adapter === 'subscription' ? SUBSCRIPTION_COST : null;

  const input = (unverifiedOk = acceptUnverified): OrderInput =>
    target.kind === 'smm'
      ? {
          kind: 'smm',
          id,
          form: {
            link: f.link,
            quantity: num(f.quantity ?? ''),
            comments: f.comments,
            usernames: f.usernames,
            hashtag: f.hashtag,
            answerNumber: num(f.answer ?? ''),
            ...(drip ? { runs: num(f.runs ?? ''), interval: num(f.interval ?? '') } : {}),
          },
        }
      : target.kind === 'gift'
        ? { kind: 'gift', id, username: f.username ?? '', comment: f.comment }
        : { kind: 'donat', id, fields: Object.fromEntries(target.product.requires.map((k) => [k, f[k] ?? ''])), acceptUnverified: unverifiedOk };

  const doReview = async (unverifiedOk = acceptUnverified) => {
    setBusy('review');
    setError(null);
    setNotice(null);
    try {
      const res = await smmReview(input(unverifiedOk));
      if (res.ok) setReview(res.review);
      else setError(res.message);
    } catch {
      setError('Tekshirib bo‘lmadi. Internetni tekshiring.');
    } finally {
      setBusy(null);
    }
  };

  const place = async () => {
    if (!review || busy) return;
    setBusy('place');
    setError(null);
    try {
      const res = await smmPlace(review.token, input(), { price: review.price, cost: review.cost });
      if (res.ok) setDone({ ok: true, message: res.message });
      else if (res.state === 'changed' && res.review) {
        setReview(res.review);
        setNotice(res.message);
      } else if (res.state === 'unknown' || res.state === 'duplicate') setDone({ ok: false, message: res.message });
      else setError(res.message);
    } catch {
      // The request may or may not have reached the server: no automatic resend.
      setDone({ ok: false, message: 'Javob kelmadi. Qayta yubormang — “Buyurtmalar”da natijani tekshiring.' });
    } finally {
      setBusy(null);
    }
  };

  const blocked = review?.blocked && review.blocked !== 'UNVERIFIED' ? review.blocked : null;
  const unverified = review?.blocked === 'UNVERIFIED';

  return (
    <Dialog open onClose={() => (busy === 'place' ? undefined : onClose())} title={done ? 'Natija' : review ? 'Buyurtmani tekshiring' : name} description={done || review ? undefined : `ID ${id}`} size="lg">
      {done ? (
        <div className="space-y-4">
          <Notice tone={done.ok ? 'success' : 'warning'}>{done.message}</Notice>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Yopish
            </Button>
            <Link href="/smm-api?bolim=buyurtmalar" className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
              Buyurtmalarga o‘tish
            </Link>
          </div>
        </div>
      ) : review ? (
        <div className="space-y-4 text-sm">
          {notice ? <Notice tone="warning">{notice}</Notice> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
            <Item label="Xizmat" value={review.itemName} />
            <Item label="ID" value={String(review.itemId)} />
            {review.category ? <Item label={review.kind === 'donat' ? 'O‘yin' : 'Kategoriya'} value={review.category} /> : null}
            {review.type ? <Item label="Turi" value={review.type} /> : null}
            <Item label={review.kind === 'smm' ? 'Havola' : review.kind === 'gift' ? 'Qabul qiluvchi' : 'O‘yinchi'} value={review.target} />
            {review.quantity ? <Item label="Miqdor" value={review.quantity.toLocaleString('ru-RU')} /> : null}
            {review.details.map((d) => (
              <Item key={d.label} label={d.label} value={d.value} pre />
            ))}
            <Item
              label="Tarif"
              value={`${formatSom(review.price, review.currency)}${review.kind === 'smm' ? (review.priceUnit ? ` / ${review.priceUnit.toLocaleString('ru-RU')} ta` : ' (birligi tasdiqlanmagan)') : ' (qat’iy narx)'}`}
            />
            <Item label={review.costIsEstimate ? 'Taxminiy narx' : 'Narx'} value={review.cost ? formatSom(review.cost, review.currency) : 'Hisoblab bo‘lmaydi'} strong />
            <Item label="Balans" value={review.balance ? formatSom(review.balance, review.currency) : balance ? `${formatSom(balance.balance, balance.currency)} (oldingi)` : 'Noma’lum'} />
          </dl>
          {review.check ? (
            review.check.verified && review.check.valid ? (
              <Notice tone="success">Provayder ID ni tasdiqladi{review.check.playerName ? `: ${review.check.playerName}` : ''}.</Notice>
            ) : review.check.valid ? (
              <Notice tone="warning" title="ID tekshirilmadi">
                Provayder bu o‘yinda ID ni tekshira olmaydi{review.check.note ? ` (${review.check.note})` : ''}: bu “to‘g‘ri” degani emas. ID ni o‘zingiz tekshiring.
              </Notice>
            ) : null
          ) : null}
          {unverified ? (
            <Checkbox
              label="ID ni o‘zim tekshirdim — shu ID ga yuborilsin"
              checked={acceptUnverified}
              disabled={!!busy}
              onChange={(e) => {
                setAcceptUnverified(e.target.checked);
                void doReview(e.target.checked);
              }}
            />
          ) : null}
          {review.costIsEstimate && review.cost ? (
            <p className="text-[12.5px] text-muted">Taxminiy: provayder yechadigan summa (charge) farq qilishi mumkin — API narxni qulflamaydi va chegaralamaydi.</p>
          ) : null}
          {review.enough === false ? <Notice tone="danger">Balansda mablag‘ yetarli emas. Bot orqali to‘ldiring va balansni yangilang.</Notice> : null}
          {review.warnings.map((w) => (
            <Notice key={w} tone="warning">
              {w}
            </Notice>
          ))}
          {blocked ? <Notice tone="danger">{blocked}</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setReview(null)} disabled={!!busy}>
              Orqaga
            </Button>
            <Button onClick={() => void place()} loading={busy === 'place'} disabled={!!blocked || unverified || review.enough === false || !review.cost}>
              Buyurtmani tasdiqlash
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void doReview();
          }}
        >
          {target.kind === 'smm' ? <ServiceSummary service={target.service} rateUnit={rateUnit} /> : null}
          {cannot ? <Notice tone="warning">{cannot}</Notice> : null}

          {target.kind === 'smm' && adapter && adapter !== 'subscription' ? (
            <>
              <TextInput label="Havola" placeholder="https://…" value={f.link ?? ''} onChange={set('link')} required inputMode="url" autoComplete="off" />
              {adapter === 'comments' || adapter === 'usernames' ? (
                <TextArea
                  label={adapter === 'comments' ? 'Izohlar (har qatorda bittadan)' : 'Foydalanuvchilar (har qatorda bittadan)'}
                  rows={6}
                  value={f[adapter] ?? ''}
                  onChange={set(adapter)}
                  hint={`${lines(f[adapter] ?? '').length} ta · ruxsat: ${target.service.min ?? '?'}–${target.service.max ?? '?'}`}
                  required
                />
              ) : (
                <TextInput
                  label="Miqdor"
                  type="number"
                  inputMode="numeric"
                  min={target.service.min ?? 1}
                  max={target.service.max ?? undefined}
                  step={1}
                  value={f.quantity ?? ''}
                  onChange={set('quantity')}
                  hint={`Ruxsat: ${target.service.min?.toLocaleString('ru-RU') ?? '?'} – ${target.service.max?.toLocaleString('ru-RU') ?? '?'}`}
                  required
                />
              )}
              {adapter === 'hashtag' ? <TextInput label="Hashtag" placeholder="#teg" value={f.hashtag ?? ''} onChange={set('hashtag')} required /> : null}
              {adapter === 'poll' ? <TextInput label="Javob raqami" type="number" min={1} step={1} value={f.answer ?? ''} onChange={set('answer')} required /> : null}
              {adapter === 'default' && target.service.dripfeed ? (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  <Checkbox label="Drip-feed (bo‘lib-bo‘lib yuborish)" checked={drip} onChange={(e) => setDrip(e.target.checked)} />
                  {drip ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput label="Necha marta" type="number" min={2} step={1} value={f.runs ?? ''} onChange={set('runs')} required />
                      <TextInput label="Oraliq (daqiqa)" type="number" min={1} step={1} value={f.interval ?? ''} onChange={set('interval')} required />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {target.kind === 'gift' ? (
            <>
              <p className="text-sm text-muted">
                Narx: <b className="text-ink">{formatSom(target.gift.price)}</b>
                {target.gift.stars ? ` · ${target.gift.stars} Stars` : ''} — qat’iy narx, miqdor yo‘q.
              </p>
              <TextInput label="Qabul qiluvchi" placeholder="@username" value={f.username ?? ''} onChange={set('username')} required autoComplete="off" />
              <TextArea label="Izoh (ixtiyoriy)" rows={3} maxLength={255} value={f.comment ?? ''} onChange={set('comment')} hint={`${(f.comment ?? '').length}/255`} />
            </>
          ) : null}

          {target.kind === 'donat' ? (
            <>
              <p className="text-sm text-muted">
                {target.product.game} · Narx: <b className="text-ink">{formatSom(target.product.price, target.product.currency)}</b> — qat’iy narx.
              </p>
              {target.product.requires.map((k) => (
                <TextInput key={k} label={k === 'server_id' ? 'Server ID' : k === 'player_id' ? 'O‘yinchi ID' : k} value={f[k] ?? ''} onChange={set(k)} required autoComplete="off" />
              ))}
              {!target.product.requires.length ? <p className="text-sm text-muted">Bu mahsulot uchun qo‘shimcha maydon so‘ralmaydi (vaucher kodi buyurtma bajarilgach chiqadi).</p> : null}
            </>
          ) : null}

          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            {!cannot ? (
              <Button type="submit" loading={busy === 'review'}>
                {target.kind === 'donat' && target.product.requires.includes('player_id') ? 'ID ni tekshirish va ko‘rib chiqish' : 'Ko‘rib chiqish'}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ServiceSummary({ service: s, rateUnit }: { service: Service; rateUnit: number | null }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface p-4 text-sm">
      <Item label="Kategoriya" value={s.category} />
      <Item label="Turi" value={s.type} />
      <Item label="API tarifi" value={`${formatSom(s.rate)}${rateUnit ? ` / ${rateUnit.toLocaleString('ru-RU')} ta` : ' (birligi tasdiqlanmagan)'}`} strong />
      <Item label="Min – max" value={`${s.min?.toLocaleString('ru-RU') ?? '?'} – ${s.max?.toLocaleString('ru-RU') ?? '?'}`} />
      <Item label="Refill / bekor" value={`${s.refill ? 'Refill bor' : 'Refill yo‘q'} · ${s.cancel ? 'Bekor qilish mumkin' : 'Bekor qilib bo‘lmaydi'}`} />
    </dl>
  );
}

function Item({ label, value, strong, pre }: { label: string; value: string; strong?: boolean; pre?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-words ${strong ? 'font-semibold' : 'font-medium'} ${pre ? 'max-h-32 overflow-y-auto whitespace-pre-wrap' : ''}`}>{value}</dd>
    </>
  );
}
