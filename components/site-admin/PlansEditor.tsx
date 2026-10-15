'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { deletePlan, movePlan, savePlan, setPlanFeatured, setPlanPublished, type PlanItemInput } from '@/lib/actions/site';
import type { ActionState } from '@/lib/actions/state';
import { formatPrice, type SiteCurrency } from '@/lib/site/types';

export type AdminPlan = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency: SiteCurrency;
  price_mode: 'fixed' | 'from' | 'negotiable';
  billing_period: 'monthly' | 'one_time';
  is_featured: boolean;
  is_published: boolean;
  items: { id: string; name: string; quantity: string; note: string }[];
};

type Draft = Omit<AdminPlan, 'id' | 'price' | 'items'> & { id: string | null; price: string; items: (PlanItemInput & { uid: string })[] };

const MODES = [
  { key: 'fixed', label: 'Aniq narx' },
  { key: 'from', label: 'Dan boshlab' },
  { key: 'negotiable', label: 'Kelishiladi' },
] as const;

const PERIODS = [
  { key: 'monthly', label: 'Oylik' },
  { key: 'one_time', label: 'Bir martalik' },
] as const;

let uidCounter = 0;
const uid = () => `i${++uidCounter}`;

export function priceSummary(plan: Pick<AdminPlan, 'price' | 'currency' | 'price_mode' | 'billing_period'>) {
  if (plan.price_mode === 'negotiable' || plan.price === null) return 'Kelishiladi';
  const price = formatPrice(plan.price, plan.currency);
  const period = plan.billing_period === 'monthly' ? ' / oy' : ' · bir martalik';
  return `${plan.price_mode === 'from' ? 'dan boshlab ' : ''}${price}${period}`;
}

function toDraft(plan: AdminPlan | null): Draft {
  if (!plan) {
    return {
      id: null,
      name: '',
      description: '',
      price: '',
      currency: 'UZS',
      price_mode: 'fixed',
      billing_period: 'monthly',
      is_featured: false,
      is_published: true,
      items: [{ uid: uid(), id: null, name: '', quantity: '', note: '' }],
    };
  }
  return {
    ...plan,
    price: plan.price === null ? '' : String(plan.price),
    items: plan.items.map((item) => ({ ...item, uid: uid() })),
  };
}

/** "Sayt › Tariflar": tariffs with their services — create, edit, reorder, feature, hide, delete. */
export function PlansEditor({ plans }: { plans: AdminPlan[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [listError, setListError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};

  const act = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const result = await fn();
      setListError(result.status === 'error' ? result.message : null);
      router.refresh();
    });

  const open = (plan: AdminPlan | null) => {
    setState({ status: 'idle' });
    setDraft(toDraft(plan));
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setItem = (i: number, patch: Partial<PlanItemInput>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } : d));
  const moveItem = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const items = [...d.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return d;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...d, items };
    });

  const save = () =>
    start(async () => {
      if (!draft) return;
      const { id, items, ...values } = draft;
      const result = await savePlan(
        id,
        values,
        items.map(({ id: itemId, name, quantity, note }) => ({ id: itemId ?? null, name, quantity, note })),
      );
      setState(result);
      if (result.status === 'success') {
        setDraft(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Saytdagi “Tariflar” sahifasi va bosh sahifa bloki. Narx o‘rniga “Kelishiladi” ham tanlanadi. Bu ro‘yxat mijozlar obunasidagi ichki
          tariflardan (Mijozlar → Tariflar) alohida.
        </p>
        <Button onClick={() => open(null)} icon={<Icon name="plus" size={16} />}>
          Tarif qo‘shish
        </Button>
      </div>
      {listError ? <Notice tone="danger" title={listError} /> : null}

      {plans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-subtle">
          Hali tarif yo‘q — saytda “Tariflar tez orada e’lon qilinadi” ko‘rinadi.
        </p>
      ) : (
        <Card className="divide-y divide-line p-0">
          {plans.map((plan, i) => (
            <div key={plan.id} className={cn('flex items-center gap-4 px-4 py-3.5', !plan.is_published && 'opacity-60')}>
              <div className="flex flex-col">
                <button type="button" aria-label="Yuqoriga" disabled={pending || i === 0} onClick={() => act(() => movePlan(plan.id, -1))} className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30">
                  <Icon name="chevronDown" size={16} className="rotate-180" />
                </button>
                <button type="button" aria-label="Pastga" disabled={pending || i === plans.length - 1} onClick={() => act(() => movePlan(plan.id, 1))} className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30">
                  <Icon name="chevronDown" size={16} />
                </button>
              </div>
              <button type="button" onClick={() => open(plan)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium">{plan.name}</p>
                <p className="truncate text-sm text-muted">
                  {priceSummary(plan)} · {plan.items.length} ta xizmat
                </p>
              </button>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {plan.is_featured ? <Badge tone="accent">Tavsiya etiladi</Badge> : null}
                {plan.is_published ? <Badge tone="success" dot>Faol</Badge> : <Badge dot>Yashirin</Badge>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  disabled={pending}
                  title={plan.is_featured ? '“Tavsiya etiladi”ni olib tashlash' : '“Tavsiya etiladi” qilish'}
                  aria-label={plan.is_featured ? '“Tavsiya etiladi”ni olib tashlash' : '“Tavsiya etiladi” qilish'}
                  onClick={() => act(() => setPlanFeatured(plan.id, !plan.is_featured))}
                  className={plan.is_featured ? 'text-accent-on-soft' : undefined}
                >
                  <Icon name="award" size={16} />
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => act(() => setPlanPublished(plan.id, !plan.is_published))}>
                  <Icon name={plan.is_published ? 'eyeOff' : 'eye'} size={16} />
                  <span className="hidden lg:inline">{plan.is_published ? 'Yashirish' : 'Faollashtirish'}</span>
                </Button>
                <Button variant="ghost" onClick={() => open(plan)} aria-label="Tahrirlash">
                  <Icon name="edit" size={16} />
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(plan)} aria-label="O‘chirish" className="text-danger">
                  <Icon name="x" size={16} />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={!!draft} onClose={() => !pending && setDraft(null)} title={draft?.id ? 'Tarifni tahrirlash' : 'Yangi tarif'} size="lg">
        {draft ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
            <TextInput id="plan-name" label="Tarif nomi" required maxLength={80} value={draft.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
            <TextArea id="plan-description" label="Qisqa tavsif" maxLength={400} rows={2} value={draft.description} error={errors.description} onChange={(e) => set('description', e.target.value)} />

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[13px] font-medium text-muted">Narx</legend>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <label
                    key={m.key}
                    className={cn(
                      'cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium',
                      draft.price_mode === m.key ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
                    )}
                  >
                    <input type="radio" name="price_mode" value={m.key} checked={draft.price_mode === m.key} onChange={() => set('price_mode', m.key)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
              {draft.price_mode !== 'negotiable' ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                  <TextInput
                    id="plan-price"
                    label={draft.price_mode === 'from' ? 'Boshlang‘ich narx' : 'Narx'}
                    inputMode="decimal"
                    placeholder="5 000 000"
                    value={draft.price}
                    error={errors.price}
                    onChange={(e) => set('price', e.target.value)}
                  />
                  <SelectInput id="plan-currency" label="Valyuta" value={draft.currency} onChange={(e) => set('currency', e.target.value as SiteCurrency)}>
                    <option value="UZS">so‘m (UZS)</option>
                    <option value="USD">$ (USD)</option>
                    <option value="EUR">€ (EUR)</option>
                  </SelectInput>
                </div>
              ) : (
                <p className="text-sm text-muted">Saytda narx o‘rniga “Kelishiladi” chiqadi.</p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium text-muted">To‘lov davri</legend>
                <div className="flex gap-2">
                  {PERIODS.map((p) => (
                    <label
                      key={p.key}
                      className={cn(
                        'cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium',
                        draft.billing_period === p.key ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
                      )}
                    >
                      <input type="radio" name="billing_period" value={p.key} checked={draft.billing_period === p.key} onChange={() => set('billing_period', p.key)} className="sr-only" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.is_featured} onChange={(e) => set('is_featured', e.target.checked)} />
                  Tavsiya etiladi
                </label>
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.is_published} onChange={(e) => set('is_published', e.target.checked)} />
                  Faol (saytda ko‘rinadi)
                </label>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-muted">Tarif tarkibidagi xizmatlar</legend>
              <p className="text-[13px] text-subtle">Masalan: nomi “Reels”, miqdori “oyiga 12 ta”, izoh “ssenariy bilan”. Cheksiz bo‘lsa — “∞” tugmasi.</p>
              {errors.items ? <p className="text-[13px] text-danger">{errors.items}</p> : null}
              <div className="space-y-2">
                {draft.items.map((item, i) => (
                  <div key={item.uid} className="rounded-xl border border-line bg-surface p-3">
                    <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
                      <input
                        aria-label={`${i + 1}-xizmat nomi`}
                        placeholder="Xizmat nomi"
                        maxLength={120}
                        value={item.name}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                        className={cn('h-10 rounded-lg border bg-surface px-3 text-sm outline-none focus:border-accent', errors[`items.${i}.name`] ? 'border-danger' : 'border-line')}
                      />
                      <div className="flex gap-1.5">
                        <input
                          aria-label={`${i + 1}-xizmat miqdori`}
                          placeholder="Miqdori (ixtiyoriy)"
                          maxLength={40}
                          value={item.quantity}
                          onChange={(e) => setItem(i, { quantity: e.target.value })}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          title="Cheksiz (∞)"
                          aria-label={`${i + 1}-xizmat: cheksiz`}
                          aria-pressed={/∞|cheksiz/i.test(item.quantity)}
                          onClick={() => setItem(i, { quantity: /∞|cheksiz/i.test(item.quantity) ? '' : '∞' })}
                          className={cn(
                            'h-10 w-11 shrink-0 rounded-lg border text-[19px] leading-none',
                            /∞|cheksiz/i.test(item.quantity) ? 'border-accent bg-accent-soft text-accent-on-soft' : 'border-line text-muted hover:text-ink',
                          )}
                        >
                          ∞
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        aria-label={`${i + 1}-xizmat izohi`}
                        placeholder="Izoh (ixtiyoriy)"
                        maxLength={160}
                        value={item.note}
                        onChange={(e) => setItem(i, { note: e.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
                      />
                      <Button type="button" variant="ghost" aria-label="Yuqoriga" disabled={i === 0} onClick={() => moveItem(i, -1)}>
                        <Icon name="chevronDown" size={15} className="rotate-180" />
                      </Button>
                      <Button type="button" variant="ghost" aria-label="Pastga" disabled={i === draft.items.length - 1} onClick={() => moveItem(i, 1)}>
                        <Icon name="chevronDown" size={15} />
                      </Button>
                      <Button type="button" variant="ghost" aria-label="Xizmatni o‘chirish" className="text-danger" onClick={() => set('items', draft.items.filter((_, j) => j !== i))}>
                        <Icon name="x" size={15} />
                      </Button>
                    </div>
                    {errors[`items.${i}.name`] ? <p className="mt-1.5 text-[13px] text-danger">{errors[`items.${i}.name`]}</p> : null}
                  </div>
                ))}
              </div>
              {draft.items.length < 30 ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Icon name="plus" size={15} />}
                  onClick={() => set('items', [...draft.items, { uid: uid(), id: null, name: '', quantity: '', note: '' }])}
                >
                  Xizmat qo‘shish
                </Button>
              ) : null}
            </fieldset>

            <div className="flex justify-end gap-3 border-t border-line pt-5">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" loading={pending}>
                Saqlash
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={!!deleting} onClose={() => !pending && setDeleting(null)} title="Tarif o‘chirilsinmi?" description={deleting ? `“${deleting.name}” va uning xizmatlari butunlay o‘chiriladi. Vaqtincha olib qo‘yish uchun “Yashirish”ni bosing.` : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => setDeleting(null)}>
            Bekor qilish
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                if (!deleting) return;
                const result = await deletePlan(deleting.id);
                setListError(result.status === 'error' ? result.message : null);
                setDeleting(null);
                router.refresh();
              })
            }
          >
            O‘chirish
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
