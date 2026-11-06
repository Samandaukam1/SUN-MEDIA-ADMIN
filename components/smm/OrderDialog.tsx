'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { smmPlace, smmReview, type OrderInput, type Review } from '@/lib/actions/smm';
import { smmProfileList } from '@/lib/actions/smm-plans';
import { adapterOf, lines, platformOf, SUBSCRIPTION_COST, UNSUPPORTED_TYPE, type DonatProduct, type Gift, type Service } from '@/lib/neosmm/catalog';
import { formatSom } from '@/lib/neosmm/decimal';
import type { HealthRow } from '@/lib/neosmm/health';
import type { Balance } from '@/lib/neosmm/server';
import { parseTarget } from '@/lib/neosmm/targets';
import { formatShortDateTime } from '@/lib/time';

import { TargetField } from './bits';
import { ServiceHealthPanel } from './ServiceHealthPanel';
import { SplitPlanner } from './SplitPlanner';

export type OrderTarget = { kind: 'smm'; service: Service } | { kind: 'gift'; gift: Gift } | { kind: 'donat'; product: DonatProduct };
type PublicReview = Omit<Review, 'providerParams'>;

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Form → server review → "Buyurtmani tasdiqlash". Money is spent only on that last button, once. */
export function OrderDialog({
  target,
  rateUnit = null,
  balance,
  lastRejection = null,
  health = null,
  onHealthChange,
  onClose,
}: {
  target: OrderTarget;
  rateUnit?: number | null;
  balance: Extract<Balance, { ok: true }> | null;
  /** This service's latest order here was refused: said before another try. */
  lastRejection?: { at: string; message: string } | null;
  /** SMM: the service's evidence row (null — nothing recorded yet). */
  health?: HealthRow | null;
  onHealthChange?: (row: HealthRow | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [profiles, setProfiles] = useState<{ id: string; username: string; display_name: string | null }[] | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [drip, setDrip] = useState(false);
  const [acceptUnverified, setAcceptUnverified] = useState(false);
  const [review, setReview] = useState<PublicReview | null>(null);
  const [busy, setBusy] = useState<'review' | 'place' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; message: string; queued?: boolean } | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const name = target.kind === 'smm' ? target.service.name : target.kind === 'gift' ? target.gift.name : target.product.name;
  const id = target.kind === 'smm' ? target.service.id : target.kind === 'gift' ? target.gift.id : target.product.id;
  const adapter = target.kind === 'smm' ? adapterOf(target.service.type) : null;
  const cannot =
    target.kind === 'smm' && !adapter ? UNSUPPORTED_TYPE(target.service.type) : target.kind === 'smm' && adapter === 'subscription' ? SUBSCRIPTION_COST : null;
  const platform = target.kind === 'smm' ? platformOf(target.service) : '';
  const linkInfo = target.kind === 'smm' ? parseTarget(f.link ?? '', platform) : null;
  const isPost = linkInfo?.platform === 'Instagram' && linkInfo.kind === 'post';

  // A post / reels link: its profile card only by the owner's explicit choice.
  useEffect(() => {
    if (!isPost || profiles) return;
    smmProfileList().then(setProfiles, () => setProfiles([]));
  }, [isPost, profiles]);
  const profileId = isPost && f.profileId ? f.profileId : null;

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
            ...(profileId ? { profileId } : {}),
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
      if (res.ok) setDone({ ok: true, message: res.message, queued: res.state === 'queued' });
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

  const targetInput =
    target.kind === 'smm' ? (
      <div className="space-y-3">
        <TargetField value={f.link ?? ''} onChange={(v) => setF((x) => ({ ...x, link: v }))} platform={platform} />
        {linkInfo?.platform === 'Instagram' ? (
          <p className="text-[12.5px] text-muted">
            {linkInfo.kind === 'profile'
              ? `Profil: @${linkInfo.username} — buyurtma shu profil kartasiga bog‘lanadi.`
              : linkInfo.kind === 'post'
                ? 'Post / reels havolasi — profil havoladan taxmin qilinmaydi.'
                : 'Instagram havolasi (profil yoki post emas).'}
          </p>
        ) : null}
        {isPost ? (
          <SelectInput label="Profil kartasi (ixtiyoriy)" value={f.profileId ?? ''} onChange={set('profileId')}>
            <option value="">Bog‘lamaslik</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                @{p.username}
                {p.display_name ? ` — ${p.display_name}` : ''}
              </option>
            ))}
          </SelectInput>
        ) : null}
      </div>
    ) : null;

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
            <Link
              href={done.queued ? '/smm-api?bolim=rejalar' : '/smm-api?bolim=buyurtmalar'}
              className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              {done.queued ? 'Navbatni ko‘rish' : 'Buyurtmalarga o‘tish'}
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
            {review.health ? <Item label="Xizmat holati" value={`${review.health.label}${review.health.reason ? ` — ${review.health.reason}` : ''}`} /> : null}
            {review.refill ? (
              <Item
                label="Kafolat"
                value={
                  review.refill.verified
                    ? `${review.refill.days} kun (${review.refill.starts === 'accepted' ? 'qabul qilingandan' : 'bajarilgandan'}) · ${review.refill.basis ?? ''}`
                    : `Muddat tasdiqlanmagan${review.refill.api ? ' (API: refill so‘rash mumkin)' : ''}`
                }
              />
            ) : null}
            {review.queueBusy ? <Item label="Navbat" value="Oldingi buyurtma tugashini kutmoqda" strong /> : null}
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
              {review.queueBusy ? 'Tasdiqlash va navbatga qo‘yish' : 'Buyurtmani tasdiqlash'}
            </Button>
          </div>
        </div>
      ) : target.kind === 'smm' && mode === 'split' ? (
        <div className="space-y-4">
          <ModeSwitch mode={mode} onChange={setMode} />
          <SplitPlanner service={target.service} link={f.link ?? ''} profileId={profileId} targetField={targetInput} onClose={onClose} />
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
          {target.kind === 'smm' ? <ServiceHealthPanel service={target.service} row={health} onChange={(row) => onHealthChange?.(row)} /> : null}
          {target.kind === 'smm' && adapter === 'default' ? <ModeSwitch mode={mode} onChange={setMode} /> : null}
          {lastRejection ? (
            <Notice tone="warning" title={`${formatShortDateTime(lastRejection.at)} dagi urinish qabul qilinmagan`}>
              {lastRejection.message}
            </Notice>
          ) : null}
          {cannot ? <Notice tone="warning">{cannot}</Notice> : null}

          {target.kind === 'smm' && adapter && adapter !== 'subscription' ? (
            <>
              {targetInput}
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

function ModeSwitch({ mode, onChange }: { mode: 'single' | 'split'; onChange: (m: 'single' | 'split') => void }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Buyurtma usuli">
      {(
        [
          ['single', 'Bitta buyurtma'],
          ['split', 'Bo‘lib yuborish'],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={mode === k}
          onClick={() => onChange(k)}
          className={`h-9 rounded-full border px-3.5 text-sm font-medium ${mode === k ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
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
