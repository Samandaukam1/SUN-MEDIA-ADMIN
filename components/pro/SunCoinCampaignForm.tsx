'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Notice';
import { idle, type ActionState } from '@/lib/actions/state';
import { setSunCoinCampaignStatus } from '@/lib/actions/sun-coin';
import type { CoinCampaignStatus } from '@/lib/schemas/sun-coin';

export function SunCoinRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="secondary" loading={pending} onClick={() => start(() => router.refresh())}>Analitikani yangilash</Button>;
}

/** Legacy SUN Coin campaigns no longer pay SAFI rounds; a manager can still close one for good. */
export function SunCoinCampaignActions({ id, status, title, endOnly = false }: { id: string; status: CoinCampaignStatus; title: string; endOnly?: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const transition = (nextStatus: 'active' | 'paused' | 'ended') => start(async () => {
    const result = await setSunCoinCampaignStatus(id, nextStatus);
    setState(result);
    if (result.status === 'success') setConfirmEnd(false);
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!endOnly && status === 'active' ? <Button variant="secondary" loading={pending} onClick={() => transition('paused')}>PAUSE — OFF</Button> : null}
        {!endOnly && (status === 'paused' || status === 'draft') ? <Button loading={pending} onClick={() => transition('active')}>{status === 'draft' ? 'START CAMPAIGN — ON' : 'RESUME — ON'}</Button> : null}
        {status === 'active' || status === 'paused' ? <Button variant="danger" disabled={pending} onClick={() => setConfirmEnd(true)}>END CAMPAIGN</Button> : null}
      </div>
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <Dialog open={confirmEnd} onClose={() => { if (!pending) setConfirmEnd(false); }} title="Kampaniyani tugatish" description={`${title} tugatilgach qayta ishga tushirilmaydi. Barcha mukofotlar va tarix saqlanadi.`}>
        {state.status === 'error' ? <div className="mb-4"><Notice tone="danger" title={state.message} /></div> : null}
        <div className="flex justify-end gap-3"><Button variant="secondary" disabled={pending} onClick={() => setConfirmEnd(false)}>Bekor qilish</Button><Button variant="danger" loading={pending} onClick={() => transition('ended')}>Kampaniyani tugatish</Button></div>
      </Dialog>
    </div>
  );
}
