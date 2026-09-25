'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createEmployeeAccount } from '@/lib/actions/accounts';
import { idle, type CredentialsState } from '@/lib/actions/state';
import { EMPLOYMENT_TYPE, PERMISSION_LABEL } from '@/lib/labels';
import { CredentialsCard } from './CredentialsCard';

type Option = { value: string; label: string; description?: string };

type Props = {
  roles: Option[];
  clients: Option[];
  permissions: string[];
  loginDomain: string;
};

/** Team → Add employee. On success the dialog switches to the one-time credentials view. */
export function AddEmployeeDialog({ roles, clients, permissions, loginDomain }: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        Xodim qo‘shish
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setFormKey((k) => k + 1);
        }}
        title="Yangi xodim"
        description="Login va vaqtinchalik parol avtomatik yaratiladi."
        size="lg"
      >
        <EmployeeForm key={formKey} roles={roles} clients={clients} permissions={permissions} loginDomain={loginDomain} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function EmployeeForm({ roles, clients, permissions, loginDomain, onDone }: Props & { onDone: () => void }) {
  const [state, action] = useActionState<CredentialsState, FormData>(createEmployeeAccount, idle);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  if (state.status === 'success') {
    return (
      <div className="space-y-6">
        <CredentialsCard name={`${state.name} uchun akkaunt yaratildi`} email={state.email} password={state.password} />
        <div className="flex justify-end gap-3">
          <a href={`/team/${state.userId}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Profilni ochish
          </a>
          <Button onClick={onDone}>Tayyor</Button>
        </div>
      </div>
    );
  }

  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const suggested = suggestLogin(first, last, loginDomain);

  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Shaxsiy ma’lumotlar</legend>
        <TextInput label="Ism" name="first_name" required autoComplete="off" value={first} onChange={(e) => setFirst(e.target.value)} error={errors.first_name} />
        <TextInput label="Familiya" name="last_name" required autoComplete="off" value={last} onChange={(e) => setLast(e.target.value)} error={errors.last_name} />
        <TextInput label="Telefon" name="phone" type="tel" placeholder="+998 90 123 45 67" error={errors.phone} />
        <TextInput label="Lavozim" name="job_title" placeholder="Masalan: Montajyor" error={errors.job_title} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Akkaunt</legend>
        <div className="sm:col-span-2">
          <TextInput
            label="Email / login"
            name="email"
            type="email"
            required
            autoComplete="off"
            value={emailTouched ? email : email || suggested}
            onChange={(e) => {
              setEmailTouched(true);
              setEmail(e.target.value);
            }}
            hint={!emailTouched && suggested ? 'Ism-familiyadan taklif qilindi — o‘zgartirish mumkin.' : undefined}
            error={errors.email}
          />
        </div>
        <SelectInput label="Rol" name="role_key" required defaultValue="" error={errors.role_key}>
          <option value="" disabled>
            Rolni tanlang
          </option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Ish holati" name="employment_type" defaultValue="full_time">
          {Object.entries(EMPLOYMENT_TYPE).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectInput>
      </fieldset>

      {clients.length > 0 ? (
        <fieldset>
          <legend className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Mijozlar (loyiha jamoasi)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {clients.map((c) => (
              <Checkbox key={c.value} name="client_ids" value={c.value} label={c.label} description={c.description} />
            ))}
          </div>
        </fieldset>
      ) : null}

      {permissions.length > 0 ? (
        <fieldset>
          <button
            type="button"
            onClick={() => setShowPermissions((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"
            aria-expanded={showPermissions}
          >
            <Icon name="shield" size={16} />
            Qo‘shimcha ruxsatlar (rolga qo‘shimcha)
          </button>
          <div className={showPermissions ? 'mt-3 grid gap-2 sm:grid-cols-2' : 'hidden'}>
            {permissions.map((p) => (
              <Checkbox key={p} name="permissions" value={p} label={PERMISSION_LABEL[p] ?? p} description={p} />
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <SubmitButton>Akkaunt yaratish</SubmitButton>
      </div>
    </form>
  );
}

const TRANSLIT: Record<string, string> = { 'ʻ': '', '‘': '', "'": '', '’': '', 'ʼ': '' };

function suggestLogin(first: string, last: string, domain: string): string {
  const clean = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/[ʻ‘'’ʼ]/g, (m) => TRANSLIT[m] ?? '')
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '');
  const f = clean(first);
  const l = clean(last);
  if (!f) return '';
  return `${[f, l].filter(Boolean).join('.')}@${domain}`;
}
