'use client';

import { useActionState, useId, useState } from 'react';

import { SiteIcon } from '@/components/site/SiteIcon';
import { changePassword, type PasswordState } from '@/lib/cabinet/actions';
import { PASSWORD_MIN, passwordProblem } from '@/lib/password-policy';

const field =
  'h-[52px] w-full rounded-2xl border bg-white/[0.04] px-4 pr-13 text-[15.5px] text-white outline-none transition-all duration-300 placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.14)] disabled:opacity-60';

function PasswordField({
  name,
  label,
  autoComplete,
  error,
  disabled,
  value,
  onChange,
}: {
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
  disabled: boolean;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#d9d9de]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          aria-invalid={!!error}
          className={`${field} ${error ? 'border-[#ff8a8a]/60' : 'border-white/10'}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
          aria-pressed={show}
          className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-[#8e8e96] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <SiteIcon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {error ? <p className="mt-1.5 text-[12.5px] text-[#ff8a8a]">{error}</p> : null}
    </div>
  );
}

export function PasswordForm({ email, forced }: { email: string; forced: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, { status: 'idle' });
  const [password, setPassword] = useState('');
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const hint = password ? passwordProblem(password, { email }) : null;

  return (
    <form action={action} className="mt-7 space-y-4" noValidate>
      <PasswordField name="current" label={forced ? 'Vaqtinchalik parol' : 'Joriy parol'} autoComplete="current-password" error={errors.current} disabled={pending} />
      <PasswordField
        name="password"
        label="Yangi parol"
        autoComplete="new-password"
        error={errors.password}
        disabled={pending}
        value={password}
        onChange={setPassword}
      />
      <p className={`-mt-2 text-[12.5px] leading-snug ${password && !hint ? 'text-[#d4fc18]' : 'text-[#8e8e96]'}`} aria-live="polite">
        {password ? (hint ?? 'Parol talablarga mos.') : `Kamida ${PASSWORD_MIN} ta belgi, harf va raqam bilan. Login (email)ni ishlatmang.`}
      </p>
      <PasswordField name="repeat" label="Yangi parolni takrorlang" autoComplete="new-password" error={errors.repeat} disabled={pending} />

      <div className="min-h-[20px] text-[13px]" aria-live="polite">
        {state.status === 'error' && !state.fieldErrors ? (
          <p className="flex items-start gap-2 text-[#ff8a8a]">
            <SiteIcon name="alert" size={16} className="mt-px shrink-0" />
            <span>{state.message}</span>
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className="s-btn s-btn-lime w-full disabled:opacity-60">
        {pending ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-[#0b0b0c] border-t-transparent" /> Saqlanmoqda…
          </>
        ) : (
          'Parolni saqlash'
        )}
      </button>
    </form>
  );
}
