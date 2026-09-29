'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { revokeSessionsAction } from '@/lib/actions/system';

/** "Chiqarib yuborish" with an inline confirmation (no browser dialogs). */
export function RevokeButton({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (message) return <span className="text-sm text-muted">{message}</span>;
  if (!asking) {
    return (
      <Button variant="ghost" size="md" disabled={disabled} onClick={() => setAsking(true)}>
        Chiqarib yuborish
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="danger"
        size="md"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await revokeSessionsAction(userId);
            setMessage(result.status === 'success' ? (result.message ?? 'Chiqarildi') : result.status === 'error' ? result.message : null);
          })
        }
      >
        Ha, chiqarish
      </Button>
      <Button variant="ghost" size="md" onClick={() => setAsking(false)}>
        Yo‘q
      </Button>
    </span>
  );
}
