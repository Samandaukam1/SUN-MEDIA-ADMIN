'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Checkbox, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { smmPlanCreate, smmPlanReview, type PlanInput, type PlanReview } from '@/lib/actions/smm-plans';
import type { Service } from '@/lib/neosmm/catalog';
import { formatSom } from '@/lib/neosmm/decimal';
import { splitQuantity } from '@/lib/neosmm/split';
import { formatShortDateTime, fromLocalInput } from '@/lib/time';

const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** Total → exact parts → sending times → "Rejani tasdiqlash". The server builds and checks everything again. */
export function SplitPlanner({
  service,
  link,
  profileId,
  targetField,
  onClose,
}: {
  service: Service;
  link: string;
  profileId: string | null;
  targetField: React.ReactNode;
  onClose: () => void;
}) {
  const [total, setTotal] = useState('');
  const [preferred, setPreferred] = useState(String(service.min ?? ''));
  const [even, setEven] = useState(false);
  const [start, setStart] = useState('');
  const [hours, setHours] = useState('48');
  const [review, setReview] = useState<PlanReview | null>(null);
  const [busy, setBusy] = useState<'review' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const min = service.min ?? 1;
  const max = service.max ?? 100_000_000;
  // A live preview of the split (the server recomputes it on review).
  const preview = num(total) ? splitQuantity({ total: num(total)!, min, max, preferred: num(preferred), even }) : null;

  const input = (): PlanInput => ({
    serviceId: service.id,
    link,
    total: num(total) ?? 0,
    startAt: start ? fromLocalInput(start) : null,
    windowHours: Number(hours || 0),
    preferred: num(preferred),
    even,
    profileId,
  });

  const doReview = async () => {
    setBusy('review');
    setError(null);
    setNotice(null);
    try {
      const r = await smmPlanReview(input());
      if (r.ok) setReview(r.review);
      else setError(r.message);
    } catch {
      setError('Tekshirib bo‘lmadi. Internetni tekshiring.');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!review || busy) return;
    setBusy('create');
    setError(null);
    try {
      const r = await smmPlanCreate(review.token, input(), { price: review.price, estimate: review.estimate, parts: review.parts.map((p) => p.quantity) });
      if (r.ok) setDone(r.message);
      else if (r.review) {
        setReview(r.review);
        setNotice(r.message);
      } else setError(r.message);
    } catch {
      setDone('Javob kelmadi. Qayta yubormang — “Rejalar”da tekshiring.');
    } finally {
      setBusy(null);
    }
  };

  if (done)
    return (
      <div className="space-y-4">
        <Notice tone="success">{done}</Notice>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
          <Link href="/smm-api?bolim=rejalar" className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
            Rejalarga o‘tish
          </Link>
        </div>
      </div>
    );

  if (review)
    return (
      <div className="space-y-4 text-sm">
        {notice ? <Notice tone="warning">{notice}</Notice> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
          <Row label="Xizmat" value={`${review.serviceName} · ID ${review.serviceId}`} />
          <Row label="Havola" value={review.target} />
          <Row label="Jami" value={`${review.total.toLocaleString('ru-RU')} ta · ${review.parts.length} qism`} strong />
          <Row label="Tarif" value={`${formatSom(review.price, review.currency)}${review.priceUnit ? ` / ${review.priceUnit.toLocaleString('ru-RU')} ta` : ''}`} />
          <Row label="Taxminiy jami" value={review.estimate ? formatSom(review.estimate, review.currency) : 'Hisoblab bo‘lmaydi'} strong />
          <Row label="Hozirgi balans" value={review.balance ? formatSom(review.balance, review.currency) : 'Noma’lum'} />
          <Row label="Xizmat holati" value={`${review.health.label}${review.health.reason ? ` — ${review.health.reason}` : ''}`} />
          <Row label="Kafolat" value={review.refill.verified ? `${review.refill.days} kun (${review.refill.starts === 'accepted' ? 'qabul qilingandan' : 'bajarilgandan'}) — har qismga alohida` : 'Muddat tasdiqlanmagan'} />
        </dl>
        {review.parts.length ? (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Qism</th>
                  <th className="px-3 py-2 font-medium">Miqdor</th>
                  <th className="px-3 py-2 font-medium">Yuborish vaqti (reja)</th>
                  <th className="px-3 py-2 text-right font-medium">Taxminiy narx</th>
                </tr>
              </thead>
              <tbody>
                {review.parts.map((p) => (
                  <tr key={p.index} className="border-t border-line">
                    <td className="px-3 py-2">{p.index + 1}</td>
                    <td className="px-3 py-2 tabular-nums">{p.quantity.toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2">{p.index === 0 && Date.parse(p.at) <= Date.now() + 60_000 ? 'Hozir' : formatShortDateTime(p.at)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatSom(p.estimate, review.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="text-[12.5px] text-muted">
          Taxminiy: provayder yechadigan summa farq qilishi mumkin — API narxni qulflamaydi. Har qism oldidan narx, chegaralar va balans qayta tekshiriladi; narx oshsa reja to‘xtab, sizdan
          so‘raydi.
        </p>
        {review.warnings.map((w) => (
          <Notice key={w} tone="warning">
            {w}
          </Notice>
        ))}
        {review.blocked ? <Notice tone="danger">{review.blocked}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => setReview(null)} disabled={!!busy}>
            Orqaga
          </Button>
          <Button onClick={() => void create()} loading={busy === 'create'} disabled={!!review.blocked || !review.estimate}>
            Rejani tasdiqlash
          </Button>
        </div>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void doReview();
      }}
    >
      {targetField}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Jami miqdor" type="number" inputMode="numeric" min={1} step={1} value={total} onChange={(e) => setTotal(e.target.value)} hint={`Har qism: ${min.toLocaleString('ru-RU')} – ${max.toLocaleString('ru-RU')}`} required />
        <TextInput label="Qism hajmi (taxminan)" type="number" inputMode="numeric" min={min} max={max} step={1} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        <TextInput label="Boshlanish" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} hint="Bo‘sh — hozir (Toshkent vaqti)" />
        <TextInput label="Yuborish oralig‘i (soat)" type="number" inputMode="decimal" min={0} max={720} step="any" value={hours} onChange={(e) => setHours(e.target.value)} hint="Birinchidan oxirgi qismgacha" />
      </div>
      <Checkbox label="Teng bo‘lish (masalan 125 + 125)" checked={even} onChange={(e) => setEven(e.target.checked)} />
      {preview ? (
        preview.ok ? (
          <p className="text-[13px] text-muted">
            Taklif: <b className="text-ink tabular-nums">{preview.parts.map((q) => q.toLocaleString('ru-RU')).join(' + ')}</b> = {num(total)!.toLocaleString('ru-RU')}
          </p>
        ) : (
          <Notice tone="warning">{preview.error}</Notice>
        )
      ) : null}
      <p className="text-[12.5px] text-muted">Har qism alohida oddiy buyurtma bo‘lib, server tomonidan o‘z vaqtida yuboriladi (brauzer yoki kompyuter yopiq bo‘lsa ham). Oldingi qism tugamaguncha keyingisi kutadi.</p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={busy === 'review'} disabled={!preview?.ok || !link.trim()}>
          Rejani ko‘rib chiqish
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-words ${strong ? 'font-semibold' : 'font-medium'}`}>{value}</dd>
    </>
  );
}
