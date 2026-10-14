'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { saveClientBilling } from '@/lib/actions/clients';
import { BILLING_PERIOD, payDate, paymentState, type Billing, type TariffOption } from '@/lib/billing';
import { Money } from './Money';

const field = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent';
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-semibold">{children}</dd>
  </div>
);

export const EMPTY_BILLING: Billing = {
  agreed_price: null,
  currency: 'UZS',
  billing_period: 'monthly',
  next_payment_on: null,
  next_payment_amount: null,
  payment_status: 'pending',
  last_paid_on: null,
  note: null,
  site_plan_id: null,
};

const num = (v: string) => (v.replace(/\s/g, '') === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

/** The editable fields of one client's billing; shared by the client page and the prices table. */
export function BillingFields({ value, tariffs, onChange }: { value: Record<string, string>; tariffs: TariffOption[]; onChange: (next: Record<string, string>) => void }) {
  const set = (k: string) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <label className="text-[13px] text-muted">
        Tarif
        <select value={value.site_plan_id} onChange={set('site_plan_id')} className={`${field} mt-1`}>
          <option value="">Tanlanmagan</option>
          {tariffs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[13px] text-muted">
        Kelishilgan narx
        <input inputMode="decimal" value={value.agreed_price} onChange={set('agreed_price')} placeholder="Masalan 6500000" className={`${field} mt-1`} />
      </label>
      <label className="text-[13px] text-muted">
        Valyuta
        <select value={value.currency} onChange={set('currency')} className={`${field} mt-1`}>
          <option value="UZS">so‘m (UZS)</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="text-[13px] text-muted">
        To‘lov davri
        <select value={value.billing_period} onChange={set('billing_period')} className={`${field} mt-1`}>
          {Object.entries(BILLING_PERIOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[13px] text-muted">
        Keyingi to‘lov sanasi
        <input type="date" value={value.next_payment_on} onChange={set('next_payment_on')} className={`${field} mt-1`} />
      </label>
      <label className="text-[13px] text-muted">
        To‘lov holati
        <select value={value.payment_status} onChange={set('payment_status')} className={`${field} mt-1`}>
          <option value="pending">Kutilmoqda</option>
          <option value="partial">Qisman to‘langan</option>
          <option value="paid">To‘langan</option>
        </select>
      </label>
    </>
  );
}

export function toForm(b: Billing): Record<string, string> {
  return {
    agreed_price: b.agreed_price?.toString() ?? '',
    currency: b.currency,
    billing_period: b.billing_period,
    next_payment_on: b.next_payment_on ?? '',
    next_payment_amount: b.next_payment_amount?.toString() ?? '',
    payment_status: b.payment_status,
    last_paid_on: b.last_paid_on ?? '',
    note: b.note ?? '',
    site_plan_id: b.site_plan_id ?? '',
  };
}

export function fromForm(f: Record<string, string>) {
  return {
    agreed_price: num(f.agreed_price),
    currency: f.currency as 'UZS',
    billing_period: f.billing_period as 'monthly',
    next_payment_on: f.next_payment_on || null,
    next_payment_amount: num(f.next_payment_amount ?? ''),
    payment_status: f.payment_status as 'pending',
    last_paid_on: f.last_paid_on || null,
    note: f.note || null,
    site_plan_id: f.site_plan_id || null,
  };
}

/**
 * The client's money: the tariff (its list price is only a reference), the price agreed with this client (entered by
 * the Rahbar, never copied from the list price), the payment period, the next payment and its status.
 */
export function BillingCard({ clientId, billing, tariffs, canEdit, today }: { clientId: string; billing: Billing | null; tariffs: TariffOption[]; canEdit: boolean; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const b = billing ?? EMPTY_BILLING;
  const [f, setF] = useState(() => toForm(b));
  const tariff = tariffs.find((t) => t.id === b.site_plan_id) ?? null;
  const state = paymentState(b, today);

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveClientBilling(clientId, fromForm(f));
      if (!res.ok) return setError(res.message);
      setEditing(false);
      router.refresh();
    });

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Narx va to‘lov</h2>
        {billing?.agreed_price != null ? (
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
        ) : (
          <Badge>Narx belgilanmagan</Badge>
        )}
      </div>
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <BillingFields value={f} tariffs={tariffs} onChange={setF} />
          <label className="text-[13px] text-muted">
            To‘lov miqdori
            <input inputMode="decimal" value={f.next_payment_amount} onChange={(e) => setF({ ...f, next_payment_amount: e.target.value })} placeholder="Kelishilgan narx bilan bir xil bo‘lsa — bo‘sh" className={`${field} mt-1`} />
          </label>
          <label className="text-[13px] text-muted">
            Oxirgi to‘lov sanasi
            <input type="date" value={f.last_paid_on} onChange={(e) => setF({ ...f, last_paid_on: e.target.value })} className={`${field} mt-1`} />
          </label>
          <label className="text-[13px] text-muted sm:col-span-2">
            Izoh
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} className={`${field} mt-1`} />
          </label>
          {error ? <p className="text-[13px] text-danger sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={pending} onClick={save}>
              Saqlash
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Bekor
            </Button>
          </div>
        </div>
      ) : (
        <>
          <dl className="divide-y divide-line">
            <Row label="Tarif">{tariff ? tariff.name : <span className="font-normal text-subtle">Tanlanmagan</span>}</Row>
            {tariff ? (
              <Row label="Tarifning standart narxi">
                <Money amount={tariff.price} currency={tariff.currency} className="font-normal text-muted" />
              </Row>
            ) : null}
            <Row label="Kelishilgan narx">
              <Money amount={b.agreed_price} currency={b.currency} />
            </Row>
            <Row label="To‘lov davri">{BILLING_PERIOD[b.billing_period] ?? b.billing_period}</Row>
            <Row label="Keyingi to‘lov">{b.next_payment_on ? payDate(b.next_payment_on, today) : <span className="font-normal text-subtle">Belgilanmagan</span>}</Row>
            <Row label="To‘lov miqdori">
              <Money amount={b.next_payment_amount ?? b.agreed_price} currency={b.currency} />
            </Row>
            <Row label="Oxirgi to‘lov">{b.last_paid_on ? payDate(b.last_paid_on, today) : '—'}</Row>
          </dl>
          {tariff?.items.length ? <p className="mt-2 text-[12.5px] text-muted">Tarkibi: {tariff.items.join(' · ')}</p> : null}
          {b.note ? <p className="mt-2 text-[13px] text-muted">{b.note}</p> : null}
          {canEdit ? (
            <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)} icon={<Icon name="edit" size={15} />}>
              {billing ? 'Tahrirlash' : 'Narxni kiritish'}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}
