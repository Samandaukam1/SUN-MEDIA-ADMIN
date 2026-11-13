'use client';

import { useActionState } from 'react';

import { Checkbox, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveAssistantSettings } from '@/lib/actions/assistant';
import { idle, type ActionState } from '@/lib/actions/state';
import type { SunnyConfig } from '@/lib/assistant/sunny';

export type ModelUse = { model: string; requests: number; input: number; output: number; cached: number; thoughts: number; cost: number | null; unpriced: number };
type Price = { input?: number; output?: number; cached?: number };
/** P50 / P95 of real replies over 7 days, per path (local = no AI call) and model; milliseconds. */
export type Speed = { path: string; model: string; replies: number; failed: number; stopped: number; firstP50: number | null; firstP95: number | null; totalP50: number | null; totalP95: number | null; prepP50: number | null; toolP50: number | null };
type ModelState = { role: string; model: string; ok: boolean; message: string };
type Props = {
  limits: { member: number; public: number };
  budget: number;
  pricing: Record<string, Price>;
  today: ModelUse[];
  month: ModelUse[];
  config: SunnyConfig;
  speed: Speed[];
  models: ModelState[];
  checkedAt: string | null;
};

const sec = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const PATH: Record<string, string> = { local: 'AI’siz (salom, aniq buyruq)', primary: 'Kundalik model', complex: 'Murakkab so‘rov' };

function SpeedTable({ rows }: { rows: Speed[] }) {
  if (!rows.length) return <p className="text-sm text-muted">Hali o‘lchov yo‘q — birinchi suhbatlardan keyin shu yerda chiqadi.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-[13px]">
        <thead className="text-muted">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Yo‘l / model</th>
            <th className="py-1.5 pr-3 font-medium">Javoblar</th>
            <th className="py-1.5 pr-3 font-medium">Birinchi so‘z P50 / P95</th>
            <th className="py-1.5 pr-3 font-medium">To‘liq javob P50 / P95</th>
            <th className="py-1.5 pr-3 font-medium">Tayyorlov / asboblar P50</th>
            <th className="py-1.5 font-medium">Xato / to‘xtatilgan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.path}:${r.model}`} className="border-t border-line">
              <td className="py-1.5 pr-3">
                <span className="font-medium text-ink">{PATH[r.path] ?? r.path}</span>
                {r.model !== '—' ? <span className="text-muted"> · {r.model}</span> : null}
              </td>
              <td className="py-1.5 pr-3">{n(r.replies)}</td>
              <td className="py-1.5 pr-3">
                {sec(r.firstP50)} / {sec(r.firstP95)}
              </td>
              <td className="py-1.5 pr-3">
                {sec(r.totalP50)} / {sec(r.totalP95)}
              </td>
              <td className="py-1.5 pr-3">
                {sec(r.prepP50)} / {sec(r.toolP50)}
              </td>
              <td className="py-1.5">
                {n(r.failed)} / {n(r.stopped)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
export function AssistantAiSettings({ limits, budget, pricing, today, month, config, speed, models: status, checkedAt }: Props) {
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
      <section className="rounded-2xl border border-line p-4">
        <p className="mb-2 text-sm font-semibold">Tezlik (oxirgi 7 kun, haqiqiy o‘lchov)</p>
        <SpeedTable rows={speed} />
      </section>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Modellar (OpenAI)</h3>
        <div className="flex flex-wrap gap-6">
          <Checkbox name="enabled" label="AI javoblari yoqilgan" description="O‘chirilsa ham salomlashish va aniq buyruqlar ishlaydi." defaultChecked={config.enabled} />
          <Checkbox name="escalation" label="Murakkab so‘rovlarga kuchli model" description="Tahlil, solishtirish, reja tuzish — faqat shularda." defaultChecked={config.escalation} />
        </div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <TextInput label="Kundalik model" name="primary" defaultValue={config.primary} error={errors.primary} hint="Salom, vazifalar, davomat, oddiy savollar" />
          <TextInput label="Murakkab so‘rovlar modeli" name="complex" defaultValue={config.complex} error={errors.complex} hint="Mavjud bo‘lmasa, kundalik model javob beradi" />
        </div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-4">
          <TextInput label="Javob, token" name="max_output" type="number" min={64} max={4000} defaultValue={config.maxOutput} error={errors.max_output} />
          <TextInput label="Ma’lumotli javob, token" name="max_output_data" type="number" min={64} max={4000} defaultValue={config.maxOutputData} error={errors.max_output_data} />
          <TextInput label="Suhbat tarixi, xabar" name="max_history" type="number" min={2} max={40} defaultValue={config.maxHistory} error={errors.max_history} />
          <TextInput label="So‘rov chegarasi, token" name="max_input_tokens" type="number" min={2000} max={200000} defaultValue={config.maxInputTokens} error={errors.max_input_tokens} />
        </div>
        {status.length ? (
          <ul className="space-y-1 text-[13px]">
            {status.map((m) => (
              <li key={`${m.role}:${m.model}`} className={m.ok ? 'text-muted' : 'text-danger'}>
                {m.ok ? '✓' : '✕'} {m.role}: <span className="font-medium text-ink">{m.model}</span> — {m.message}
              </li>
            ))}
            {checkedAt ? <li className="text-muted">Tekshirildi: {checkedAt.replace('T', ' ').slice(0, 16)} (UTC)</li> : null}
          </ul>
        ) : (
          <p className="text-sm text-muted">Modellar mavjudligini server har 6 soatda tekshiradi — natija shu yerda chiqadi.</p>
        )}
      </section>
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
