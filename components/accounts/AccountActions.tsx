'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resetAccountPassword, setAccountStatus } from '@/lib/actions/accounts';
import { idle, type ActionState, type CredentialsState } from '@/lib/actions/state';
import { ACCOUNT_STATUS } from '@/lib/labels';
import { CredentialsCard } from './CredentialsCard';

type Status = 'active' | 'suspended' | 'disabled';

/** Password reset + Active/Suspended/Disabled for one account. Server + DB decide what is allowed. */
export function AccountActions({ userId, status, revalidate, compact = false }: { userId: string; status: Status; revalidate: string; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ResetPassword userId={userId} compact={compact} />
      <StatusControl userId={userId} status={status} revalidate={revalidate} compact={compact} />
    </div>
  );
}

function ResetPassword({ userId, compact }: { userId: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CredentialsState>(idle);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" size="md" icon={<Icon name="key" size={16} />} onClick={() => setOpen(true)}>
        {compact ? 'Parol' : 'Parolni tiklash'}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setResult(idle);
        }}
        title="Parolni tiklash"
        description="Yangi vaqtinchalik parol yaratiladi, eski parol darhol ishlamay qoladi."
      >
        {result.status === 'success' ? (
          <div className="space-y-6">
            <CredentialsCard email={result.email} password={result.password} />
            <div className="flex justify-end">
              <Button onClick={() => { setOpen(false); setResult(idle); }}>Tayyor</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {result.status === 'error' ? <Notice tone="danger" title={result.message} /> : null}
            <p className="text-sm text-muted">Foydalanuvchi keyingi kirishda yangi parolni ishlatadi. Amal audit jurnaliga yoziladi.</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button loading={pending} onClick={() => start(async () => setResult(await resetAccountPassword(userId)))}>
                Yangi parol yaratish
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function StatusControl({ userId, status, revalidate, compact }: { userId: string; status: Status; revalidate: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(setAccountStatus, idle);
  const [next, setNext] = useState<Status>(status === 'active' ? 'suspended' : 'active');
  const blocked = status !== 'active';
  return (
    <>
      <Button variant={blocked ? 'secondary' : 'danger'} icon={<Icon name={blocked ? 'unlock' : 'lock'} size={16} />} onClick={() => setOpen(true)}>
        {compact ? (blocked ? 'Faollashtirish' : 'Bloklash') : blocked ? 'Holatni o‘zgartirish' : 'Bloklash'}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Akkaunt holati" description={`Hozir: ${ACCOUNT_STATUS[status].label}`}>
        {state.status === 'success' ? (
          <div className="space-y-5">
            <Notice tone="success" title={state.message} />
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Yopish</Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-5">
            {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="revalidate" value={revalidate} />
            <SelectInput label="Yangi holat" name="status" value={next} onChange={(e) => setNext(e.target.value as Status)}>
              {(Object.keys(ACCOUNT_STATUS) as Status[])
                .filter((s) => s !== status)
                .map((s) => (
                  <option key={s} value={s}>
                    {ACCOUNT_STATUS[s].label}
                  </option>
                ))}
            </SelectInput>
            {next !== 'active' ? (
              <TextArea
                label="Sabab"
                name="reason"
                required
                maxLength={300}
                placeholder={next === 'suspended' ? 'Masalan: ta’til davrida vaqtincha' : 'Masalan: ishdan ketdi'}
                error={state.status === 'error' ? state.fieldErrors?.reason : undefined}
              />
            ) : null}
            <p className="text-[13px] text-muted">
              {next === 'active'
                ? 'Foydalanuvchi yana tizimga kira oladi.'
                : 'Foydalanuvchi darhol hech qanday ma’lumotni ko‘ra olmaydi va ochiq sessiyalari tugaydi.'}
            </p>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <SubmitButton variant={next === 'active' ? 'primary' : 'danger'}>{next === 'active' ? 'Faollashtirish' : 'Bloklash'}</SubmitButton>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
