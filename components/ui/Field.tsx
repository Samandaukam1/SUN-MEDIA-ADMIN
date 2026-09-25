import type { InputHTMLAttributes } from 'react';

import { cn } from './cn';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

export function Field({ label, error, id, className, ...rest }: Props) {
  const inputId = id ?? rest.name;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'h-12 rounded-xl border bg-surface px-4 text-[15px] text-ink outline-none placeholder:text-subtle focus:border-accent',
          error ? 'border-danger' : 'border-line',
          className,
        )}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
