'use client';

import { useActionState } from 'react';

import { TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateMyProfile } from '@/lib/actions/accounts';
import { idle, type ActionState } from '@/lib/actions/state';

export function MyProfileForm({ firstName, lastName, phone }: { firstName: string; lastName: string; phone: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(updateMyProfile, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi.'} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Ism" name="first_name" required defaultValue={firstName} error={errors.first_name} maxLength={60} />
        <TextInput label="Familiya" name="last_name" required defaultValue={lastName} error={errors.last_name} maxLength={60} />
      </div>
      <TextInput label="Telefon" name="phone" type="tel" defaultValue={phone ?? ''} placeholder="+998 90 123 45 67" error={errors.phone} />
      <div className="flex justify-end">
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
