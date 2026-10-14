'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { BILLING_PERIOD, payDate, paymentState, type Billing } from '@/lib/billing';
import { Money } from './Money';

export type ClientRow = {
  id: string;
  name: string;
  code: string;
  industry: string | null;
  logo: string | null;
  active: boolean;
  statusLabel: string;
  statusTone: BadgeTone;
  contact: string | null;
  phone: string | null;
  plan: string | null;
  team: string[];
  contents: number;
  billing: Billing | null;
};

type Filter = 'all' | 'active' | 'inactive';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Barchasi' },
  { key: 'active', label: 'Faol' },
  { key: 'inactive', label: 'Nofaol' },
];

/** The client list as a CRM: filters apply on click, search as you type — no "apply" button, no reload. */
export function ClientsBoard({ rows, initial, today, finance }: { rows: ClientRow[]; initial: Filter; today: string; finance: boolean }) {
  const [filter, setFilter] = useState<Filter>(initial);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => filter === 'all' || (filter === 'active' ? r.active : !r.active))
      .filter((r) => !needle || `${r.name} ${r.code} ${r.industry ?? ''} ${r.contact ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(needle));
  }, [rows, filter, q]);
  const count = (f: Filter) => rows.filter((r) => f === 'all' || (f === 'active' ? r.active : !r.active)).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Holat" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn('h-8 rounded-lg px-3.5 text-sm font-medium transition-colors', filter === f.key ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink')}
            >
              {f.label} <span className="opacity-60">{count(f.key)}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Qidirish</span>
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nomi, kodi, mas’ul shaxs yoki telefon"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">{rows.length ? 'Filtrga mos mijoz topilmadi.' : 'Hali mijoz qo‘shilmagan.'}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const pay = c.billing ? paymentState(c.billing, today) : null;
            return (
              <Link key={c.id} href={`/clients/${c.id}`} className="block">
                <Card className="flex h-full flex-col gap-4 transition-colors hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} url={c.logo} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="truncate text-[13px] text-muted">{[c.contact, c.phone].filter(Boolean).join(' · ') || [c.code, c.industry].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Badge tone={c.statusTone} dot>
                      {c.statusLabel}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-4 text-[13px]">
                    <div>
                      <dt className="text-[11px] tracking-[0.06em] text-subtle uppercase">Tarif</dt>
                      <dd className="mt-0.5 truncate font-semibold">{c.plan ?? <span className="font-normal text-subtle">Tanlanmagan</span>}</dd>
                    </div>
                    {finance ? (
                      <div>
                        <dt className="text-[11px] tracking-[0.06em] text-subtle uppercase">Kelishilgan narx</dt>
                        <dd className="mt-0.5 font-semibold">
                          <Money amount={c.billing?.agreed_price} currency={c.billing?.currency} />
                        </dd>
                      </div>
                    ) : (
                      <div>
                        <dt className="text-[11px] tracking-[0.06em] text-subtle uppercase">Kontentlar</dt>
                        <dd className="mt-0.5 font-semibold">{c.contents}</dd>
                      </div>
                    )}
                    {finance ? (
                      <div className="col-span-2 flex items-center justify-between gap-2">
                        <span className="text-muted">
                          Keyingi to‘lov: <span className="font-semibold text-ink">{c.billing?.next_payment_on ? payDate(c.billing.next_payment_on, today) : 'Belgilanmagan'}</span>
                          {c.billing ? ` · ${BILLING_PERIOD[c.billing.billing_period] ?? ''}` : ''}
                        </span>
                        {pay && c.billing?.agreed_price != null ? <Badge tone={pay.tone}>{pay.label}</Badge> : null}
                      </div>
                    ) : null}
                    <div className="col-span-2 truncate text-muted">
                      Mas’ul: <span className="text-ink">{c.team.join(', ') || '—'}</span>
                      {finance ? ` · ${c.contents} kontent` : ''}
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
