'use client';

import { useState, useTransition } from 'react';

import { setClientApproval } from '@/lib/actions/accounts';

/** Grants/withdraws client.approve for a client employee (client owners always approve). */
export function ApprovalToggle({ clientId, userId, allowed }: { clientId: string; userId: string; allowed: boolean }) {
  const [value, setValue] = useState(allowed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          setError(null);
          start(async () => {
            const result = await setClientApproval(clientId, userId, next);
            if (result.status === 'error') {
              setValue(!next);
              setError(result.message);
            }
          });
        }}
      />
      Tasdiqlay oladi
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}
