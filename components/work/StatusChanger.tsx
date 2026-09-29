'use client';

import { useActionState } from 'react';

import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idle, type ActionState } from '@/lib/actions/state';

/** Move content to one of the next allowed stages (the database decides which ones). */
export function StatusChanger({ action, options }: { action: (s: ActionState, d: FormData) => Promise<ActionState>; options: { value: string; label: string }[] }) {
  const [state, formAction] = useActionState(action, idle);
  if (!options.length) return <p className="text-sm text-muted">Bu bosqichdan hozir boshqa holatga o‘tib bo‘lmaydi.</p>;
  return (
    <form action={formAction} className="space-y-3">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi'} /> : null}
      <SelectInput label="Keyingi holat" name="status" required defaultValue="">
        <option value="" disabled>
          Tanlang
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectInput>
      <TextInput label="Izoh (ixtiyoriy)" name="note" maxLength={500} />
      <SubmitButton variant="secondary" className="w-full">
        Holatni o‘zgartirish
      </SubmitButton>
    </form>
  );
}
