'use client';

import { useActionState } from 'react';

import { TextArea } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { sendCrmReportAction } from '@/lib/actions/crm';
import { idle } from '@/lib/actions/state';

/** Sends exactly the previewed report; the client gets a notification and keeps it in "Hisobotlar". */
export function SendReportForm({ clientId, kind, from, to, clientName }: { clientId: string; kind: string; from: string; to: string; clientName: string }) {
  const [state, action] = useActionState(sendCrmReportAction, idle);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      <TextArea label="Izoh (ixtiyoriy)" name="note" maxLength={1000} rows={3} placeholder="Masalan: yangi kampaniya 3-kundan boshlandi" />
      <SubmitButton>{`${clientName}’ga yuborish`}</SubmitButton>
    </form>
  );
}
