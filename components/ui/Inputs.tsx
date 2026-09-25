import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from './cn';

const control =
  'w-full rounded-xl border bg-surface px-4 text-[15px] text-ink outline-none placeholder:text-subtle focus:border-accent disabled:opacity-60';

function Wrap({ label, error, hint, htmlFor, children, required }: { label: string; error?: string; hint?: string; htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {' *'}
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

type Common = { label: string; error?: string; hint?: string };

export function TextInput({ label, error, hint, id, className, required, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? rest.name ?? label;
  return (
    <Wrap label={label} error={error} hint={hint} htmlFor={inputId} required={required}>
      <input
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(control, 'h-11', error ? 'border-danger' : 'border-line', className)}
      />
    </Wrap>
  );
}

export function SelectInput({ label, error, hint, id, className, children, required, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const inputId = id ?? rest.name ?? label;
  return (
    <Wrap label={label} error={error} hint={hint} htmlFor={inputId} required={required}>
      <select
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'h-11 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', error ? 'border-danger' : 'border-line', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b93' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {children}
      </select>
    </Wrap>
  );
}

export function TextArea({ label, error, hint, id, className, required, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputId = id ?? rest.name ?? label;
  return (
    <Wrap label={label} error={error} hint={hint} htmlFor={inputId} required={required}>
      <textarea
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'min-h-24 py-3', error ? 'border-danger' : 'border-line', className)}
      />
    </Wrap>
  );
}

export function Checkbox({ label, description, className, ...rest }: { label: string; description?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface-2 has-[:checked]:border-accent', className)}>
      <input type="checkbox" {...rest} className="mt-0.5 size-4 accent-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="block text-[13px] text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
