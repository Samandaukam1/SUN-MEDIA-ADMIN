'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Logo } from '@/components/brand/Logo';
import type { BudgetOption } from '@/lib/site/types';
import { ApplicationForm, type FormLabels } from './ApplicationForm';
import { SiteIcon } from './SiteIcon';

const EASE = [0.22, 1, 0.36, 1] as const;
const TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;
const FAIL = 'Arizani yuborishda xatolik yuz berdi. Iltimos, qayta urinib ko‘ring.';
/** This tab already sent an application (a refresh shows the confirmation, never the form for a second send). */
const SENT = 'ariza:sent';
/** The automatic return was already tried once: coming back here never starts it again (no loops). */
const BACK = 'ariza:back';
const SENT_FOR = 30 * 60_000;

const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // private mode: the page still works, it just forgets
    }
  },
};

type Origin = { attribution: Record<string, string>; fromInstagram: boolean; inApp: boolean };

/** The ad link's real tracking values and whether the visitor came from Instagram/Meta (nothing is assumed). */
function readOrigin(): Origin {
  const params = new URLSearchParams(location.search);
  const attribution: Record<string, string> = {};
  for (const key of TRACKING) {
    const value = params.get(key)?.trim();
    if (value) attribution[key] = value.slice(0, key === 'fbclid' ? 512 : 200);
  }
  const inApp = /Instagram/i.test(navigator.userAgent);
  const source = (attribution.utm_source ?? '').toLowerCase();
  const fromInstagram =
    inApp || /^(ig|instagram|fb|facebook|meta)$/.test(source) || !!attribution.fbclid || /(^|\.)(instagram|facebook)\.com$/i.test(referrerHost());
  return { attribution, fromInstagram, inApp };
}
function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    return '';
  }
}

/**
 * The page an Instagram / Meta ad opens: the site's own application form; after the server confirmed the application,
 * a confirmation with a 3-second countdown and the best return to Instagram the platform allows — closing Instagram's
 * own browser (back to the ad), or Sun Media's Instagram in another browser — and a button that always stays: a website
 * cannot force the Instagram app to reopen.
 */
export function AdLanding({ labels, budgets, instagram }: { labels: FormLabels; budgets: BudgetOption[]; instagram: string }) {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setOrigin(readOrigin());
    const at = Number(session.get(SENT));
    if (at && Date.now() - at < SENT_FOR) setSent(true);
  }, []);

  const onSuccess = useCallback(() => {
    session.set(SENT, String(Date.now()));
    setSent(true);
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-x-hidden px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(212_252_24/0.10),transparent_70%)]" />
      <header className="relative z-10 flex w-full max-w-[600px] justify-center py-4 sm:py-6">
        <Logo width={112} onDark compact />
      </header>
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="lg lg-strong relative z-10 w-full max-w-[600px] rounded-[28px] px-5 pt-7 pb-6 sm:rounded-[32px] sm:px-9 sm:pt-9 sm:pb-8"
      >
        {sent ? (
          <Confirmation fromInstagram={!!origin?.fromInstagram} inApp={!!origin?.inApp} instagram={instagram} />
        ) : (
          <>
            <div className="mb-7">
              <p className="mb-3 inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] text-[#d4fc18] uppercase">
                <span className="s-pulse-dot size-1.5 rounded-full bg-[#d4fc18]" /> SUN MEDIA
              </p>
              <h1 className="font-display text-[28px] leading-tight font-medium tracking-tight sm:text-[34px]">
                <span className="s-silver">{labels.form_title}</span>
              </h1>
              {labels.form_subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-[#a8a8ac]">{labels.form_subtitle}</p> : null}
            </div>
            <ApplicationForm labels={labels} budgets={budgets} source="/ariza" attribution={origin?.attribution ?? {}} onSuccess={onSuccess} failMessage={FAIL} />
          </>
        )}
      </motion.section>
    </main>
  );
}

function Confirmation({ fromInstagram, inApp, instagram }: { fromInstagram: boolean; inApp: boolean; instagram: string }) {
  const reduce = useReducedMotion();
  // An automatic return only for a visitor who came from Instagram/Meta, and only once per tab.
  const [auto] = useState(() => fromInstagram && session.get(BACK) !== '1');
  const [left, setLeft] = useState(3);
  const [hint, setHint] = useState(false);
  const tried = useRef(false);

  const goBack = useCallback(
    (manual: boolean) => {
      session.set(BACK, '1');
      if (inApp) {
        // Instagram's own browser: closing it returns to the ad. Its history is not used — the entry before this page
        // may be Instagram's link redirect (a loop) or nothing at all. Where the app keeps its browser open, the ✕ at the
        // top does it, and the button opens Sun Media's Instagram (the app takes instagram.com links itself).
        if (manual) return location.assign(instagram);
        window.close();
        setTimeout(() => setHint(true), 700);
        return;
      }
      // Another browser: Instagram's own address (the app opens it where the phone allows). The address is fixed on the
      // server, never taken from the link; nothing the person typed goes with it.
      if (manual) location.assign(instagram);
      else location.replace(instagram);
    },
    [inApp, instagram],
  );

  useEffect(() => {
    if (!auto) return;
    if (left <= 0) {
      if (!tried.current) {
        tried.current = true;
        goBack(false);
      }
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [auto, left, goBack]);

  return (
    <div className="flex flex-col items-center py-6 text-center sm:py-8" role="status" aria-live="polite">
      <motion.div
        initial={reduce ? false : { scale: 0.5, rotate: -25, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 17 }}
        className="mb-7 grid size-20 place-items-center rounded-[26px] bg-[#d4fc18] text-[#0b0b0c] shadow-[0_20px_60px_-10px_rgb(212_252_24/0.55)]"
      >
        <SiteIcon name="check" size={34} strokeWidth={2.4} />
      </motion.div>
      <h1 className="font-display text-[22px] leading-tight font-medium tracking-tight uppercase sm:text-[26px]">
        <span className="s-silver">Arizangiz qabul qilindi!</span>
      </h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[#a8a8ac]">Siz bilan tez orada bog‘lanamiz.</p>

      {fromInstagram ? (
        <>
          {auto && left > 0 ? (
            <p className="mt-7 flex items-center gap-3 text-[14px] text-[#d9d9de]">
              <span className="grid size-9 place-items-center rounded-full border border-[#d4fc18]/50 font-display text-[15px] text-[#d4fc18] tabular" aria-hidden>
                {left}
              </span>
              <span>{left} soniyadan keyin Instagram’ga qaytasiz.</span>
            </p>
          ) : null}
          {hint ? <p className="mt-6 max-w-xs text-[13.5px] leading-relaxed text-[#a8a8ac]">Instagram’ga qaytish uchun ekran tepasidagi ✕ (Yopish) tugmasini bosing.</p> : null}
          <a
            href={instagram}
            onClick={(e) => {
              e.preventDefault();
              goBack(true);
            }}
            className="s-btn s-btn-lime mt-7 h-12 w-full max-w-xs justify-center"
          >
            <SiteIcon name="instagram" size={18} />
            <span>Instagram’ga qaytish</span>
          </a>
        </>
      ) : (
        <Link href="/" className="s-btn s-btn-glass mt-8 h-12 w-full max-w-xs justify-center">
          <span>Saytga qaytish</span>
        </Link>
      )}
    </div>
  );
}
