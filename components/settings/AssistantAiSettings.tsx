'use client';

import { useActionState } from 'react';

import { TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveAssistantSettings } from '@/lib/actions/assistant';
import { idle, type ActionState } from '@/lib/actions/state';

export type ModelUse = { model: string; requests: number; input: number; output: number; cached: number; thoughts: number; cost: number | null; unpriced: number };
type Price = { input?: number; output?: number; cached?: number };
type Props = {
  limits: { member: number; public: number };
  budget: number;
  pricing: Record<string, Price>;
  today: ModelUse[];
  month: ModelUse[];
};

// The same on the server and in the browser (locale formatting differs between them and breaks hydration).
const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;

function Usage({ title, rows }: { title: string; rows: ModelUse[] }) {
  const total = rows.reduce((s, r) => ({ requests: s.requests + r.requests, input: s.input + r.input, output: s.output + r.output + r.thoughts, cost: s.cost + (r.cost ?? 0), unpriced: s.unpriced + r.unpriced }), { requests: 0, input: 0, output: 0, cost: 0, unpriced: 0 });
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">
        {n(total.requests)} ta AI so‘rovi · {n(total.input)} kirish va {n(total.output)} chiqish tokeni ·{' '}
        {total.unpriced === total.requests && total.requests ? 'xarajat: narx belgilanmagan' : `taxminiy xarajat ${usd(total.cost)}${total.unpriced ? ` (+${n(total.unpriced)} ta narxsiz so‘rov)` : ''}`}
      </p>
      {rows.length ? (
        <ul className="mt-3 space-y-1 text-[13px] text-muted">
          {rows.map((r) => (
            <li key={r.model}>
              <span className="font-medium text-ink">{r.model}</span>: {n(r.requests)} so‘rov, {n(r.input)} / {n(r.output + r.thoughts)} token{r.cached ? `, ${n(r.cached)} keshdan` : ''}
              {r.cost !== null && r.unpriced < r.requests ? ` — ${usd(r.cost)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Sozlamalar → Sunny AI: real token use as the provider reported it, the limits, the monthly cap and model prices. */
export function AssistantAiSettings({ limits, budget, pricing, today, month }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(saveAssistantSettings, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const models = [...new Set([...month.map((m) => m.model), ...Object.keys(pricing)])].sort();
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Usage title="Bugun" rows={today} />
        <Usage title="Bu oy" rows={month} />
      </div>
      <section className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <TextInput label="Xodim/hamkor: kunlik savol" name="daily_limit_member" type="number" min={0} max={10000} defaultValue={limits.member} error={errors.daily_limit_member} />
        <TextInput label="Sayt mehmoni: kunlik savol" name="daily_limit_public" type="number" min={0} max={10000} defaultValue={limits.public} error={errors.daily_limit_public} />
        <TextInput label="Oylik chegara, USD (0 — yo‘q)" name="monthly_budget_usd" type="number" min={0} step="0.01" defaultValue={budget} error={errors.monthly_budget_usd} />
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold">Model narxlari (1 mln token uchun, USD)</h3>
        <p className="mb-3 max-w-2xl text-sm text-muted">
          Provayderning o‘z narx sahifasidagi qiymatni kiriting. Bepul tarifda 0 yozing. Narxi bo‘sh model faqat tokenlarda hisoblanadi — Sunny narxni o‘zi taxmin qilmaydi.
        </p>
        {models.length ? (
          <div className="space-y-3">
            {models.map((m) => (
              <fieldset key={m} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,8rem)]">
                <input type="hidden" name="model" value={m} />
                <legend className="sr-only">{m}</legend>
                <p className="truncate text-sm font-medium sm:pb-2.5">{m}</p>
                <TextInput label="Kirish" name={`input:${m}`} type="number" min={0} step="0.0001" defaultValue={pricing[m]?.input ?? ''} />
                <TextInput label="Chiqish" name={`output:${m}`} type="number" min={0} step="0.0001" defaultValue={pricing[m]?.output ?? ''} />
                <TextInput label="Kesh" name={`cached:${m}`} type="number" min={0} step="0.0001" defaultValue={pricing[m]?.cached ?? ''} />
              </fieldset>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Hali AI so‘rovi qayd etilmagan — birinchi suhbatdan keyin modellar shu yerda chiqadi.</p>
        )}
      </section>
      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
