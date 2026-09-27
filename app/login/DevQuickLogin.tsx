'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { SignInState } from './actions';
import { devQuickSignInAction } from './devActions';

const ACCOUNTS = [
  { key: 'owner', label: 'Owner' },
  { key: 'admin', label: 'Admin' },
];

/** DEV ONLY: one click signs in with a local seed account through the normal Supabase password flow. */
export function DevQuickLogin({ next, host }: { next: string; host: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(devQuickSignInAction, {});
  const [clicked, setClicked] = useState<string | null>(null);

  return (
    <section aria-label="DEV QUICK LOGIN" className="mt-8 rounded-2xl border border-dashed border-warning bg-warning-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold tracking-wide">DEV QUICK LOGIN</p>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-medium text-warning">faqat development</span>
      </div>
      <p className="mt-1 text-[12px] text-muted">Lokal baza: {host} · parol yozish shart emas</p>
      <form action={formAction} className="mt-3 grid grid-cols-2 gap-2">
        <input type="hidden" name="next" value={next} />
        {ACCOUNTS.map((a) => (
          <Button
            key={a.key}
            type="submit"
            name="account"
            value={a.key}
            variant="secondary"
            aria-label={`${a.label} sifatida kirish`}
            loading={pending && clicked === a.key}
            disabled={pending}
            onClick={() => setClicked(a.key)}
          >
            {a.label}
          </Button>
        ))}
      </form>
      {state.error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
