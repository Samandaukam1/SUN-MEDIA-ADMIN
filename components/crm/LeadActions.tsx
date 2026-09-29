'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { deliverLeadsAction, discardLeadAction, restoreLeadAction } from '@/lib/actions/crm';
import type { ActionState } from '@/lib/actions/state';

function Result({ state }: { state: ActionState | null }) {
  if (!state || state.status === 'idle') return null;
  return <span className={state.status === 'error' ? 'text-[13px] text-danger' : 'text-[13px] text-success'}>{state.status === 'error' ? state.message : state.message}</span>;
}

/** "27 ta lidni SAFI’ga yuborish" — every ready lead of one client, after a confirmation. */
export function DeliverAllButton({ clientId, clientName, ready }: { clientId: string; clientName: string; ready: number }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        icon={<Icon name="send" size={16} />}
        loading={pending}
        onClick={() => {
          if (!window.confirm(`${ready} ta lidni ${clientName}’ga yuborasizmi? Mijoz ularni darhol ko‘radi va xabar oladi.`)) return;
          start(async () => setState(await deliverLeadsAction(clientId)));
        }}
      >
        {`${ready} ta lidni ${clientName}’ga yuborish`}
      </Button>
      <Result state={state} />
    </div>
  );
}

/** Row actions: send one lead, set it aside (spam / test), or bring it back. */
export function LeadRowActions({ leadId, clientId, status, ready }: { leadId: string; clientId: string; status: 'pending' | 'delivered' | 'discarded'; ready: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  if (status === 'delivered') return null;
  return (
    <div className="relative z-10 flex flex-wrap items-center justify-end gap-2">
      {status === 'pending' && ready ? (
        <Button size="md" loading={pending} onClick={() => start(async () => setState(await deliverLeadsAction(clientId, [leadId])))}>
          Yuborish
        </Button>
      ) : null}
      {status === 'pending' ? (
        <Button
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm('Lidni chiqarib tashlaysizmi? Mijoz uni ko‘rmaydi.')) start(async () => setState(await discardLeadAction(leadId)));
          }}
        >
          Chiqarish
        </Button>
      ) : null}
      {status === 'discarded' ? (
        <Button size="md" variant="secondary" loading={pending} onClick={() => start(async () => setState(await restoreLeadAction(leadId)))}>
          Qaytarish
        </Button>
      ) : null}
      <Result state={state?.status === 'error' ? state : null} />
    </div>
  );
}
