'use client';

import { useActionState, useTransition } from 'react';

import { Icon } from '@/components/ui/Icon';
import { SelectInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { assignTeamMember, removeTeamMember } from '@/lib/actions/clients';
import { idle, type ActionState } from '@/lib/actions/state';
import { TEAM_ROLE_LABEL } from '@/lib/labels';

export function TeamAssignForm({ clientId, staff }: { clientId: string; staff: { id: string; name: string; hint?: string | null }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(assignTeamMember, idle);
  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectInput label="Xodim" name="user_id" defaultValue="">
          <option value="" disabled>
            Xodimni tanlang
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.hint ? ` — ${s.hint}` : ''}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Loyihadagi roli" name="team_role" defaultValue="account_manager">
          {Object.entries(TEAM_ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectInput>
        <SubmitButton>Biriktirish</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveTeamMember({ clientId, userId, teamRole }: { clientId: string; userId: string; teamRole: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await removeTeamMember(clientId, userId, teamRole)))}
      aria-label="Jamoadan chiqarish"
      className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-50"
    >
      <Icon name="x" size={16} />
    </button>
  );
}
