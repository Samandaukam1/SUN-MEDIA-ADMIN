'use client';

import { useActionState } from 'react';

import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateClientRecord } from '@/lib/actions/clients';
import { idle, type ActionState } from '@/lib/actions/state';
import { ClientFields, type ClientValues } from './ClientFields';

export function ClientProfileForm({ id, values, editable }: { id: string; values: ClientValues; editable: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updateClientRecord, idle);
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={!editable} className="disabled:opacity-80">
        <ClientFields values={values} errors={state.status === 'error' ? state.fieldErrors : undefined} withStatus />
      </fieldset>
      {editable ? (
        <div className="flex justify-end">
          <SubmitButton>Saqlash</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
