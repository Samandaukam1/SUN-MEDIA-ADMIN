'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelPartnerUpgrade, requestPartnerUpgrade } from '@/lib/cabinet/partner-actions';

export function UpgradeButton({ brand, planId, planName }: { brand: string | null; planId: string; planName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="s-btn s-btn-glass lg h-10 w-full px-4 text-[13.5px]">
        Shu tarifga o‘tishni so‘rash
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={`${planName} haqida izoh (ixtiyoriy)`}
        className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18]"
      />
      {error ? <p className="text-[12.5px] text-[#ff8a8a]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await requestPartnerUpgrade(brand, planId, note);
              if (res.ok) {
                setOpen(false);
                router.refresh();
              } else setError(res.message);
            })
          }
          className="s-btn s-btn-lime h-10 flex-1 px-4 text-[13.5px] disabled:opacity-60"
        >
          {pending ? 'Yuborilmoqda…' : 'So‘rov yuborish'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full px-4 text-[13.5px] text-[#a8a8ac] hover:text-white">
          Bekor
        </button>
      </div>
    </div>
  );
}

export function CancelUpgrade({ brand, requestId }: { brand: string | null; requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelPartnerUpgrade(brand, requestId);
            if (res.ok) router.refresh();
            else setError(res.message);
          })
        }
        className="text-[13px] font-medium text-[#a8a8ac] underline-offset-4 hover:text-white hover:underline disabled:opacity-60"
      >
        {pending ? 'Bekor qilinmoqda…' : 'So‘rovni bekor qilish'}
      </button>
      {error ? <span className="text-[12px] text-[#ff8a8a]">{error}</span> : null}
    </span>
  );
}
