'use client';

import { useActionState, useState } from 'react';

import { createProspect } from '@/lib/actions/prospects';
import { idle, type ActionState } from '@/lib/actions/state';

const field =
  'h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-all placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.14)]';

export function NewProspectForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createProspect, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-[#d4fc18] px-6 text-[15px] font-semibold text-[#0b0b0c] shadow-[0_10px_40px_-8px_rgb(212_252_24/0.55)] transition-transform hover:scale-[1.02]"
      >
        + Yangi mijoz tahlili
      </button>
    );
  }
  return (
    <form action={action} className="grid w-full gap-3 rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-[15px] font-semibold text-white">Yangi mijoz</p>
        <p className="mt-0.5 text-[13px] text-[#8e8e96]">Ism yoki brend nomi kifoya — qolganini suhbat davomida to‘ldirasiz.</p>
      </div>
      <label className="text-[12.5px] text-[#a8a8ac]">
        Ism yoki brend *
        <input name="name" required maxLength={120} placeholder="Masalan: Lazzat kafe" className={`${field} mt-1`} />
        {errors.name ? <span className="mt-1 block text-[12px] text-[#ff8a8a]">{errors.name}</span> : null}
      </label>
      <label className="text-[12.5px] text-[#a8a8ac]">
        Kompaniya
        <input name="company" maxLength={160} placeholder="MChJ nomi (ixtiyoriy)" className={`${field} mt-1`} />
      </label>
      <label className="text-[12.5px] text-[#a8a8ac]">
        Telefon
        <input name="phone" type="tel" maxLength={40} placeholder="+998 90 123 45 67" className={`${field} mt-1`} />
      </label>
      <label className="text-[12.5px] text-[#a8a8ac]">
        Instagram
        <input name="instagram" maxLength={120} placeholder="@brend yoki havola" className={`${field} mt-1`} />
      </label>
      {state.status === 'error' && !state.fieldErrors ? <p className="text-[13px] text-[#ff8a8a] sm:col-span-2">{state.message}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="h-12 rounded-full bg-[#d4fc18] px-6 text-[15px] font-semibold text-[#0b0b0c] disabled:opacity-60">
          {pending ? 'Yaratilmoqda…' : 'Boshlash'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-full px-5 text-[14px] text-[#a8a8ac] hover:text-white">
          Bekor
        </button>
      </div>
    </form>
  );
}
