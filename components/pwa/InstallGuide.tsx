'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { currentDevice, isApple, type Device } from '@/lib/pwa/client';

export type Tone = 'panel' | 'dark';

/** The browser's own install dialog (Chrome, Edge, Android), kept by PwaRuntime; null where the browser has none. */
function useInstallPrompt() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const sync = () => setCan(!!window.__smInstall);
    sync();
    window.addEventListener('sm:installable', sync);
    return () => window.removeEventListener('sm:installable', sync);
  }, []);
  return can;
}

const Share = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Ulashish belgisi" className="inline -mt-0.5">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

/** The steps for this very device and browser; never a made-up dialog. */
function steps(d: Device): { title: string; items: ReactNode[] } {
  if (isApple(d)) {
    const where = d.browser === 'safari' ? 'Safari pastki (iPad’da yuqori) panelidagi' : 'brauzer manzil satri yoki menyusidagi';
    return {
      title: d.platform === 'ipados' ? 'iPad’ga o‘rnatish' : 'iPhone’ga o‘rnatish',
      items: [
        <>
          {where} <b>Ulashish</b> <Share /> tugmasini bosing.
        </>,
        <>
          <b>«Bosh ekranga qo‘shish»</b> (Add to Home Screen) ni tanlang.
        </>,
        <>
          Nomi <b>Sun Media</b> bo‘lib turadi — <b>«Qo‘shish»</b> ni bosing.
        </>,
        <>Bosh ekrandagi Sun Media belgisidan ilovani oching.</>,
        <>Ilova ichida bildirishnomalarni yoqing (shu sahifada).</>,
      ],
    };
  }
  if (d.platform === 'android') {
    return {
      title: 'Android’ga o‘rnatish',
      items:
        d.browser === 'firefox'
          ? [<>Firefox menyusini (⋮) oching.</>, <><b>«O‘rnatish»</b> yoki <b>«Bosh ekranga qo‘shish»</b> ni tanlang.</>, <>Sun Media belgisidan oching va bildirishnomalarni yoqing.</>]
          : [<>Brauzer menyusini (⋮) oching.</>, <><b>«Ilovani o‘rnatish»</b> (Install app) ni tanlang.</>, <>Ilovalar ro‘yxatidagi Sun Media’dan oching va bildirishnomalarni yoqing.</>],
    };
  }
  if (d.platform === 'mac' && d.browser === 'safari') {
    return { title: 'Mac’ga o‘rnatish', items: [<>Menyuda <b>Fayl → Dock’ga qo‘shish</b> (File → Add to Dock) ni tanlang.</>, <>Dock’dagi Sun Media’dan oching.</>] };
  }
  if (d.browser === 'firefox') {
    return { title: 'Kompyuterga o‘rnatish', items: [<>Firefox ilova o‘rnatishni qo‘llab-quvvatlamaydi. Sun Media’ni Chrome, Edge yoki Safari’da oching.</>] };
  }
  return {
    title: d.platform === 'mac' ? 'Mac’ga o‘rnatish' : 'Kompyuterga o‘rnatish',
    items: [<>Manzil satrining o‘ng tomonidagi <b>o‘rnatish</b> belgisini bosing (yoki menyu → <b>«Sun Media’ni o‘rnatish»</b>).</>, <>Sun Media alohida oynada, o‘z belgisi bilan ochiladi.</>],
  };
}

/** "Ilovani o‘rnatish": the system dialog where there is one, otherwise the steps for this device. */
export function InstallSteps({ tone = 'panel' }: { tone?: Tone }) {
  const [device, setDevice] = useState<Device | null>(null);
  const canPrompt = useInstallPrompt();
  const [asked, setAsked] = useState(false);
  useEffect(() => setDevice(currentDevice()), []);
  if (!device) return null;
  const muted = tone === 'dark' ? 'text-[#a8a8ac]' : 'text-muted';

  if (device.standalone) return <p className={`text-[13.5px] ${muted}`}>✓ Sun Media ilova sifatida o‘rnatilgan va shu oynada ochiq.</p>;
  if (canPrompt) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={asked}
          onClick={async () => {
            const e = window.__smInstall;
            if (!e) return;
            setAsked(true);
            await e.prompt();
            await e.userChoice.catch(() => undefined);
            window.__smInstall = null;
            window.dispatchEvent(new Event('sm:installable'));
            setAsked(false);
          }}
          className={tone === 'dark' ? 's-btn s-btn-lime' : 'inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60'}
        >
          Ilovani o‘rnatish
        </button>
        <p className={`text-[12.5px] ${muted}`}>Brauzerning o‘z oynasi ochiladi — «O‘rnatish» ni tasdiqlang.</p>
      </div>
    );
  }
  const s = steps(device);
  return (
    <div>
      <p className="text-[13.5px] font-semibold">{s.title}</p>
      <ol className={`mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed ${muted}`}>
        {s.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
      {isApple(device) && (device.iosVersion ?? 99) < 16.4 ? (
        <p className="mt-2 text-[12.5px] text-[#f5b14c]">Bildirishnomalar uchun iOS 16.4 yoki yangisi kerak: telefoningizni yangilang.</p>
      ) : null}
    </div>
  );
}

const DISMISS_KEY = 'sm:install-dismissed';
const HOMES = ['/panel', '/xodim', '/kabinet'];

/**
 * A small, dismissible suggestion on the home page of each area (never over a chat or a form): install the app. Gone
 * once installed, and for two weeks after "×".
 */
export function InstallBanner({ tone = 'panel' }: { tone?: Tone }) {
  const path = usePathname() ?? '';
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!HOMES.includes(path)) return setShow(false);
    const d = currentDevice();
    let dismissed = 0;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      // storage blocked: shown again next time
    }
    if (d.standalone || Date.now() - dismissed < 14 * 86_400_000) return setShow(false);
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [path]);
  if (!show) return null;
  const dark = tone === 'dark';
  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setShow(false);
  };
  return (
    <aside
      aria-label="Ilovani o‘rnatish"
      // Phones: under the header, clear of Sunny and the chat input at the bottom; computers: bottom left.
      className={`fixed inset-x-4 top-[76px] z-[70] rounded-2xl border p-4 shadow-2xl sm:inset-x-auto sm:top-auto sm:bottom-4 sm:left-4 sm:w-[360px] ${dark ? 'border-white/10 bg-[#0d0d0f]/95 text-white backdrop-blur' : 'border-line bg-surface text-ink'}`}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pwa/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Sun Media ilovasini o‘rnating</p>
          <p className={`mt-0.5 text-[12.5px] leading-snug ${dark ? 'text-[#a8a8ac]' : 'text-muted'}`}>Bosh ekrandan bir bosishda ochiladi va yangi xabarlar haqida bildirishnoma keladi.</p>
        </div>
        <button type="button" onClick={close} aria-label="Yopish" className={`-mt-1 -mr-1 grid size-8 place-items-center rounded-full ${dark ? 'text-[#8e8e96] hover:bg-white/[0.06]' : 'text-muted hover:bg-surface-2'}`}>
          ×
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          <InstallSteps tone={tone} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`mt-3 text-[13px] font-semibold ${dark ? 'text-[#d4fc18]' : 'text-accent'}`}>
          Qanday o‘rnatiladi →
        </button>
      )}
    </aside>
  );
}
