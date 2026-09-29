'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { declineAccessRequest, grantAccessRequest } from '@/lib/actions/accounts';
import { idle, type ActionState } from '@/lib/actions/state';

type Option = { value: string; label: string };

/** "Kirish berish": staff (role) or client (company + client role) for a login that waits for access. */
export function GrantAccessDialog({
  userId,
  email,
  fullName,
  staffRoles,
  clients,
  canStaff,
}: {
  userId: string;
  email: string | null;
  fullName: string;
  staffRoles: Option[];
  clients: Option[];
  canStaff: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'staff' | 'client'>(canStaff ? 'staff' : 'client');
  const [state, action] = useActionState(grantAccessRequest, idle);
  const [declined, setDeclined] = useState<ActionState | null>(null);
  const [declining, startDecline] = useTransition();
  const [first, ...rest] = fullName.split(' ');

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="md" onClick={() => setOpen(true)}>
        Kirish berish
      </Button>
      {canStaff ? (
        <Button
          size="md"
          variant="ghost"
          loading={declining}
          onClick={() => {
            if (window.confirm(`${email ?? fullName} so‘rovini rad etasizmi? Login bloklanadi.`)) startDecline(async () => setDeclined(await declineAccessRequest(userId)));
          }}
        >
          Rad etish
        </Button>
      ) : null}
      {declined?.status === 'error' ? <span className="text-[13px] text-danger">{declined.message}</span> : null}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          if (state.status === 'success') router.refresh();
        }}
        title="Kirish berish"
        description={email ?? undefined}
      >
        {state.status === 'success' ? (
          <div className="space-y-5">
            <Notice tone="success" title={state.message ?? 'Kirish berildi.'} />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Tayyor
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="kind" value={kind} />
            {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
            <div className="flex gap-2">
              {canStaff ? (
                <Button type="button" variant={kind === 'staff' ? 'primary' : 'secondary'} onClick={() => setKind('staff')}>
                  SUN MEDIA xodimi
                </Button>
              ) : null}
              <Button type="button" variant={kind === 'client' ? 'primary' : 'secondary'} onClick={() => setKind('client')}>
                Mijoz akkaunti
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Ism" name="first_name" defaultValue={first ?? ''} required error={state.status === 'error' ? state.fieldErrors?.first_name : undefined} />
              <TextInput label="Familiya" name="last_name" defaultValue={rest.join(' ')} required error={state.status === 'error' ? state.fieldErrors?.last_name : undefined} />
            </div>
            {kind === 'staff' ? (
              <>
                <SelectInput label="Rol" name="role_key" required defaultValue="">
                  <option value="" disabled>
                    Tanlang
                  </option>
                  {staffRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </SelectInput>
                <TextInput label="Lavozim (ixtiyoriy)" name="job_title" maxLength={80} />
                <p className="text-[13px] text-muted">Qo‘shimcha ruxsatlarni keyin xodim sahifasidagi “Kirish huquqlari”da belgilaysiz.</p>
              </>
            ) : (
              <>
                <SelectInput label="Mijoz" name="client_id" required defaultValue="">
                  <option value="" disabled>
                    Tanlang
                  </option>
                  {clients.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput label="Mijoz roli" name="role_key" required defaultValue="client_owner">
                  <option value="client_owner">Mijoz (kompaniya rahbari)</option>
                  <option value="client_employee">Mijoz xodimi</option>
                </SelectInput>
                <p className="text-[13px] text-muted">Mijoz faqat o‘z kompaniyasini kuzatadi va SUN MEDIA bilan yozishadi.</p>
              </>
            )}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <SubmitButton>Kirish berish</SubmitButton>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
