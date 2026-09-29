'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { endSubscription, grantPlan, savePlanFeature, savePlanPrice } from '@/lib/actions/pro';
import { idle, type ActionState } from '@/lib/actions/state';

export function GrantPlanForm({ workspaces, plans }: { workspaces: { id: string; name: string }[]; plans: { key: string; name: string }[] }) {
  const [state, action] = useActionState(grantPlan, idle);
  return (
    <form action={action} className="grid items-end gap-4 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
      <SelectInput label="Workspace" name="workspace_id" required defaultValue="">
        <option value="" disabled>
          Tanlang
        </option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </SelectInput>
      <SelectInput label="Tarif" name="plan_key" defaultValue="pro">
        {plans.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name}
          </option>
        ))}
      </SelectInput>
      <TextInput label="Kun (bo‘sh = muddatsiz)" name="days" type="number" min={1} max={3650} placeholder="30" />
      <TextInput label="Izoh" name="note" maxLength={500} placeholder="Masalan: hamkor agentlik" />
      <SubmitButton>Berish</SubmitButton>
      {state.status === 'error' ? <div className="md:col-span-5"><Notice tone="danger" title={state.message} /></div> : null}
      {state.status === 'success' ? <div className="md:col-span-5"><Notice tone="success" title={state.message ?? 'Saqlandi'} /></div> : null}
    </form>
  );
}

export function EndSubscriptionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="md" variant="ghost" loading={pending} onClick={() => window.confirm('Obuna to‘xtatilsinmi?') && start(async () => setState(await endSubscription(id)))}>
        To‘xtatish
      </Button>
      {state?.status === 'error' ? <span className="text-[13px] text-danger">{state.message}</span> : null}
    </span>
  );
}

/** One cell of the plan matrix: a flag (on/off) or a limit (number; empty = unlimited). */
export function FeatureCell({ planKey, featureKey, kind, enabled, limit }: { planKey: string; featureKey: string; kind: 'flag' | 'limit'; enabled: boolean; limit: number | null }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [value, setValue] = useState(limit == null ? '' : String(limit));
  const [error, setError] = useState<string | null>(null);
  const save = (nextOn: boolean, nextValue: string) =>
    start(async () => {
      const r = await savePlanFeature(planKey, featureKey, nextOn, nextValue === '' ? null : Number(nextValue));
      setError(r.status === 'error' ? r.message : null);
    });
  if (kind === 'flag') {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={() => {
            setOn(!on);
            save(!on, value);
          }}
        />
        {on ? 'Bor' : 'Yo‘q'}
        {error ? <span className="text-danger">!</span> : null}
      </label>
    );
  }
  return (
    <input
      type="number"
      min={0}
      value={value}
      placeholder="∞"
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => save(true, value)}
      aria-label={`${featureKey} ${planKey}`}
      className="h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm tabular"
    />
  );
}

export function PriceInput({ planKey, cents }: { planKey: string; cents: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState((cents / 100).toFixed(2));
  return (
    <input
      type="number"
      step="0.01"
      min={0}
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => start(async () => void (await savePlanPrice(planKey, Math.round(Number(value) * 100))))}
      aria-label={`${planKey} narxi`}
      className="h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm tabular"
    />
  );
}
