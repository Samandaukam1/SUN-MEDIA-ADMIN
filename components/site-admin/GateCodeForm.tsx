'use client';

import { useActionState, useEffect, useRef } from 'react';

import { TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { changeGateCode } from '@/lib/actions/site';
import { idle } from '@/lib/actions/state';

/** Tizim egasi sets a new 6-digit footer code; the old one stops working at once. */
export function GateCodeForm() {
  const [state, action] = useActionState(changeGateCode, idle);
  const form = useRef<HTMLFormElement>(null);
  const err = (key: string) => (state.status === 'error' ? state.fieldErrors?.[key] : undefined);
  useEffect(() => {
    if (state.status === 'success') form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-4" autoComplete="off">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi'} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          name="code"
          label="Yangi kod"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoComplete="new-password"
          error={err('code')}
          hint="Aynan 6 ta raqam"
        />
        <TextInput name="confirm" label="Kodni takrorlang" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="new-password" error={err('confirm')} />
      </div>
      <SubmitButton>Kodni almashtirish</SubmitButton>
    </form>
  );
}
