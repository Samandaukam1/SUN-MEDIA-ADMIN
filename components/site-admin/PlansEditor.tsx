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
import { CONTENT_TYPE } from '@/lib/labels';
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
  items: { id: string; name: string; quantity: string; note: string; service_key: string | null }[];
};

/** A system service a tariff line can be (Reels, Postlar, Video kontent, ...). */
export type ServiceOption = { key: string; name: string; unit: string; is_quantitative: boolean; content_types: string[]; is_active: boolean };

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

/** Lines are matched by name the way the database does it: apostrophes, case and extra spaces do not matter. */
const lineName = (s: string) => s.replace(/[‘’ʻʼ`']/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The service a line without a chosen one gets: the one the same line has in another tariff, else the one with its name. */
function guessService(name: string, plans: AdminPlan[], services: ServiceOption[]): ServiceOption | null {
  const n = lineName(name);
  if (!n) return null;
  const byKey = new Map(services.map((s) => [s.key, s]));
  for (const plan of plans) {
    for (const item of plan.items) {
      const s = item.service_key ? byKey.get(item.service_key) : undefined;
      if (s?.is_active && lineName(item.name) === n) return s;
    }
  }
  return services.find((s) => s.is_active && lineName(s.name) === n) ?? null;
}

function countingHint(s: ServiceOption | null, lineTyped: boolean): string {
  if (!s) return lineTyped ? 'Tizimda shu nomli yangi xizmat ochiladi, bajarilgani qo‘lda belgilanadi.' : '';
  if (s.content_types.length) {
    return `Mijozga ${s.content_types.map((t) => CONTENT_TYPE[t as keyof typeof CONTENT_TYPE] ?? t).join(', ')} joylanganda limitdan o‘zi ayiriladi.`;
  }
  return s.is_quantitative ? 'Bajarilgani mijozning Tarif bo‘limida qo‘lda belgilanadi.' : 'Tarifga kiradi, soni sanalmaydi.';
}

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
      items: [{ uid: uid(), id: null, name: '', quantity: '', note: '', service_key: '' }],
    };
  }
  return {
    ...plan,
    price: plan.price === null ? '' : String(plan.price),
    items: plan.items.map((item) => ({ ...item, service_key: item.service_key ?? '', uid: uid() })),
  };
}

/**
 * "Sayt › Tariflar": tariffs with their services — create, edit, reorder, feature, hide, delete. Each tariff is also the
 * system tariff (Mijozlar › Tariflar): the database mirrors it, and each line names the system service it counts as.
 */
export function PlansEditor({ plans, services, startNew = false }: { plans: AdminPlan[]; services: ServiceOption[]; startNew?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(() => (startNew ? toDraft(null) : null));
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
      // One service once per tariff — the database refuses it too, here the line is pointed out.
      const keys = items.map((it) => it.service_key || guessService(it.name, plans, services)?.key || (it.name.trim() ? `new:${lineName(it.name)}` : ''));
      const duplicates: Record<string, string> = {};
      keys.forEach((k, i) => {
        if (k && keys.indexOf(k) < i) duplicates[`items.${i}.service_key`] = 'Bu xizmat shu tarifda allaqachon bor — boshqasini tanlang.';
      });
      if (Object.keys(duplicates).length) {
        setState({ status: 'error', message: 'Bitta xizmat tarifda ikki marta bo‘lmaydi.', fieldErrors: duplicates });
        return;
      }
      const result = await savePlan(
        id,
        values,
        items.map(({ id: itemId, name, quantity, note, service_key }) => ({ id: itemId ?? null, name, quantity, note, service_key })),
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
          Saytdagi “Tariflar” sahifasi va bosh sahifa bloki. Shu yerdagi har bir tarif tizimda ham o‘sha tarif: Mijozlar → Tariflar, mijozga
          biriktirish, kabinet va ilovadagi limitlar shu tarkib bo‘yicha ishlaydi — tarif ikki marta kiritilmaydi. Yashirilgan tarif yangi
          mijozga biriktirilmaydi.
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

            <fieldset className="min-w-0 space-y-2">
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
                    <ServiceSelect
                      id={`plan-item-service-${item.uid}`}
                      item={item}
                      plans={plans}
                      services={services}
                      error={errors[`items.${i}.service_key`]}
                      onChange={(service_key) => setItem(i, { service_key })}
                    />
                  </div>
                ))}
              </div>
              {draft.items.length < 30 ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Icon name="plus" size={15} />}
                  onClick={() => set('items', [...draft.items, { uid: uid(), id: null, name: '', quantity: '', note: '', service_key: '' }])}
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

      <Dialog open={!!deleting} onClose={() => !pending && setDeleting(null)} title="Tarif o‘chirilsinmi?" description={
          deleting
            ? `“${deleting.name}” saytdan ham, tizimdagi tariflar ro‘yxatidan ham olib tashlanadi. Shu tarifdagi mijozlarning joriy davri saqlanadi. Vaqtincha olib qo‘yish uchun “Yashirish”ni bosing.`
            : undefined
        }>
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

/** "Tizimda": which system service a line is, and how the system counts it. */
function ServiceSelect({
  id,
  item,
  plans,
  services,
  error,
  onChange,
}: {
  id: string;
  item: PlanItemInput;
  plans: AdminPlan[];
  services: ServiceOption[];
  error?: string;
  onChange: (serviceKey: string) => void;
}) {
  const chosen = item.service_key ? (services.find((s) => s.key === item.service_key) ?? null) : null;
  const guess = item.service_key ? null : guessService(item.name, plans, services);
  const typed = item.name.trim();
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-[12.5px] font-medium text-muted">
          Tizimda
        </label>
        <select
          id={id}
          value={item.service_key}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-9 min-w-0 flex-1 rounded-lg border bg-surface px-2.5 text-[13px] outline-none focus:border-accent',
            error ? 'border-danger' : 'border-line',
          )}
        >
          <option value="">{guess ? `Avtomatik: ${guess.name}` : typed ? `Yangi xizmat: “${typed}”` : 'Avtomatik (nomi bo‘yicha)'}</option>
          {services
            .filter((s) => s.is_active || s.key === item.service_key)
            .map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
        </select>
      </div>
      <p className="mt-1 text-[12px] text-subtle">{countingHint(chosen ?? guess, !!typed)}</p>
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
