'use client';

import { useActionState, useState } from 'react';

import { CredentialsCard } from '@/components/accounts/CredentialsCard';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createClientAccount } from '@/lib/actions/accounts';
import { idle, type CredentialsState } from '@/lib/actions/state';

export function AddClientUserDialog({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        Login qo‘shish
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={`${clientName} uchun login`}
        description="Mijoz faqat o‘z kompaniyasi ma’lumotlarini ko‘radi."
        size="lg"
      >
        <ClientUserForm key={key} clientId={clientId} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function ClientUserForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, action] = useActionState<CredentialsState, FormData>(createClientAccount, idle);
  const [role, setRole] = useState('client_owner');
  if (state.status === 'success') {
    return (
      <div className="space-y-6">
        <CredentialsCard name={`${state.name} uchun login yaratildi`} email={state.email} password={state.password} />
        <div className="flex justify-end">
          <Button onClick={onDone}>Tayyor</Button>
        </div>
      </div>
    );
  }
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Ism" name="first_name" required error={errors.first_name} />
        <TextInput label="Familiya" name="last_name" required error={errors.last_name} />
        <TextInput label="Email / login" name="email" type="email" required error={errors.email} placeholder="ism@kompaniya.uz" />
        <TextInput label="Telefon" name="phone" type="tel" error={errors.phone} placeholder="+998 90 123 45 67" />
        <TextInput label="Lavozimi" name="title" error={errors.title} placeholder="Marketing menejeri" />
        <SelectInput label="Rol" name="role_key" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="client_owner">Mijoz (egasi) — tasdiqlaydi</option>
          <option value="client_employee">Mijoz xodimi — faqat ko‘radi</option>
        </SelectInput>
      </div>
      {role === 'client_employee' ? (
        <Checkbox name="can_approve" label="Kontentni tasdiqlash huquqi" description="Belgilansa, xodim videolarni tasdiqlashi va o‘zgartirish so‘rashi mumkin." />
      ) : null}
      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton>Login yaratish</SubmitButton>
      </div>
    </form>
  );
}
