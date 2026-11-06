'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { smmPlanControl, smmPlans } from '@/lib/actions/smm-plans';
import { isFinal, statusLabel } from '@/lib/neosmm/catalog';
import { decText, formatSom, parseDec } from '@/lib/neosmm/decimal';
import { PLAN_PHASE, planPhase } from '@/lib/neosmm/schedule';
import { projectSending } from '@/lib/neosmm/split';
import { formatShortDateTime } from '@/lib/time';

export type SmmPlan = Awaited<ReturnType<typeof smmPlans>>['plans'][number];

const POLL_MS = 60_000;
const PART_STATE: Record<string, string> = {
  planned: 'Navbatda',
  dispatching: 'Tekshirilmoqda',
  sending: 'Yuborilmoqda',
  sent: 'Yuborilgan',
  rejected: 'Qabul qilinmadi',
  unknown: 'Natija noma’lum — tekshirish kerak',
  not_placed: 'Provayderga tushmagan',
  cancelled: 'Bekor qilingan (yuborilmagan)',
};

const add = (a: string | null, b: string | null) => {
  const x = parseDec(a ?? '0')!;
  const y = parseDec(b ?? '0');
  if (!y) return decText(x);
  const s = Math.max(x.s, y.s);
  return decText({ n: x.n * 10n ** BigInt(s - x.s) + y.n * 10n ** BigInt(s - y.s), s });
};

/** Split plans and queued orders: what is planned, what was sent, what the provider reports, what was charged. */
export function PlansView({ initial, error: initialError }: { initial: SmmPlan[]; error: string | null }) {
  const [plans, setPlans] = useState(initial);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const active = plans.some((p) => p.status === 'active' || p.status === 'paused');

  const reload = useCallback(async () => {
    try {
      const r = await smmPlans();
      if (r.ok) setPlans(r.plans);
      setError(r.ok ? null : r.message);
    } catch {
      setError('Rejalarni yangilab bo‘lmadi. Oxirgi ma’lum holat ko‘rsatilmoqda.');
    }
  }, []);

  // While a plan is open and the page visible: a re-read every minute (the server does the sending, not this page).
  useEffect(() => {
    if (!active) return;
    const tick = () => document.visibilityState === 'visible' && void reload();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active, reload]);

  const control = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel' && !confirm('Yuborilmagan qismlar bekor qilinsinmi? Allaqachon yuborilgan buyurtmalar provayderda o‘z holatida qoladi.')) return;
    setBusy(id);
    try {
      const r = await smmPlanControl(id, action);
      setMessages((m) => ({ ...m, [id]: r.message }));
      await reload();
    } catch {
      setMessages((m) => ({ ...m, [id]: 'Amalni bajarib bo‘lmadi.' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          Rejadagi qismlarni server o‘zi yuboradi (har daqiqada tekshiradi) — brauzer yoki kompyuter yopiq bo‘lsa ham. Har bir profil va reja o‘z jadvali bo‘yicha mustaqil
          ishlaydi. Faqat bir xil xizmat va bir xil profil/havolada bir vaqtda bitta buyurtma bo‘ladi (NeoSMM qoidasi): oldingisi tugamaguncha keyingisi kutadi.
        </p>
        <Button variant="secondary" onClick={() => void reload()} icon={<Icon name="refresh" size={16} />}>
          Yangilash
        </Button>
      </div>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {plans.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Hali reja yo‘q. Xizmatni tanlab, “Bo‘lib yuborish”ni bosing.</Card>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li key={p.id}>
              <PlanCard plan={p} busy={busy === p.id} message={messages[p.id]} onControl={control} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanCard({ plan: p, busy, message, onControl }: { plan: SmmPlan; busy: boolean; message?: string; onControl: (id: string, a: 'pause' | 'resume' | 'cancel') => void }) {
  const now = Date.now();
  const orderOf = (id: string) => p.orders.find((o) => o.id === id) ?? null;
  const projected = projectSending(p.parts, p.spacing_seconds, now);
  const sentParts = p.parts.filter((x) => x.state === 'sent');
  const submitted = sentParts.reduce((n, x) => n + x.quantity, 0);
  // Provider-reported: what it says is left; delivered = ordered − remains, only where remains is known.
  let reportedDone = 0;
  let reportedLeft = 0;
  let unknownProgress = 0;
  let charged: string | null = null;
  let uncharged = 0;
  for (const x of sentParts) {
    const o = orderOf(x.order_id);
    const remains = o?.remains && /^\d+$/.test(o.remains) ? Number(o.remains) : null;
    if (o?.status && /completed/i.test(o.status)) reportedDone += x.quantity;
    else if (remains !== null) {
      reportedDone += Math.max(0, x.quantity - remains);
      reportedLeft += remains;
    } else unknownProgress += x.quantity;
    if (o?.charge) charged = add(charged, o.charge);
    else uncharged++;
  }
  const nextIdx = p.parts.findIndex((x) => x.state === 'planned');
  const waitingForQueue = !!p.queue && nextIdx >= 0 && !p.parts.some((x) => x.order_id === p.queue!.order_id) && Date.parse(p.parts[nextIdx].due_at) <= now;
  const holderIsOwnPart = !!p.queue && p.parts.some((x) => x.order_id === p.queue!.order_id);
  const lastProjected = [...projected].reverse().find((x) => x !== null) ?? null;
  const st = PLAN_PHASE[planPhase(p, now)];
  const left = p.parts.filter((x) => x.state === 'planned' || x.state === 'dispatching');
  const h = p.holder;
  const open = p.status === 'active' || p.status === 'paused';

  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <Badge>{p.origin === 'queued' ? 'Navbatdagi buyurtma' : 'Bo‘lib yuborish'}</Badge>
            <span>Reja {p.id.slice(0, 8)}</span>
            <span>{formatShortDateTime(p.created_at)}</span>
          </p>
          <p className="mt-1 font-medium break-words">
            {p.service_name} <span className="text-muted">· ID {p.service_id}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] break-all text-muted">{p.target}</p>
        </div>
        <Badge tone={st.tone} dot>
          {st.label}
        </Badge>
      </div>

      {p.pause_reason && p.status === 'paused' ? <Notice tone="warning">{p.pause_reason}</Notice> : null}
      {waitingForQueue && p.status === 'active' ? (
        <Notice tone="info">
          Oldingi buyurtma tugashini kutmoqda: shu xizmat (ID {p.service_id}) va shu profil/havoladagi
          {h ? ` buyurtma ${h.provider_order_id ? `#${h.provider_order_id}` : h.id.slice(0, 8)}${h.quantity ? ` · ${h.quantity.toLocaleString('ru-RU')} ta` : ''}${h.status ? ` · ${statusLabel(h.status).label}` : ''} (${formatShortDateTime(h.created_at)})` : ' boshqa buyurtma'}
          . NeoSMM bitta havolaga bitta xizmatdan bir vaqtda faqat bitta faol buyurtma oladi. Boshqa profillardagi buyurtmalar bunga bog‘liq emas.
        </Notice>
      ) : null}
      {holderIsOwnPart && p.status === 'active' && nextIdx >= 0 ? (
        <p className="text-[12.5px] text-muted">Keyingi qism oldingi qism tugagach va o‘z vaqti kelgach yuboriladi.</p>
      ) : null}

      <div className="grid gap-x-5 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <span>
          Reja: <b>{p.total_quantity.toLocaleString('ru-RU')}</b> ta, {p.part_count} qism
          {p.part_count > 1 ? ` · ${Math.round(p.window_seconds / 3600)} soat oralig‘ida` : ''}
        </span>
        <span>
          Yuborilgan: {submitted.toLocaleString('ru-RU')} ta · {sentParts.length}/{p.part_count} qism
          {open && left.length ? ` · qolgan ${left.length} qism (${left.reduce((n, x) => n + x.quantity, 0).toLocaleString('ru-RU')} ta)` : ''}
        </span>
        <span>
          Provayder hisobi: bajarilgan {reportedDone.toLocaleString('ru-RU')}
          {reportedLeft ? ` · qoldi ${reportedLeft.toLocaleString('ru-RU')}` : ''}
          {unknownProgress ? ` · ${unknownProgress.toLocaleString('ru-RU')} ta hali ma’lum emas` : ''}
        </span>
        <span>
          Taxminiy: {formatSom(p.estimate, p.currency)} · Yechilgan (provayder): {charged ? formatSom(charged, p.currency) : '—'}
          {uncharged && sentParts.length ? ` (${uncharged} tasida hali yo‘q)` : ''}
        </span>
        <span>
          Tarif (tasdiqlangan): {formatSom(p.price, p.currency)} / {p.price_unit.toLocaleString('ru-RU')} ta
        </span>
        {open && nextIdx >= 0 ? (
          <span>
            Keyingi yuborish: {projected[nextIdx] !== null ? formatShortDateTime(new Date(projected[nextIdx]!).toISOString()) : '—'}
            {lastProjected && p.part_count > 1 ? ` · oxirgisi taxminan ${formatShortDateTime(new Date(lastProjected).toISOString())}` : ''}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Miqdor</th>
              <th className="px-3 py-2 font-medium">Reja vaqti</th>
              <th className="px-3 py-2 font-medium">Yuborildi / navbat</th>
              <th className="px-3 py-2 font-medium">Holat</th>
            </tr>
          </thead>
          <tbody>
            {p.parts.map((x, i) => {
              const o = orderOf(x.order_id);
              const s = o?.state === 'accepted' ? statusLabel(o.status) : null;
              return (
                <tr key={x.part_index} className="border-t border-line align-top">
                  <td className="px-3 py-2">{x.part_index + 1}</td>
                  <td className="px-3 py-2 tabular-nums">{x.quantity.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">{formatShortDateTime(x.planned_at)}</td>
                  <td className="px-3 py-2">
                    {o?.submitted_at ? formatShortDateTime(o.submitted_at) : projected[i] !== null && open ? `≈ ${formatShortDateTime(new Date(projected[i]!).toISOString())}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{PART_STATE[x.state] ?? x.state}</span>
                    {o?.provider_order_id ? <span className="text-muted"> · #{o.provider_order_id}</span> : null}
                    {s ? <span className="text-muted"> · {s.label}</span> : null}
                    {o?.remains && o.remains !== '0' && !isFinal(o.status) ? <span className="text-muted"> · qoldi {o.remains}</span> : null}
                    {x.note && x.state !== 'sent' ? <span className="block text-[12px] text-muted">{x.note}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="flex flex-wrap gap-2">
          {p.status === 'active' ? (
            <Button variant="secondary" disabled={busy} onClick={() => onControl(p.id, 'pause')} icon={<Icon name="pause" size={15} />}>
              Pauza
            </Button>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={() => onControl(p.id, 'resume')}>
              Davom ettirish
            </Button>
          )}
          {p.parts.some((x) => ['planned', 'dispatching', 'rejected', 'not_placed'].includes(x.state)) ? (
            <Button variant="danger" disabled={busy} onClick={() => onControl(p.id, 'cancel')}>
              Yuborilmagan qismlarni bekor qilish
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-[12.5px] text-muted">{message}</p> : null}
    </Card>
  );
}
