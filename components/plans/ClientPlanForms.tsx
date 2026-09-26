'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { assignPlan, handleUpgradeRequest, recordUsage } from '@/lib/actions/plans';
import { idle, type ActionState } from '@/lib/actions/state';

function Feedback({ state }: { state: ActionState }) {
  if (state.status === 'error') return <Notice tone="danger" title={state.message} />;
  if (state.status === 'success') return <Notice tone="success" title={state.message ?? 'Saqlandi'} />;
  return null;
}

export function AssignPlanForm({ clientId, plans, today }: { clientId: string; plans: { id: string; label: string }[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(assignPlan, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      <SelectInput label="Tarif" name="plan_id" required error={errors.plan_id} defaultValue="">
        <option value="" disabled>
          Tanlang
        </option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </SelectInput>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Boshlanish sanasi" name="starts_on" type="date" defaultValue={today} required error={errors.starts_on} />
        <TextInput label="Narx (ixtiyoriy)" name="price" type="number" min={0} step={1000} error={errors.price} hint="Bo‘sh bo‘lsa tarif narxi" />
      </div>
      <TextInput label="Izoh" name="notes" maxLength={500} placeholder="Masalan: 10% chegirma bilan" />
      <p className="text-[13px] text-muted">Joriy davr shu sanadan bir kun oldin yopiladi. Yangi davrdagi foydalanish yangi tarifga o‘tadi.</p>
      <div className="flex justify-end">
        <SubmitButton>Tarifni biriktirish</SubmitButton>
      </div>
    </form>
  );
}

export function UpgradeDecision({ clientId, requestId, planName, today }: { clientId: string; requestId: string; planName: string; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(handleUpgradeRequest, idle);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  if (state.status === 'success') return <Feedback state={state} />;
  return (
    <div className="space-y-4">
      <Feedback state={state} />
      {mode === null ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setMode('approve')}>
            {`Tasdiqlash — ${planName}`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('reject')}>
            Rad etish
          </Button>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="decision" value={mode} />
          {mode === 'approve' ? <TextInput label="Yangi tarif qachondan" name="starts_on" type="date" defaultValue={today} required /> : null}
          <TextArea
            label={mode === 'approve' ? 'Mijozga izoh (ixtiyoriy)' : 'Rad etish sababi'}
            name="response"
            rows={3}
            required={mode === 'reject'}
            error={errors.response}
            placeholder={mode === 'approve' ? 'Masalan: 1-oktabrdan Premium faollashadi' : 'Masalan: joriy oy yakunida o‘tkazamiz'}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Orqaga
            </Button>
            <SubmitButton>{mode === 'approve' ? 'Tasdiqlash' : 'Rad etish'}</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

export function UsageForm({ clientId, services, today }: { clientId: string; services: { key: string; name: string }[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(recordUsage, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectInput label="Xizmat" name="service_key" required error={errors.service_key} defaultValue="">
          <option value="" disabled>
            Tanlang
          </option>
          {services.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </SelectInput>
        <TextInput label="Miqdor (+/−)" name="quantity" type="number" step={1} required error={errors.quantity} hint="Qaytarish uchun manfiy" />
        <TextInput label="Sana" name="occurred_on" type="date" defaultValue={today} required error={errors.occurred_on} />
      </div>
      <TextInput label="Izoh" name="note" required maxLength={300} error={errors.note} placeholder="Masalan: qo‘shimcha 2 ta stories" />
      <div className="flex justify-end">
        <SubmitButton>Yozish</SubmitButton>
      </div>
    </form>
  );
}
