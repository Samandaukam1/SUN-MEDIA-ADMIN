'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { briefAiStatus, briefClose, briefDelete, briefDeviceLink, briefResume, briefStart } from '@/lib/actions/brief';

const field =
  'h-12 w-full rounded-[14px] border border-white/10 bg-[#0b0b0c]/80 px-4 text-[14.5px] text-white outline-none placeholder:text-[#5e5e66] focus:border-[#d4fc18]';

/** "Yangi tahlil": optional name / contact, then this device switches to the client's full-screen interview. */
export function StartInterview({ aiReady }: { aiReady: boolean }) {
  const router = useRouter();
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await briefStart({ company, contact });
      if (!r.ok) return setError(r.message);
      router.push('/suhbat');
    } catch {
      setError('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-[#8e8e96]">Kompaniya yoki brend (ixtiyoriy)</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={160} placeholder="Mijozning o‘zi ham yozishi mumkin" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-[#8e8e96]">Aloqa uchun ism yoki telefon (ixtiyoriy)</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} placeholder="Faqat menejerlarga ko‘rinadi" className={field} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={busy} className="t-shine relative h-12 rounded-full bg-[#d4fc18] px-7 text-[14.5px] font-semibold text-[#0b0b0c] disabled:opacity-60">
          {busy ? 'Tayyorlanmoqda…' : 'Mijozga topshirish'}
        </button>
        <p className="text-[12.5px] leading-relaxed text-[#8e8e96]">
          Sahifa mijoz rejimiga o‘tadi: panel yopiladi, chiqish faqat sizning parolingiz bilan.{aiReady ? '' : ' AI ulanmagan — savollar ekspert qoidalari bo‘yicha beriladi.'}
        </p>
      </div>
      {error ? <p className="text-[13px] text-[#fca5a5]">{error}</p> : null}
    </form>
  );
}

/** An unfinished interview: continue here, open on another device, or close it (answers stay). */
export function SessionActions({ id, compact = false }: { id: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const act = async (name: string, fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    setBusy(name);
    setMessage(null);
    try {
      const r = await fn();
      if (!r.ok) setMessage(r.message ?? 'Bajarib bo‘lmadi.');
      else after?.();
    } catch {
      setMessage('Aloqa uzildi.');
    } finally {
      setBusy(null);
    }
  };
  const btn = 'h-9 rounded-full border border-white/12 px-4 text-[12.5px] text-[#d9d9de] transition-colors hover:border-[#d4fc18]/50 hover:text-[#d4fc18] disabled:opacity-50';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} className={btn} onClick={() => act('resume', () => briefResume(id), () => router.push('/suhbat'))}>
          {busy === 'resume' ? '…' : 'Shu qurilmada davom ettirish'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className={btn}
          onClick={() =>
            act('link', async () => {
              const r = await briefDeviceLink(id);
              if (r.ok) setLink(`${window.location.origin}${r.path}`);
              return r;
            })
          }
        >
          {busy === 'link' ? '…' : 'Boshqa qurilma uchun havola'}
        </button>
        {!compact ? (
          <button
            type="button"
            disabled={!!busy}
            className={btn}
            onClick={() => confirm('Suhbat yopilsinmi? Berilgan javoblar saqlanib qoladi.') && act('close', () => briefClose(id), () => router.refresh())}
          >
            Yopish
          </button>
        ) : null}
      </div>
      {link ? (
        <div className="rounded-[14px] border border-[#d4fc18]/25 bg-[#d4fc18]/[0.06] p-3 text-[12.5px] text-[#d9d9de]">
          <p className="mb-1.5 text-[#a8a8ac]">Bir martalik havola (12 soat). Uni faqat mijoz qurilmasida oching; eski havola endi ishlamaydi.</p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="h-9 min-w-0 flex-1 rounded-[10px] bg-black/40 px-3 text-[12px] text-white outline-none" />
            <button type="button" className={btn} onClick={() => void navigator.clipboard?.writeText(link).then(() => setMessage('Nusxa olindi.'))}>
              Nusxa
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-[12.5px] text-[#a8a8ac]">{message}</p> : null}
    </div>
  );
}

export function DeleteSession({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Suhbat, uning barcha javoblari va hisobotlari butunlay o‘chirilsinmi? Buni qaytarib bo‘lmaydi.')) return;
        setBusy(true);
        const r = await briefDelete(id).catch(() => ({ ok: false as const, message: 'Aloqa uzildi.' }));
        setBusy(false);
        if (r.ok) router.push('/tahlil?bolim=tarix');
        else alert(r.message);
      }}
      className="h-10 rounded-full border border-[#ff8a8a]/30 px-4 text-[13px] text-[#ff9c9c] transition-colors hover:bg-[#ff8a8a]/10 disabled:opacity-50 print:hidden"
    >
      O‘chirish
    </button>
  );
}

/** Checks, without generating anything, that the configured OpenAI models are usable with the server's key. */
export function AiStatusButton() {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await briefAiStatus().catch(() => null);
          setBusy(false);
          if (!r) return setLines(['Tekshirib bo‘lmadi.']);
          if (!r.configured) return setLines(['OPENAI_API_KEY serverda o‘rnatilmagan.']);
          setLines(r.models.map((m) => `${m.purpose === 'question' ? 'Savollar' : 'Tahlil'}: ${m.model} — ${m.ok ? 'mavjud' : m.message}`));
        }}
        className="rounded-full border border-white/12 px-4 py-1.5 text-[#d9d9de] transition-colors hover:border-[#d4fc18]/50 hover:text-[#d4fc18] disabled:opacity-50"
      >
        {busy ? 'Tekshirilmoqda…' : 'AI modellarini tekshirish'}
      </button>
      {lines ? (
        <span className="text-right text-[12px] text-[#a8a8ac]">
          {lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
