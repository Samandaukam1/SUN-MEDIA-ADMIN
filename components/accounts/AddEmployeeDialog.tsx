'use client';

import { useActionState, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
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
  /** Opened from "+ Yaratish → Yangi xodim". */
  defaultOpen?: boolean;
};

const STEPS = ['Asosiy ma’lumot', 'Lavozim', 'Login va ruxsat', 'Tasdiqlash'] as const;
// Which step holds each field, so a server-side error takes the admin straight to it.
const FIELD_STEP: Record<string, number> = { first_name: 0, last_name: 0, phone: 0, job_title: 1, role_key: 1, employment_type: 1, email: 2 };

/** Jamoa → Xodimlar → + Xodim: four short steps, then the login and temporary password to hand over. */
export function AddEmployeeDialog({ roles, clients, permissions, loginDomain, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        Xodim
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

function EmployeeForm({ roles, clients, permissions, loginDomain, onDone }: Omit<Props, 'defaultOpen'> & { onDone: () => void }) {
  const [state, action] = useActionState<CredentialsState, FormData>(async (prev: CredentialsState, data: FormData) => {
    const next = await createEmployeeAccount(prev, data);
    if (next.status === 'error' && next.fieldErrors) {
      const first = Object.keys(next.fieldErrors).map((k) => FIELD_STEP[k]).filter((s) => s != null).sort()[0];
      if (first != null) setStep(first);
    }
    return next;
  }, idle);
  const [step, setStep] = useState(0);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [employment, setEmployment] = useState('full_time');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);

  const role = roles.find((r) => r.value === roleKey);
  const suggested = suggestLogin(first, last, loginDomain);
  const login = emailTouched ? email : email || suggested;

  if (state.status === 'success') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
            <Icon name="check" />
          </span>
          <div>
            <p className="text-lg font-semibold">Xodim yaratildi</p>
            <p className="text-sm text-muted">{[state.name, jobTitle || role?.label].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <CredentialsCard email={state.email} password={state.password} />
        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <a href={`/team/${state.userId}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Profilni ochish
          </a>
          <Button onClick={onDone}>Tayyor</Button>
        </div>
      </div>
    );
  }

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const next = () => {
    // Browser validation for the visible step only (required name, role, login…).
    const fields = stepRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ?? [];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <form action={action} className="space-y-6">
      <ol className="grid grid-cols-4 gap-2" aria-label="Bosqichlar">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className="space-y-1.5">
            <span className={cn('block h-1 rounded-full', i <= step ? 'bg-ink' : 'bg-surface-2')} />
            <span className={cn('block text-xs', i === step ? 'font-semibold text-ink' : 'text-subtle')}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}

      {/* Every step stays mounted (hidden), so the final submit sends all fields. */}
      <div ref={step === 0 ? stepRef : undefined} className={cn('grid gap-4 sm:grid-cols-2', step !== 0 && 'hidden')}>
        <TextInput label="Ism" name="first_name" required autoComplete="off" value={first} onChange={(e) => setFirst(e.target.value)} error={errors.first_name} />
        <TextInput label="Familiya" name="last_name" required autoComplete="off" value={last} onChange={(e) => setLast(e.target.value)} error={errors.last_name} />
        <div className="sm:col-span-2">
          <TextInput label="Telefon" name="phone" type="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </div>
      </div>

      <div ref={step === 1 ? stepRef : undefined} className={cn('space-y-5', step !== 1 && 'hidden')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Lavozim" name="job_title" placeholder="Masalan: Montajyor" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} error={errors.job_title} />
          <SelectInput label="Ish holati" name="employment_type" value={employment} onChange={(e) => setEmployment(e.target.value)}>
            {Object.entries(EMPLOYMENT_TYPE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </div>
        <SelectInput
          label="Rol (tizimda nima qila oladi)"
          name="role_key"
          required
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          error={errors.role_key}
          hint={role?.description}
        >
          <option value="" disabled>
            Rolni tanlang
          </option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectInput>
        {clients.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-muted">Qaysi mijozlar bilan ishlaydi</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {clients.map((c) => (
                <Checkbox
                  key={c.value}
                  name="client_ids"
                  value={c.value}
                  label={c.label}
                  description={c.description}
                  checked={clientIds.includes(c.value)}
                  onChange={(e) => setClientIds(e.target.checked ? [...clientIds, c.value] : clientIds.filter((id) => id !== c.value))}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <div ref={step === 2 ? stepRef : undefined} className={cn('space-y-5', step !== 2 && 'hidden')}>
        <TextInput
          label="Login (email)"
          name="email"
          type="email"
          required
          autoComplete="off"
          value={login}
          onChange={(e) => {
            setEmailTouched(true);
            setEmail(e.target.value);
          }}
          hint={!emailTouched && suggested ? 'Ism-familiyadan taklif qilindi — o‘zgartirish mumkin.' : 'Xodim shu login bilan ilovaga kiradi.'}
          error={errors.email}
        />
        <p className="text-sm text-muted">Vaqtinchalik parol avtomatik yaratiladi. Xodim birinchi kirishda uni o‘zgartiradi.</p>
        {permissions.length > 0 ? (
          <fieldset>
            <button type="button" onClick={() => setShowPermissions((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-muted hover:text-ink" aria-expanded={showPermissions}>
              <Icon name="shield" size={16} />
              Rolga qo‘shimcha ruxsat berish (ixtiyoriy)
            </button>
            <div className={showPermissions ? 'mt-3 grid gap-2 sm:grid-cols-2' : 'hidden'}>
              {permissions.map((p) => (
                <Checkbox key={p} name="permissions" value={p} label={PERMISSION_LABEL[p] ?? p} />
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      {step === 3 ? (
        <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
          <Review label="Ism" value={`${first} ${last}`.trim()} />
          <Review label="Telefon" value={phone || '—'} />
          <Review label="Lavozim" value={jobTitle || '—'} />
          <Review label="Rol" value={role?.label ?? '—'} />
          <Review label="Ish holati" value={EMPLOYMENT_TYPE[employment as keyof typeof EMPLOYMENT_TYPE]} />
          <Review label="Mijozlar" value={clients.filter((c) => clientIds.includes(c.value)).map((c) => c.label).join(', ') || '—'} />
          <Review label="Login" value={login} />
        </dl>
      ) : null}

      <div className="flex justify-between gap-3 border-t border-line pt-5">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
            Orqaga
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>
            Keyingi
          </Button>
        ) : (
          <SubmitButton>Xodimni yaratish</SubmitButton>
        )}
      </div>
    </form>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-2.5">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
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
