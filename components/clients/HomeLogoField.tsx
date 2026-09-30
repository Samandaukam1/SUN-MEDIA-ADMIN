'use client';

import { useActionState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { clearHomeLogo, uploadHomeLogo, type LogoVariant } from '@/lib/actions/branding';
import { idle } from '@/lib/actions/state';

/** Centre Home logo of the app: preview, upload (PNG/JPG/WEBP/SVG, ≤ 2 MB) and reset to the default. */
export function HomeLogoField({
  clientId,
  variant,
  current,
  fallbackLabel,
}: {
  clientId: string | null;
  variant: LogoVariant;
  current: string | null;
  fallbackLabel: string;
}) {
  const [state, action] = useActionState(uploadHomeLogo.bind(null, clientId, variant), idle);
  const [pending, start] = useTransition();
  return (
    <form action={action} className="flex flex-wrap items-center gap-5">
      <div className={`flex size-16 items-center justify-center overflow-hidden rounded-[18px] border border-line ${variant === 'dark' ? 'bg-[#0B0B0C]' : 'bg-[#EDEDEF]'}`}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Bosh sahifa logosi" className="size-full object-cover" />
        ) : (
          <span className={`px-1 text-center text-[10px] font-semibold ${variant === 'dark' ? 'text-white' : 'text-[#0B0B0C]'}`}>{fallbackLabel}</span>
        )}
      </div>
      <div className="min-w-60 flex-1 space-y-2">
        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block text-sm" required />
        <p className="text-[13px] font-medium">{variant === 'dark' ? 'Qorong‘u mavzu logosi' : 'Yorug‘ mavzu logosi'}</p>
        <p className="text-[13px] text-muted">Kvadrat, kamida 256×256 px. Ilovaning pastki menyusi markazida ko‘rinadi.</p>
      </div>
      <div className="flex gap-2">
        <SubmitButton>Yuklash</SubmitButton>
        {current ? (
          <Button type="button" variant="ghost" loading={pending} onClick={() => start(async () => void (await clearHomeLogo(clientId, variant)))}>
            Standart
          </Button>
        ) : null}
      </div>
      {state.status === 'error' ? <div className="w-full"><Notice tone="danger" title={state.message} /></div> : null}
      {state.status === 'success' ? <div className="w-full"><Notice tone="success" title={state.message ?? 'Saqlandi'} /></div> : null}
    </form>
  );
}
