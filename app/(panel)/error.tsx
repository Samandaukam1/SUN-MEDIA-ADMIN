'use client';

import { Button } from '@/components/ui/Button';

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = /42501|permission/i.test(error.message);
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{forbidden ? 'Ruxsat yo‘q' : 'Sahifani yuklab bo‘lmadi'}</h1>
      <p className="text-muted">
        {forbidden ? 'Bu ma’lumotni ko‘rish uchun rolingizda ruxsat yo‘q.' : 'Server bilan aloqada xatolik. Qayta urinib ko‘ring.'}
      </p>
      {error.digest ? <p className="text-xs text-subtle">Kod: {error.digest}</p> : null}
      {!forbidden ? <Button onClick={reset}>Qayta urinish</Button> : null}
    </div>
  );
}
