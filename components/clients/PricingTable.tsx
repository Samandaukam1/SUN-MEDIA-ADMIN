'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { saveClientBilling } from '@/lib/actions/clients';
import { paymentState, type Billing, type TariffOption } from '@/lib/billing';
import { BillingFields, EMPTY_BILLING, fromForm, toForm } from './BillingCard';
import { Money } from './Money';

type Row = { id: string; name: string; active: boolean; billing: Billing | null };

function PriceRow({ row, tariffs, today, canEdit }: { row: Row; tariffs: TariffOption[]; today: string; canEdit: boolean }) {
  const router = useRouter();
  const initial = toForm(row.billing ?? EMPTY_BILLING);
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const tariff = tariffs.find((t) => t.id === f.site_plan_id);
  const state = row.billing?.agreed_price != null ? paymentState(row.billing, today) : null;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/clients/${row.id}`} className="text-[15px] font-semibold hover:underline">
          {row.name}
        </Link>
        {!row.active ? <Badge>Nofaol</Badge> : null}
        {state ? <Badge tone={state.tone}>{state.label}</Badge> : <Badge>Narx belgilanmagan</Badge>}
        <span className="ml-auto text-[13px] text-muted">
          Hozir: <Money amount={row.billing?.agreed_price} currency={row.billing?.currency} />
        </span>
      </div>
      {canEdit ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <BillingFields value={f} tariffs={tariffs} onChange={setF} />
          </div>
          {tariff ? (
            <p className="text-[12.5px] text-muted">
              {tariff.name} tarifining standart narxi: <Money amount={tariff.price} currency={tariff.currency} /> — kelishilgan narx alohida kiritiladi.
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              disabled={!dirty}
              loading={pending}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  const res = await saveClientBilling(row.id, fromForm(f));
                  setMsg(res.ok ? { ok: true, text: 'Saqlandi.' } : { ok: false, text: res.message });
                  if (res.ok) router.refresh();
                })
              }
            >
              Saqlash
            </Button>
            {msg ? <span className={`text-[13px] ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span> : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** Every client's tariff and agreed price in one place (Rahbar): type, save, next. */
export function PricingTable({ rows, tariffs, today, canEdit }: { rows: Row[]; tariffs: TariffOption[]; today: string; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <PriceRow key={r.id} row={r} tariffs={tariffs} today={today} canEdit={canEdit} />
      ))}
    </div>
  );
}
