'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveScript, submitScript } from '@/lib/actions/workflow';
import { stageStatusLabel } from '@/lib/workflow-shared';

const TONE: Record<string, string> = {
  todo: 'bg-white/[0.06] text-[#d9d9de]',
  in_progress: 'bg-[#d4fc18]/14 text-[#d4fc18]',
  in_review: 'bg-sky-400/12 text-sky-300',
  revision: 'bg-[#ff8a8a]/12 text-[#ff9c9c]',
  done: 'bg-emerald-400/12 text-emerald-300',
};

/** The scriptwriter's desk: write, save, send to the Rahbar; locked while in review and once approved. */
export function ScriptEditor({ contentId, initial, status, reviewNote }: { contentId: string; initial: string; status: string; reviewNote: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const editable = ['todo', 'in_progress', 'revision'].includes(status);
  const dirty = text !== saved;

  const save = (send: boolean) =>
    start(async () => {
      setMessage(null);
      if (dirty || !send) {
        const res = await saveScript(contentId, text);
        if (!res.ok) return setMessage({ tone: 'error', text: res.message });
        setSaved(text);
      }
      if (send) {
        const res = await submitScript(contentId);
        if (!res.ok) return setMessage({ tone: 'error', text: res.message });
        setMessage({ tone: 'ok', text: 'Ssenariy Rahbarga yuborildi.' });
      } else {
        setMessage({ tone: 'ok', text: 'Saqlandi.' });
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold ${TONE[status] ?? TONE.todo}`}>{stageStatusLabel('script', status)}</span>
        <span className="text-[12.5px] text-[#8e8e96]">{text.length.toLocaleString('ru-RU')} / 20 000 belgi</span>
      </div>
      {status === 'revision' && reviewNote ? (
        <p className="rounded-2xl border border-[#ff8a8a]/30 bg-[#ff8a8a]/[0.07] px-4 py-3 text-[13.5px] text-[#ffc2c2]">Tuzatish kerak: {reviewNote}</p>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 20000))}
        readOnly={!editable}
        rows={16}
        placeholder="Kadrlar, matn, ovoz, musiqa…"
        aria-label="Ssenariy matni"
        className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 font-mono text-[14px] leading-relaxed text-white outline-none placeholder:text-[#5c5c64] read-only:opacity-80 focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.12)]"
      />
      {message ? <p className={`text-[13px] ${message.tone === 'ok' ? 'text-emerald-300' : 'text-[#ff8a8a]'}`}>{message.text}</p> : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !dirty} onClick={() => save(false)} className="s-btn s-btn-glass lg h-11 px-5 text-[14px] disabled:opacity-50">
            Saqlash
          </button>
          <button type="button" disabled={pending || !text.trim()} onClick={() => save(true)} className="s-btn s-btn-lime h-11 px-5 text-[14px] disabled:opacity-50">
            Rahbarga yuborish
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-[#8e8e96]">{status === 'in_review' ? 'Rahbar tekshirmoqda. Natija bildirishnoma bilan keladi.' : 'Ssenariy tasdiqlangan.'}</p>
      )}
    </div>
  );
}
