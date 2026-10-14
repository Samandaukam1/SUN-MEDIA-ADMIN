'use client';

import { useActionState, useRef, useState, useTransition } from 'react';

import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createRoleAction } from '@/lib/actions/access';
import { createEmployeeAccount } from '@/lib/actions/accounts';
import { idle, type CredentialsState } from '@/lib/actions/state';
import { EMPLOYMENT_TYPE, PERMISSION_LABEL } from '@/lib/labels';
import { CredentialsCard } from './CredentialsCard';

type Option = { value: string; label: string; description?: string };

type Props = {
  roles: Option[];
  clients: Option[];
  /** Permissions this admin may pass on. */
  permissions: string[];
  /** What each role already includes (shown ticked and locked). */
  rolePermissions: Record<string, string[]>;
  loginDomain: string;
  /** Tizim egasi: may type a new role here; it starts with the selected role's permissions. */
  canCreateRole?: boolean;
  /** What people can do (operator, montaj…), separate from the role. */
  skills?: Option[];
  /** Tizim egasi only: birth date and passport. */
  privateFields?: boolean;
};

const STEPS = ['Asosiy ma’lumot', 'Lavozim', 'Login va ruxsat', 'Tasdiqlash'] as const;
// Which step holds each field, so a server-side error takes the admin straight to it.
const FIELD_STEP: Record<string, number> = { first_name: 0, last_name: 0, phone: 0, birth_date: 0, passport_series: 0, passport_number: 0, job_title: 1, role_key: 1, employment_type: 1, work_start: 1, work_end: 1, email: 2 };

/**
 * Jamoa → Xodim qo‘shish: four short steps, then the login and temporary password to hand over.
 * The Auth login is created on the server; the password is shown once and never stored.
 */
export function EmployeeForm({ roles: initialRoles, clients, permissions, rolePermissions: initialRolePermissions, loginDomain, canCreateRole = false, skills = [], privateFields = false }: Props) {
  const [roles, setRoles] = useState(initialRoles);
  const [rolePermissions, setRolePermissions] = useState(initialRolePermissions);
  const [newRole, setNewRole] = useState<string | null>(null);
  const [newRoleError, setNewRoleError] = useState<string | null>(null);
  const [creatingRole, startCreatingRole] = useTransition();
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
  const [extra, setExtra] = useState<string[]>([]);
  const stepRef = useRef<HTMLDivElement>(null);

  const role = roles.find((r) => r.value === roleKey);
  const fromRole = new Set(roleKey === 'system_owner' ? permissions : (rolePermissions[roleKey] ?? []));
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
        {state.note ? <Notice tone="warning" title={state.note} /> : null}
        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <a href={`/team/${state.userId}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Profilni ochish
          </a>
          <ButtonLink href="/team" variant="primary">
            Tayyor
          </ButtonLink>
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
        {privateFields ? (
          <div className="grid gap-4 rounded-2xl border border-line p-4 sm:col-span-2 sm:grid-cols-3">
            <p className="text-[12.5px] text-muted sm:col-span-3">
              <Icon name="lock" size={13} className="mr-1 inline" />
              Maxfiy: faqat Tizim egasi ko‘radi va o‘zgartiradi.
            </p>
            <TextInput label="Tug‘ilgan sana" name="birth_date" type="date" error={errors.birth_date} />
            <TextInput label="Pasport seriyasi" name="passport_series" maxLength={2} placeholder="AB" autoComplete="off" className="uppercase" error={errors.passport_series} />
            <TextInput label="Pasport raqami" name="passport_number" maxLength={7} inputMode="numeric" placeholder="1234567" autoComplete="off" error={errors.passport_number} />
          </div>
        ) : null}
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
          <TextInput label="Ish boshlash vaqti" name="work_start" type="time" defaultValue="09:00" required error={errors.work_start} />
          <TextInput label="Ish tugash vaqti" name="work_end" type="time" defaultValue="18:00" required error={errors.work_end} />
          <SelectInput label="Faollik holati" name="employee_status" defaultValue="active">
            <option value="active">Faol</option>
            <option value="on_leave">Ta’tilda</option>
          </SelectInput>
        </div>
        {skills.length ? (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-muted">Skilllar — nima qila oladi (bir nechtasi mumkin)</legend>
            <div className="flex flex-wrap gap-2">
              {skills.map((sk) => (
                <label key={sk.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="checkbox" name="skill_ids" value={sk.value} className="size-4 accent-[var(--accent)]" />
                  {sk.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
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
        {canCreateRole ? (
          newRole === null ? (
            <button type="button" onClick={() => setNewRole('')} className="-mt-2 text-[13px] font-medium text-accent hover:underline">
              + Yangi rol (nomini o‘zingiz yozasiz)
            </button>
          ) : (
            <div className="-mt-2 rounded-xl border border-line bg-surface-2 p-3">
              <label htmlFor="employee-new-role" className="text-[13px] font-medium text-muted">
                {role ? `Yangi rol nomi — ruxsatlari “${role.label}” rolidan olinadi` : 'Avval asos qilib olinadigan rolni tanlang, so‘ng yangi nom yozing'}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="employee-new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  maxLength={80}
                  placeholder="Masalan: Targetolog"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-accent"
                />
                <button
                  type="button"
                  disabled={creatingRole || !newRole.trim() || !roleKey || roleKey === 'system_owner'}
                  onClick={() =>
                    startCreatingRole(async () => {
                      const res = await createRoleAction(newRole, roleKey);
                      if (res.status === 'error') return setNewRoleError(res.message);
                      setRoles([...roles, { value: res.key, label: res.name, description: `Asos: ${role?.label ?? ''}` }]);
                      setRolePermissions({ ...rolePermissions, [res.key]: rolePermissions[roleKey] ?? [] });
                      setRoleKey(res.key);
                      setNewRole(null);
                      setNewRoleError(null);
                    })
                  }
                  className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
                >
                  {creatingRole ? 'Yaratilmoqda…' : 'Yaratish'}
                </button>
              </div>
              {newRoleError ? <p className="mt-2 text-[13px] text-danger">{newRoleError}</p> : null}
            </div>
          )
        ) : null}
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
            <legend className="mb-1 text-[15px] font-semibold">Bu xodim nima qila oladi?</legend>
            <p className="mb-3 text-[13px] text-muted">
              Belgilanganlari “{role?.label ?? 'rol'}” rolidan keladi. Qo‘shimcha ruxsat kerak bo‘lsa, yoniga belgi qo‘ying. O‘zingizda yo‘q ruxsatni bera olmaysiz.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions.map((p) => {
                const included = fromRole.has(p);
                return (
                  <Checkbox
                    key={p}
                    name={included ? undefined : 'permissions'}
                    value={p}
                    label={PERMISSION_LABEL[p] ?? p}
                    description={included ? 'Roldan' : undefined}
                    checked={included || extra.includes(p)}
                    disabled={included}
                    onChange={(e) => setExtra(e.target.checked ? [...extra, p] : extra.filter((x) => x !== p))}
                  />
                );
              })}
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
          <Review label="Qo‘shimcha ruxsat" value={extra.filter((p) => !fromRole.has(p)).map((p) => PERMISSION_LABEL[p] ?? p).join(', ') || '—'} />
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
