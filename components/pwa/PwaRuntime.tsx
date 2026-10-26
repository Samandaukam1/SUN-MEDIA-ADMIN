'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global {
  interface Window {
    /** Chrome / Edge / Android: the system's own install dialog, kept for the "Ilovani o‘rnatish" button. */
    __smInstall?: InstallEvent | null;
  }
}

/**
 * The installed app's runtime, on every page: registers the service worker, offers a new version with a button (never
 * reloads on its own while someone is working), shows when the connection is lost, opens pages a notification asks
 * for, and keeps the browser's install dialog for the app's own install button.
 */
export function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onInstallable = (e: Event) => {
      // No browser banner on its own: the app offers installing in its own words, where it makes sense.
      e.preventDefault();
      window.__smInstall = e as InstallEvent;
      window.dispatchEvent(new Event('sm:installable'));
    };
    const onInstalled = () => {
      window.__smInstall = null;
      window.dispatchEvent(new Event('sm:installable'));
    };
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let reloading = false;
    const sw = navigator.serviceWorker;
    const onMessage = (e: MessageEvent) => {
      const data = e.data ?? {};
      if (data.type === 'OPEN' && typeof data.url === 'string' && new URL(data.url, location.href).origin === location.origin) location.assign(data.url);
      if (data.type === 'PUSH') window.dispatchEvent(new CustomEvent('sm:push', { detail: data }));
    };
    // The new version took over (after "Yangilash"): load the page once with it.
    const onController = () => {
      if (reloading || !sessionStorage.getItem('sm:updating')) return;
      reloading = true;
      sessionStorage.removeItem('sm:updating');
      location.reload();
    };
    sw.addEventListener('message', onMessage);
    sw.addEventListener('controllerchange', onController);

    let stop = false;
    // One stable address: a new deployment changes the worker's bytes, which the browser's update check notices.
    sw.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        const offer = () => {
          if (!stop && reg.waiting && sw.controller) setWaiting(reg.waiting);
        };
        offer();
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => next.state === 'installed' && offer());
        });
        // An app left open for days still hears about new versions.
        const check = () => document.visibilityState === 'visible' && reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', check);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
      sw.removeEventListener('message', onMessage);
      sw.removeEventListener('controllerchange', onController);
    };
  }, []);

  if (!waiting && !offline) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      {offline ? (
        <p className="pointer-events-auto rounded-full border border-white/10 bg-[#141416]/95 px-4 py-2.5 text-[13px] text-[#f4f4f5] shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur">
          <span className="mr-2 inline-block size-2 rounded-full bg-[#ff8a8a] align-middle" />
          Internet yo‘q — hozir xabar yuborilmaydi, vazifa va davomat saqlanmaydi.
        </p>
      ) : waiting ? (
        <p className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[#141416]/95 py-2 pr-2 pl-4 text-[13px] text-[#f4f4f5] shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur">
          Ilovaning yangi versiyasi tayyor
          <button
            type="button"
            className="rounded-full bg-[#d4fc18] px-3.5 py-1.5 text-[13px] font-semibold text-[#050506]"
            onClick={() => {
              sessionStorage.setItem('sm:updating', '1');
              waiting.postMessage({ type: 'SKIP_WAITING' });
              setWaiting(null);
            }}
          >
            Yangilash
          </button>
        </p>
      ) : null}
    </div>
  );
}
