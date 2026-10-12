'use client';

import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { gateShortcut, openGate, type GateResult } from '@/lib/site/actions';
import { SiteIcon } from './SiteIcon';

const LENGTH = 6;
const EASE = [0.22, 1, 0.36, 1] as const;

function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The small footer text. Signed-in staff go straight to the panel; everyone else is asked for the 6-digit code,
 * which the server checks (rate limited) before the login page opens.
 */
export function GateTrigger({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const to = await gateShortcut().catch(() => null);
            if (to) window.location.assign(to);
            else setOpen(true);
          })
        }
        className="text-[11px] tracking-[0.08em] text-[#4d4d54] uppercase transition-colors hover:text-[#a8a8ac] disabled:opacity-60"
      >
        {label}
      </button>
      <GateDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function GateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [result, setResult] = useState<GateResult | null>(null);
  const [wait, setWait] = useState(0);
  const [pending, start] = useTransition();
  const shake = useAnimationControls();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.__sunLenis?.stop();
      setDigits(Array(LENGTH).fill(''));
      setResult(null);
      requestAnimationFrame(() => inputs.current[0]?.focus());
    }
    if (!open && dialog.open) dialog.close();
    if (!open) window.__sunLenis?.start();
  }, [open]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const locked = wait > 0;
  const success = result?.status === 'open';

  const submit = (code: string) =>
    start(async () => {
      const r = await openGate(code).catch(() => ({ status: 'error', message: 'Serverga ulanib bo‘lmadi.' }) as GateResult);
      setResult(r);
      if (r.status === 'open') {
        setTimeout(() => window.location.assign(r.to), 650);
        return;
      }
      if (r.status === 'locked') setWait(r.retryAfter);
      setDigits(Array(LENGTH).fill(''));
      void shake.start({ x: [0, -12, 12, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
      requestAnimationFrame(() => inputs.current[0]?.focus());
    });

  const update = (next: string[]) => {
    setDigits(next);
    if (next.every((d) => d !== '') && !pending && !locked) submit(next.join(''));
  };

  const onChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }
    const next = [...digits];
    clean
      .slice(0, LENGTH - index)
      .split('')
      .forEach((d, i) => (next[index + i] = d));
    const focusAt = Math.min(LENGTH - 1, index + clean.length);
    inputs.current[focusAt]?.focus();
    update(next);
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      e.preventDefault();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const message = locked
    ? `Juda ko‘p urinish. ${formatWait(wait)} dan so‘ng qayta urinib ko‘ring.`
    : result?.status === 'invalid'
      ? result.remaining < 0
        ? '6 ta raqamni kiriting.'
        : result.remaining > 0
          ? `Kod noto‘g‘ri. Yana ${result.remaining} ta urinish bor.`
          : 'Kod noto‘g‘ri.'
      : result?.status === 'error'
        ? result.message
        : null;

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
      aria-labelledby="gate-title"
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
              <motion.div
                animate={success ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.5 }}
                className={`relative mb-5 grid size-16 place-items-center rounded-2xl ${
                  success ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.06] text-[#d4fc18]'
                } shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_40px_rgb(212_252_24/0.18)]`}
              >
                <SiteIcon name={success ? 'check' : 'lock'} size={26} strokeWidth={1.8} />
              </motion.div>
              <h2 id="gate-title" className="font-display text-[22px] font-medium tracking-tight">
                {success ? 'Kirish ochildi' : 'Xodimlar kirishi'}
              </h2>
              <p className="mt-2 text-[14px] text-[#a8a8ac]">
                {success ? 'Boshqaruv paneli ochilmoqda…' : '6 xonali kirish kodini kiriting'}
              </p>
            </div>

            <motion.div animate={shake} className="mt-7 flex justify-center gap-2 sm:gap-3">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => onChange(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  pattern="[0-9]*"
                  maxLength={LENGTH}
                  disabled={pending || locked || success}
                  aria-label={`${i + 1}-raqam`}
                  className={`font-display h-14 w-11 rounded-2xl border bg-white/[0.04] text-center text-[22px] font-medium text-white caret-[#d4fc18] outline-none transition-all duration-300 sm:h-16 sm:w-13 ${
                    success
                      ? 'border-[#d4fc18]/70 bg-[#d4fc18]/10'
                      : d
                        ? 'border-white/25 shadow-[0_0_0_4px_rgb(255_255_255/0.03)]'
                        : 'border-white/10'
                  } focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.14)] disabled:opacity-60`}
                />
              ))}
            </motion.div>

            <div className="mt-5 min-h-[22px] text-center text-[13px]" aria-live="polite">
              {pending && !success ? (
                <span className="inline-flex items-center gap-2 text-[#a8a8ac]">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-[#d4fc18] border-t-transparent" /> Tekshirilmoqda…
                </span>
              ) : message ? (
                <span className="text-[#ff8a8a]">{message}</span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}
