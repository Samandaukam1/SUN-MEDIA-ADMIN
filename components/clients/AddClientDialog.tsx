'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createClientRecord } from '@/lib/actions/clients';
import { idle, type ActionState } from '@/lib/actions/state';
import { ClientFields } from './ClientFields';

export function AddClientDialog() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(createClientRecord, idle);
  return (
    <>
      <Button icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        Mijoz qo‘shish
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Yangi mijoz" description="Keyin mijoz uchun login, jamoa va tarif biriktirasiz." size="lg">
        <form action={action} className="space-y-6">
          {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
          <ClientFields errors={state.status === 'error' ? state.fieldErrors : undefined} />
          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Bekor qilish
            </Button>
            <SubmitButton>Mijozni yaratish</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
