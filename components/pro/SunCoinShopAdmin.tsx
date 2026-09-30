'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idle, type ActionState } from '@/lib/actions/state';
import { createSunCoinPack, fulfillSunCoinPurchase, giftSunCoin, rejectSunCoinPurchase, setSunCoinPackActive } from '@/lib/actions/sun-coin';

/** New Coin Shop pack. Prices are what SUN MEDIA charges; the app shows them as they are. */
export function SunCoinPackForm() {
  const [state, action] = useActionState(createSunCoinPack, idle);
  const err = (key: string) => (state.status === 'error' ? state.fieldErrors?.[key] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <div className="grid gap-4 sm:grid-cols-4">
        <TextInput name="coins" label="SUN Coin (SC)" type="number" min={1} max={1_000_000} step={1} required error={err('coins')} placeholder="100" />
        <TextInput name="price" label="Narx" type="number" min={0.01} step={0.01} required error={err('price')} placeholder="4.99" />
        <TextInput name="currency" label="Valyuta" defaultValue="USD" maxLength={3} required error={err('currency')} />
        <TextInput name="sortOrder" label="Tartib" type="number" min={0} max={99} step={1} defaultValue={0} error={err('sortOrder')} />
      </div>
      <SubmitButton>Paket qo‘shish</SubmitButton>
    </form>
  );
}

export function SunCoinPackToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  return (
    <div className="flex items-center justify-end gap-2">
      {state.status === 'error' ? <span className="text-sm text-danger">{state.message}</span> : null}
      <Button variant="secondary" loading={pending} onClick={() => start(async () => setState(await setSunCoinPackActive(id, !isActive)))}>
        {isActive ? 'Yashirish' : 'Ko‘rsatish'}
      </Button>
    </div>
  );
}

/** A pending request: credit after the payment has arrived, or reject with a reason the client will see. */
export function SunCoinPurchaseActions({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const [dialog, setDialog] = useState<'fulfill' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const result = await fn();
      setState(result);
      if (result.status === 'success') setDialog(null);
    });
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button onClick={() => setDialog('fulfill')}>To‘lov qabul qilindi</Button>
      <Button variant="secondary" onClick={() => setDialog('reject')}>Rad etish</Button>
      {state.status === 'error' && !dialog ? <span className="w-full text-right text-sm text-danger">{state.message}</span> : null}
      <Dialog open={dialog === 'fulfill'} onClose={() => !pending && setDialog(null)} title="To‘lovni tasdiqlash" description={`${label}. Tasdiqlagach SUN Coin darhol mijoz hisobiga tushadi va qaytarib bo‘lmaydi.`}>
        {state.status === 'error' ? <div className="mb-4"><Notice tone="danger" title={state.message} /></div> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>Bekor qilish</Button>
          <Button loading={pending} onClick={() => run(() => fulfillSunCoinPurchase(id))}>SUN Coin berish</Button>
        </div>
      </Dialog>
      <Dialog open={dialog === 'reject'} onClose={() => !pending && setDialog(null)} title="So‘rovni rad etish" description={`${label}. Sabab mijozga bildirishnoma sifatida yuboriladi.`}>
        <div className="space-y-4">
          {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
          <TextArea name="note" label="Sabab (ixtiyoriy)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>Bekor qilish</Button>
            <Button variant="danger" loading={pending} onClick={() => run(() => rejectSunCoinPurchase(id, note))}>Rad etish</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Gift SUN Coin to a client user by email. */
export function SunCoinGiftForm() {
  const [state, action] = useActionState(giftSunCoin, idle);
  const err = (key: string) => (state.status === 'error' ? state.fieldErrors?.[key] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput name="email" label="Mijoz emaili" type="email" required error={err('email')} placeholder="safi@client.local" />
        <TextInput name="amount" label="SUN Coin (SC)" type="number" min={1} max={100000} step={1} required defaultValue={10} error={err('amount')} />
        <TextInput name="note" label="Izoh (mijoz ko‘radi)" maxLength={200} error={err('note')} placeholder="Faol ishtirok uchun" />
      </div>
      <SubmitButton>Sovg‘a qilish</SubmitButton>
    </form>
  );
}
