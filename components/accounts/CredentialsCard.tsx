'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { Notice } from '@/components/ui/Notice';

/** Login + temporary password shown exactly once after create/reset. Nothing here is stored. */
export function CredentialsCard({ email, password, name }: { email: string; password: string; name?: string }) {
  const both = `Login: ${email}\nVaqtinchalik parol: ${password}`;
  return (
    <div className="space-y-5">
      <Notice tone="warning" title="Parol faqat hozir ko‘rsatiladi">
        Uni xodimga xavfsiz kanal orqali yuboring. Oynani yopgach parolni qayta ko‘rib bo‘lmaydi — kerak bo‘lsa yangisini yarating.
      </Notice>
      {name ? <p className="text-sm text-muted">{name}</p> : null}
      <dl className="overflow-hidden rounded-2xl border border-line">
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <dt className="text-[13px] text-muted">Login</dt>
          <dd className="font-mono text-[15px] font-medium select-all">{email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-[13px] text-muted">Vaqtinchalik parol</dt>
          <dd className="font-mono text-[17px] font-semibold tracking-wide select-all">{password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={email} label="Loginni nusxalash" />
        <CopyButton value={password} label="Parolni nusxalash" />
        <CopyButton value={both} label="Ikkalasini nusxalash" variant="primary" />
      </div>
    </div>
  );
}
