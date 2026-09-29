'use client';

import { useActionState, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveContractAction } from '@/lib/actions/work';
import { idle } from '@/lib/actions/state';
import { CONTRACT_STATUS } from '@/lib/labels';

/** Mijozlar → Shartnomalar → + Shartnoma. */
export function AddContractDialog({ clients, today }: { clients: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveContractAction, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  useEffect(() => {
    if (state.status === 'success') setOpen(false);
  }, [state]);
  return (
    <>
      <Button icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        Shartnoma
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Yangi shartnoma" size="lg">
        <form action={action} className="space-y-4">
          {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Mijoz" name="client_id" required defaultValue="" error={errors.client_id}>
              <option value="" disabled>
                Mijozni tanlang
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <TextInput label="Raqami" name="number" required placeholder="Masalan: 2026/014" error={errors.number} />
            <div className="sm:col-span-2">
              <TextInput label="Nomi (ixtiyoriy)" name="title" placeholder="Masalan: SMM xizmatlari shartnomasi" />
            </div>
            <TextInput label="Boshlanishi" name="starts_on" type="date" required defaultValue={today} error={errors.starts_on} />
            <TextInput label="Tugashi" name="ends_on" type="date" error={errors.ends_on} />
            <TextInput label="Summa (so‘m, ixtiyoriy)" name="amount" inputMode="decimal" error={errors.amount} />
            <SelectInput label="Holati" name="status" defaultValue="active">
              {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextArea label="Izoh" name="notes" maxLength={2000} />
          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Bekor qilish
            </Button>
            <SubmitButton>Saqlash</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
