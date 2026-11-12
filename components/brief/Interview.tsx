'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Logo } from '@/components/brand/Logo';
import { interviewAnswer, interviewBack, interviewBegin, interviewFinish, interviewForward } from '@/lib/actions/brief-client';
import { kioskUnlock } from '@/lib/actions/brief-kiosk';
import type { ClientView } from '@/lib/brief/server';
import type { AnswerValue } from '@/lib/brief/types';

const EASE = [0.22, 1, 0.36, 1] as const;
const OTHER = 'other';

type Draft = { choice: string[]; other: string; text: string; number: string };
const emptyDraft: Draft = { choice: [], other: '', text: '', number: '' };
const draftOf = (v: AnswerValue | null): Draft =>
  v ? { choice: v.choice ?? [], other: v.other ?? '', text: v.text ?? '', number: v.number !== undefined ? String(v.number) : '' } : emptyDraft;

/**
 * The client's interview: one question per screen, large targets, keyboard (1–9 to pick, Enter to continue), every
 * answer saved on the server as it is given. Nothing here knows about other clients, the manager's notes or the
 * analysis — the server sends one screen at a time.
 */
export function Interview({ initial, kiosk }: { initial: ClientView; kiosk: boolean }) {
  const [view, setView] = useState<ClientView>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlock, setUnlock] = useState(false);

  const run = useCallback(async (fn: () => Promise<ClientView>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setView(next);
      if ('notice' in next && next.notice) setError(next.notice);
    } catch {
      setError('Aloqa uzildi — javob saqlanmadi. Internetni tekshirib, qayta bosing.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-hidden px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(212_252_24/0.08),transparent_70%)]" />
      <header className="relative z-10 mx-auto flex w-full max-w-[920px] items-center justify-between py-3 sm:py-5">
        <Logo width={104} onDark compact />
        {view.screen === 'question' ? (
          <p className="text-[12.5px] tracking-wide text-[#8e8e96]">
            {view.progress.stage} · {view.progress.stageIndex + 1}/{view.progress.stages}
          </p>
        ) : null}
      </header>
      {view.screen === 'question' ? (
        <div className="relative z-10 mx-auto w-full max-w-[920px]" aria-hidden>
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-[#d4fc18] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${view.progress.percent}%` }} />
          </div>
        </div>
      ) : null}

      <section className="relative z-10 mx-auto flex w-full max-w-[920px] flex-1 flex-col justify-center py-6 sm:py-10">
        <AnimatePresence mode="wait" initial={false}>
          <Screen key={view.screen === 'question' ? `q:${view.question.key}` : view.screen} view={view} busy={busy} error={error} run={run} />
        </AnimatePresence>
      </section>

      {kiosk ? (
        <footer className="relative z-10 mx-auto flex w-full max-w-[920px] justify-end">
          <button type="button" onClick={() => setUnlock(true)} className="rounded-full px-3 py-1.5 text-[12px] text-[#5e5e66] transition-colors hover:text-[#a8a8ac]">
            Menejer uchun
          </button>
        </footer>
      ) : null}
      {unlock ? <UnlockDialog onClose={() => setUnlock(false)} /> : null}
    </main>
  );
}

function Screen({ view, busy, error, run }: { view: ClientView; busy: boolean; error: string | null; run: (fn: () => Promise<ClientView>) => Promise<void> }) {
  const reduce = useReducedMotion();
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.4, ease: EASE } };

  return (
    <motion.div {...motionProps}>
      {view.screen === 'welcome' ? <Welcome busy={busy} error={error} onStart={() => run(interviewBegin)} /> : null}
      {view.screen === 'question' ? <QuestionScreen view={view} busy={busy} error={error} run={run} /> : null}
      {view.screen === 'review' ? <Review view={view} busy={busy} error={error} run={run} /> : null}
      {view.screen === 'done' ? <Done /> : null}
      {view.screen === 'closed' ? <Closed reason={view.reason} /> : null}
    </motion.div>
  );
}

function Welcome({ busy, error, onStart }: { busy: boolean; error: string | null; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-[640px] text-center">
      <p className="mb-5 inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">
        <span className="s-pulse-dot size-1.5 rounded-full bg-[#d4fc18]" /> SUN MEDIA
      </p>
      <h1 className="font-display text-[34px] leading-[1.08] font-medium tracking-tight sm:text-[48px]">
        <span className="s-silver">Biznesingizni yaqindan bilib olaylik.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-relaxed text-[#a8a8ac] sm:text-[17px]">
        Bir nechta savolga javob bering. Bu bizga biznesingizni, maqsadlaringizni va siz kutayotgan natijalarni yaxshiroq tushunishga yordam beradi.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          // Full screen for the client (needs this click); harmless where the browser refuses.
          void document.documentElement.requestFullscreen?.().catch(() => undefined);
          onStart();
        }}
        className="s-btn s-btn-lime mt-9 h-14 px-10 text-[16px] disabled:opacity-60"
      >
        {busy ? 'Ochilmoqda…' : 'Boshlash'}
      </button>
      {error ? <ErrorLine text={error} /> : null}
      <p className="mx-auto mt-10 max-w-[480px] text-[12.5px] leading-relaxed text-[#6e6e76]">
        Javoblaringiz faqat SUN MEDIA jamoasiga ko‘rinadi va sizga mos taklif tayyorlash uchun ishlatiladi. Shaxsiy hujjat, parol yoki sog‘liq haqidagi ma’lumot so‘ralmaydi. Har
        bir savolga “Bilmayman” deb javob berishingiz mumkin.
      </p>
    </div>
  );
}

function QuestionScreen({
  view,
  busy,
  error,
  run,
}: {
  view: Extract<ClientView, { screen: 'question' }>;
  busy: boolean;
  error: string | null;
  run: (fn: () => Promise<ClientView>) => Promise<void>;
}) {
  const q = view.question;
  const original = useMemo(() => draftOf(view.value), [view.value]);
  const [draft, setDraft] = useState<Draft>(original);
  const heading = useRef<HTMLHeadingElement>(null);
  const multi = q.type === 'multi' || q.type === 'rank';
  const max = q.max ?? q.options.length + 1;
  const options = useMemo(() => (q.allowOther && !q.options.some((o) => o.key === OTHER) ? [...q.options, { key: OTHER, label: 'Boshqa' }] : q.options), [q]);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const toggle = useCallback(
    (key: string) => {
      setDraft((d) => {
        if (!multi) return { ...d, choice: [key] };
        const exclusive = options.find((o) => o.key === key && 'exclusive' in o && o.exclusive);
        if (d.choice.includes(key)) return { ...d, choice: d.choice.filter((k) => k !== key) };
        if (exclusive) return { ...d, choice: [key] };
        const kept = d.choice.filter((k) => !options.find((o) => o.key === k && 'exclusive' in o && o.exclusive));
        return kept.length >= max ? d : { ...d, choice: [...kept, key] };
      });
    },
    [multi, max, options],
  );

  const valid =
    q.type === 'text'
      ? draft.text.trim().length >= 2
      : q.type === 'number'
        ? draft.number.trim() !== '' && Number.isFinite(Number(draft.number))
        : draft.choice.length > 0 && (!draft.choice.includes(OTHER) || q.options.some((o) => o.key === OTHER) || draft.other.trim().length >= 2);

  const valueOf = (): AnswerValue =>
    q.type === 'text'
      ? { text: draft.text }
      : q.type === 'number'
        ? { number: Number(draft.number) }
        : { choice: draft.choice, ...(draft.choice.includes(OTHER) ? { other: draft.other } : {}) };

  const unchanged = !!view.value && JSON.stringify(draft) === JSON.stringify(original);
  const submit = () => {
    if (busy || !valid) return;
    if (unchanged) return void run(() => interviewForward(view.revision));
    void run(() => interviewAnswer({ key: q.key, revision: view.revision, value: valueOf() }));
  };
  const special = (value: AnswerValue) => void run(() => interviewAnswer({ key: q.key, revision: view.revision, value }));

  // Keyboard: 1–9 pick an option, Enter continues (Cmd/Ctrl+Enter inside a text box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (e.key === 'Enter' && (!typing || e.metaKey || e.ctrlKey || target?.tagName === 'INPUT')) {
        e.preventDefault();
        submit();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, options.length)) toggle(options[n - 1].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const titleId = `q-${q.key}`;
  return (
    <div>
      <h1 ref={heading} id={titleId} tabIndex={-1} className="font-display text-[26px] leading-[1.15] font-medium tracking-tight outline-none sm:text-[36px]">
        {q.text}
      </h1>
      {q.description ? <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-[#a8a8ac]">{q.description}</p> : null}
      {multi && !q.description ? (
        <p className="mt-3 text-[14px] text-[#8e8e96]">{q.type === 'rank' ? `Muhimlik tartibida ${max} tagacha tanlang.` : `Bir nechtasini tanlashingiz mumkin${max < options.length ? ` (${max} tagacha)` : ''}.`}</p>
      ) : null}

      <div className="mt-8">
        {q.type === 'text' ? (
          <textarea
            aria-labelledby={titleId}
            value={draft.text}
            maxLength={q.max ?? 500}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            rows={q.max && q.max <= 160 ? 2 : 4}
            autoFocus
            placeholder="Shu yerga yozing…"
            className="lg w-full resize-none rounded-[22px] px-5 py-4 text-[17px] leading-relaxed text-[#f4f4f5] placeholder:text-[#5e5e66] focus:outline-none focus-visible:shadow-[0_0_0_2px_#d4fc18]"
          />
        ) : q.type === 'number' ? (
          <input
            aria-labelledby={titleId}
            inputMode="numeric"
            value={draft.number}
            onChange={(e) => setDraft({ ...draft, number: e.target.value.replace(/[^\d]/g, '').slice(0, 9) })}
            autoFocus
            className="lg h-16 w-full max-w-[320px] rounded-[22px] px-5 text-[22px] text-[#f4f4f5] focus:outline-none focus-visible:shadow-[0_0_0_2px_#d4fc18]"
          />
        ) : (
          <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={titleId} className={`grid gap-3 ${options.length > 4 ? 'sm:grid-cols-2' : ''}`}>
            {options.map((o, i) => {
              const on = draft.choice.includes(o.key);
              const rank = q.type === 'rank' && on ? draft.choice.indexOf(o.key) + 1 : null;
              return (
                <button
                  key={o.key}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  onClick={() => toggle(o.key)}
                  className={`group relative flex min-h-[64px] items-center gap-4 rounded-[20px] border px-5 py-4 text-left transition-[border-color,background-color,transform] duration-300 active:scale-[0.99] ${
                    on ? 'border-[#d4fc18]/70 bg-[#d4fc18]/[0.09]' : 'border-white/[0.08] bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center border text-[12px] font-semibold transition-colors ${
                      on ? 'border-[#d4fc18] bg-[#d4fc18] text-[#0b0b0c]' : 'border-white/20 text-[#8e8e96]'
                    } ${multi && q.type !== 'rank' ? 'rounded-[8px]' : 'rounded-full'}`}
                  >
                    {rank ?? (on ? '✓' : i < 9 ? i + 1 : '')}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16px] leading-snug text-[#f4f4f5] sm:text-[17px]">{o.label}</span>
                    {'hint' in o && o.hint ? <span className="mt-0.5 block text-[13px] text-[#8e8e96]">{o.hint}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {draft.choice.includes(OTHER) && !q.options.some((o) => o.key === OTHER) ? (
          <input
            aria-label="Boshqa — qisqacha yozing"
            value={draft.other}
            maxLength={300}
            onChange={(e) => setDraft({ ...draft, other: e.target.value })}
            autoFocus
            placeholder="Qisqacha yozing…"
            className="lg mt-3 h-14 w-full rounded-[18px] px-5 text-[16px] text-[#f4f4f5] placeholder:text-[#5e5e66] focus:outline-none focus-visible:shadow-[0_0_0_2px_#d4fc18]"
          />
        ) : null}
      </div>

      {error ? <ErrorLine text={error} /> : null}

      <div className="mt-9 flex flex-wrap items-center gap-3">
        {view.canBack ? (
          <button type="button" disabled={busy} onClick={() => run(() => interviewBack(view.revision))} className="s-btn h-12 px-5 text-[#a8a8ac] hover:text-white disabled:opacity-50">
            ← Orqaga
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {q.allowUnknown ? (
            <button type="button" disabled={busy} onClick={() => special({ unknown: true })} className="h-12 rounded-full border border-white/12 px-5 text-[14px] text-[#d9d9de] transition-colors hover:border-white/30 disabled:opacity-50">
              Bilmayman
            </button>
          ) : null}
          {q.allowNone ? (
            <button type="button" disabled={busy} onClick={() => special({ none: true })} className="h-12 rounded-full border border-white/12 px-5 text-[14px] text-[#d9d9de] transition-colors hover:border-white/30 disabled:opacity-50">
              Hozircha mavjud emas
            </button>
          ) : null}
          {!q.required ? (
            <button type="button" disabled={busy} onClick={() => special({ skipped: true })} className="h-12 rounded-full px-4 text-[14px] text-[#8e8e96] transition-colors hover:text-white disabled:opacity-50">
              O‘tkazib yuborish
            </button>
          ) : null}
          <button type="button" disabled={busy || !valid} onClick={submit} className="s-btn s-btn-lime h-12 px-8 disabled:opacity-40 disabled:shadow-none">
            {busy ? 'Saqlanmoqda…' : 'Davom etish'}
          </button>
        </div>
      </div>
      <p className="mt-5 text-[12px] text-[#5e5e66]">Har bir javob darhol saqlanadi. Klaviatura: 1–9 — tanlash, Enter — davom etish.</p>
    </div>
  );
}

function Review({ view, busy, error, run }: { view: Extract<ClientView, { screen: 'review' }>; busy: boolean; error: string | null; run: (fn: () => Promise<ClientView>) => Promise<void> }) {
  return (
    <div className="mx-auto max-w-[620px] text-center">
      <h1 className="font-display text-[30px] leading-tight font-medium tracking-tight sm:text-[40px]">
        <span className="s-silver">Savollar shu yerda tugadi.</span>
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-[#a8a8ac]">{view.answered} ta savolga javob berdingiz. Yuborishdan oldin istalgan javobga qaytib, uni o‘zgartirishingiz mumkin.</p>
      {error ? <ErrorLine text={error} /> : null}
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        {view.canBack ? (
          <button type="button" disabled={busy} onClick={() => run(() => interviewBack(view.revision))} className="s-btn h-14 px-6 text-[#a8a8ac] hover:text-white disabled:opacity-50">
            ← Javoblarga qaytish
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => run(() => interviewFinish(view.revision))} className="s-btn s-btn-lime h-14 px-10 text-[16px] disabled:opacity-60">
          {busy ? 'Yuborilmoqda…' : 'Javoblarni yuborish'}
        </button>
      </div>
    </div>
  );
}

function Done() {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-[620px] text-center">
      <svg viewBox="0 0 96 96" className="mx-auto size-24" aria-hidden>
        <circle cx="48" cy="48" r="44" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="2" />
        <motion.circle
          cx="48"
          cy="48"
          r="44"
          fill="none"
          stroke="#d4fc18"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
        <motion.path
          d="M31 49 l11 11 l23 -25"
          fill="none"
          stroke="#d4fc18"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: reduce ? 0 : 0.9, ease: EASE }}
        />
      </svg>
      <h1 className="font-display mt-8 text-[44px] leading-none font-medium tracking-tight sm:text-[56px]">
        <span className="s-silver">Rahmat!</span>
      </h1>
      <p className="mt-5 text-[18px] text-[#f4f4f5]">Javoblaringiz muvaffaqiyatli qabul qilindi.</p>
      <p className="mx-auto mt-3 max-w-[480px] text-[15.5px] leading-relaxed text-[#a8a8ac]">Biznesingiz va maqsadlaringizni yaxshiroq tushunishimizga yordam berganingiz uchun tashakkur.</p>
    </div>
  );
}

function Closed({ reason }: { reason: 'invalid' | 'expired' | 'rate' }) {
  return (
    <div className="mx-auto max-w-[560px] text-center">
      <h1 className="font-display text-[28px] leading-tight font-medium tracking-tight sm:text-[34px]">
        <span className="s-silver">{reason === 'rate' ? 'Bir daqiqa kuting' : 'Suhbat yakunlangan'}</span>
      </h1>
      <p className="mt-4 text-[15.5px] leading-relaxed text-[#a8a8ac]">
        {reason === 'rate'
          ? 'Juda tez-tez bosildi. Bir daqiqadan so‘ng sahifani yangilang — javoblaringiz saqlangan.'
          : 'Bu suhbat yakunlangan yoki havolaning muddati tugagan. Savollaringiz bo‘lsa, SUN MEDIA menejeriga murojaat qiling.'}
      </p>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" aria-live="polite" className="mt-5 rounded-[14px] border border-[#f87171]/25 bg-[#f87171]/[0.08] px-4 py-3 text-[14px] text-[#fca5a5]">
      {text}
    </p>
  );
}

/** The manager leaves client mode with their own password; the client cannot. */
function UnlockDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await kioskUnlock(password);
      if (r.ok) {
        void document.exitFullscreen?.().catch(() => undefined);
        window.location.assign('/tahlil');
        return;
      }
      setError(r.message);
    } catch {
      setError('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setBusy(false);
      setPassword('');
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="unlock-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="lg lg-strong w-full max-w-[400px] rounded-[26px] p-6"
      >
        <p id="unlock-title" className="font-display text-[20px] font-medium">
          Menejer rejimi
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#a8a8ac]">Mijoz rejimidan chiqish uchun SUN MEDIA akkauntingiz parolini kiriting.</p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Parol"
          className="mt-4 h-12 w-full rounded-[14px] border border-white/12 bg-[#0b0b0c] px-4 text-[15px] text-white outline-none focus:border-[#d4fc18]"
        />
        {error ? <p className="mt-3 text-[13px] text-[#fca5a5]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-full px-4 text-[14px] text-[#a8a8ac] hover:text-white">
            Bekor qilish
          </button>
          <button type="submit" disabled={busy || !password} className="s-btn s-btn-lime h-11 px-6 disabled:opacity-50">
            {busy ? 'Tekshirilmoqda…' : 'Chiqish'}
          </button>
        </div>
      </form>
    </div>
  );
}
