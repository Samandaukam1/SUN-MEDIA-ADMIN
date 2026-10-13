'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';

import { cabinetSession, cabinetSignIn, cabinetSignOut, type CabinetLoginState } from '@/lib/cabinet/actions';
import { SiteIcon } from './SiteIcon';

type Audience = 'staff' | 'partner';

const COPY: Record<Audience, { icon: string; title: string; text: string }> = {
  staff: { icon: 'team', title: 'Xodimlar kabinetiga kirish', text: 'SUN MEDIA jamoasi: vazifalar, loyihalar va boshqaruv.' },
  partner: { icon: 'chart', title: 'Hamkorlar kabinetiga kirish', text: 'Brendingiz natijalari, hisobotlari va loyiha jarayoni.' },
};

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The two footer entrances. Both open the same sign-in; which cabinet opens is decided by the server from the
 * account itself. `?kirish=xodim|hamkor` (sent by the server for private pages) opens the window on arrival.
 */
export function CabinetEntrances({ staffLabel }: { staffLabel: string }) {
  const [audience, setAudience] = useState<Audience | null>(null);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get('kirish');
    if (wanted !== 'xodim' && wanted !== 'hamkor') return;
    setNext(url.searchParams.get('next'));
    setAudience(wanted === 'xodim' ? 'staff' : 'partner');
    url.searchParams.delete('kirish');
    url.searchParams.delete('next');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);

  const button = 'text-[11px] tracking-[0.08em] text-[#6e6e76] uppercase transition-colors hover:text-[#d4fc18]';
  return (
    <>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => setAudience('staff')} className={button}>
          {staffLabel}
        </button>
        <span aria-hidden className="h-3 w-px bg-white/10" />
        <button type="button" onClick={() => setAudience('partner')} className={button}>
          Hamkorlar uchun
        </button>
      </div>
      <CabinetDialog
        audience={audience}
        next={next}
        onClose={() => {
          setAudience(null);
          setNext(null);
        }}
      />
    </>
  );
}

type Session = { name: string; to: string; area: string };

function CabinetDialog({ audience, next, onClose }: { audience: Audience | null; next: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'checking' | 'form' | Session>('checking');
  const [leaving, startLeaving] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const open = audience !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.__sunLenis?.stop();
      setView('checking');
      setFormKey((k) => k + 1);
      cabinetSession()
        .then((s) => setView(s ?? 'form'))
        .catch(() => setView('form'));
    }
    if (!open && dialog.open) dialog.close();
    if (!open) window.__sunLenis?.start();
  }, [open]);

  const copy = COPY[audience ?? 'staff'];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="cabinet-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[440px] overflow-visible bg-transparent p-0 text-[#f4f4f5]"
      data-lenis-prevent
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.55, ease: EASE }}
            className="lg lg-strong rounded-[32px] px-6 pt-8 pb-7 sm:px-9"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-[#a8a8ac] transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <SiteIcon name="close" size={18} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-white/[0.06] text-[#d4fc18] shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_40px_rgb(212_252_24/0.18)]">
                <SiteIcon name={copy.icon} size={26} strokeWidth={1.8} />
              </div>
              <h2 id="cabinet-title" className="font-display text-[21px] leading-snug font-medium tracking-tight">
                {copy.title}
              </h2>
              <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-[#a8a8ac]">{copy.text}</p>
            </div>

            {view === 'checking' ? (
              <div className="mt-8 flex justify-center py-10" aria-live="polite">
                <span className="size-6 animate-spin rounded-full border-2 border-[#d4fc18] border-t-transparent" />
                <span className="sr-only">Tekshirilmoqda…</span>
              </div>
            ) : view === 'form' ? (
              <LoginForm key={formKey} next={next} />
            ) : (
              <div className="mt-7 space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-center">
                  <p className="text-[13px] text-[#8e8e96]">Siz allaqachon kirgansiz</p>
                  <p className="mt-0.5 text-[15.5px] font-semibold break-words text-white">{view.name}</p>
                  <p className="mt-0.5 text-[13px] text-[#a8a8ac]">{view.area}</p>
                </div>
                <a href={view.to} className="s-btn s-btn-lime w-full">
                  Kabinetga o‘tish <SiteIcon name="arrowRight" size={18} />
                </a>
                <button
                  type="button"
                  disabled={leaving}
                  onClick={() =>
                    startLeaving(async () => {
                      await cabinetSignOut().catch(() => undefined);
                      setFormKey((k) => k + 1);
                      setView('form');
                    })
                  }
                  className="w-full py-2 text-[13.5px] text-[#a8a8ac] transition-colors hover:text-white disabled:opacity-60"
                >
                  {leaving ? 'Chiqilmoqda…' : 'Boshqa akkaunt bilan kirish'}
                </button>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}

function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState<CabinetLoginState, FormData>(cabinetSignIn, { status: 'idle' });
  const [show, setShow] = useState(false);
  const [wait, setWait] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ids = { email: useId(), password: useId(), error: useId() };
  const error = state.status === 'error' ? state : null;

  useEffect(() => {
    requestAnimationFrame(() => emailRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!error) return;
    setWait(error.retryAfter ?? 0);
    if (error.fieldErrors?.email) emailRef.current?.focus();
    else if (passwordRef.current) {
      passwordRef.current.value = '';
      passwordRef.current.focus();
    }
  }, [error]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const locked = wait > 0;
  const field =
    'h-[52px] w-full rounded-2xl border bg-white/[0.04] px-4 text-[15.5px] text-white outline-none transition-all duration-300 placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.14)] disabled:opacity-60';

  return (
    <form action={action} className="mt-7 space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor={ids.email} className="mb-1.5 block text-[13px] font-medium text-[#d9d9de]">
          Email (login)
        </label>
        <input
          ref={emailRef}
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={error?.email ?? ''}
          placeholder="ism@kompaniya.uz"
          disabled={pending}
          aria-invalid={!!error?.fieldErrors?.email}
          aria-describedby={error ? ids.error : undefined}
          className={`${field} ${error?.fieldErrors?.email ? 'border-[#ff8a8a]/60' : 'border-white/10'}`}
        />
        {error?.fieldErrors?.email ? <p className="mt-1.5 text-[12.5px] text-[#ff8a8a]">{error.fieldErrors.email}</p> : null}
      </div>
      <div>
        <label htmlFor={ids.password} className="mb-1.5 block text-[13px] font-medium text-[#d9d9de]">
          Parol
        </label>
        <div className="relative">
          <input
            ref={passwordRef}
            id={ids.password}
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            disabled={pending}
            aria-invalid={!!error?.fieldErrors?.password}
            className={`${field} pr-13 ${error?.fieldErrors?.password ? 'border-[#ff8a8a]/60' : 'border-white/10'}`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
            aria-pressed={show}
            className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-[#8e8e96] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <SiteIcon name={show ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
        {error?.fieldErrors?.password ? <p className="mt-1.5 text-[12.5px] text-[#ff8a8a]">{error.fieldErrors.password}</p> : null}
      </div>

      <div id={ids.error} className="min-h-[20px] text-[13px] leading-snug" aria-live="polite">
        {error && !error.fieldErrors ? (
          <p className="flex items-start gap-2 text-[#ff8a8a]">
            <SiteIcon name="alert" size={16} className="mt-px shrink-0" />
            <span>{locked ? error.message.replace(/\d+ daqiqa( \d+ soniya)?|\d+ soniya/, formatWait(wait)) : error.message}</span>
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending || locked} className="s-btn s-btn-lime w-full disabled:opacity-60">
        {pending ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-[#0b0b0c] border-t-transparent" /> Tekshirilmoqda…
          </>
        ) : locked ? (
          `Kuting · ${formatWait(wait)}`
        ) : (
          'Kirish'
        )}
      </button>
      <p className="text-center text-[12.5px] leading-relaxed text-[#6e6e76]">
        Login va parolni SUN MEDIA beradi. Parolni unutgan bo‘lsangiz, menejeringiz yoki administratorga murojaat qiling — yangi
        vaqtinchalik parol beriladi.
      </p>
    </form>
  );
}

function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} daqiqa ${String(s).padStart(2, '0')} soniya` : `${s} soniya`;
}
