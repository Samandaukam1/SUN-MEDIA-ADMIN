/**
 * The browser side of the installed app: which device this is, whether it can install the app and receive push, and
 * turning push on and off for this device. Only standard APIs (Push API, Notifications API, service worker); the
 * subscription is stored on the server for the signed-in person (/api/push/subscription).
 */

export type Platform = 'ios' | 'ipados' | 'android' | 'mac' | 'windows' | 'other';
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';
export type Device = { platform: Platform; browser: Browser; standalone: boolean; iosVersion: number | null };

/** From the user agent (and touch support, which tells an iPad from a Mac). Pure, so it is tested. */
export function detectDevice(ua: string, { maxTouchPoints = 0, standalone = false } = {}): Device {
  const iosMatch = /OS (\d+)[._](\d+)/.exec(ua);
  const iPhone = /iPhone|iPod/.test(ua);
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const platform: Platform = iPhone ? 'ios' : iPad ? 'ipados' : /Android/.test(ua) ? 'android' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : 'other';
  const browser: Browser = /SamsungBrowser/.test(ua)
    ? 'samsung'
    : /Edg(A|iOS)?\//.test(ua)
      ? 'edge'
      : /Firefox|FxiOS/.test(ua)
        ? 'firefox'
        : /Chrome|CriOS|Chromium/.test(ua)
          ? 'chrome'
          : /Safari/.test(ua)
            ? 'safari'
            : 'other';
  const version = iosMatch ? Number(iosMatch[1]) + Number(iosMatch[2]) / 100 : null;
  // iPadOS reports a Mac user agent: its version is then the Safari version.
  const safariVersion = /Version\/(\d+)\.(\d+)/.exec(ua);
  const iosVersion = platform === 'ios' || platform === 'ipados' ? (version ?? (safariVersion ? Number(safariVersion[1]) + Number(safariVersion[2]) / 100 : null)) : null;
  return { platform, browser, standalone, iosVersion };
}

export function currentDevice(): Device {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectDevice(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints, standalone });
}

export const isApple = (d: Device) => d.platform === 'ios' || d.platform === 'ipados';

/** "iPhone · Safari", shown in the device list. */
export function deviceLabel(d: Device): string {
  const p = { ios: 'iPhone', ipados: 'iPad', android: 'Android', mac: 'Mac', windows: 'Windows', other: 'Qurilma' }[d.platform];
  const b = { safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet', other: 'brauzer' }[d.browser];
  return `${p} · ${d.standalone ? 'ilova' : b}`;
}

export type PushState =
  | { kind: 'unsupported'; why: 'api' | 'ios-old' }
  /** iPhone/iPad: push works only in the app added to the home screen (iOS 16.4+). */
  | { kind: 'install-first' }
  | { kind: 'not-ready' }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'on'; endpoint: string };

const supportsPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function config(): Promise<{ enabled: boolean; publicKey: string | null }> {
  try {
    const res = await fetch('/api/push/config', { cache: 'no-store' });
    return res.ok ? await res.json() : { enabled: false, publicKey: null };
  } catch {
    return { enabled: false, publicKey: null };
  }
}

const keyBytes = (b64url: string) => {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i]);

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

export async function pushState(): Promise<PushState> {
  const d = currentDevice();
  if (isApple(d) && !d.standalone) return (d.iosVersion ?? 0) >= 16.4 ? { kind: 'install-first' } : { kind: 'unsupported', why: 'ios-old' };
  if (!supportsPush()) return { kind: 'unsupported', why: 'api' };
  const cfg = await config();
  if (!cfg.enabled || !cfg.publicKey) return { kind: 'not-ready' };
  if (Notification.permission === 'denied') return { kind: 'denied' };
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return { kind: 'off' };
  // Keys changed on the server since this browser subscribed: subscribe again with the new one.
  if (!sameKey(sub.options.applicationServerKey, keyBytes(cfg.publicKey))) {
    await sub.unsubscribe().catch(() => undefined);
    return { kind: 'off' };
  }
  return { kind: 'on', endpoint: sub.endpoint };
}

/** Must run from a tap (browsers ask for permission only then). Never called on its own. */
export async function enablePush(): Promise<PushState> {
  const cfg = await config();
  if (!cfg.enabled || !cfg.publicKey) return { kind: 'not-ready' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? { kind: 'denied' } : { kind: 'off' };
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) }));
  const res = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), device: deviceLabel(currentDevice()) }),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => undefined);
    if (res.status === 503) return { kind: 'not-ready' };
    throw new Error((await res.json().catch(() => ({})))?.error ?? 'Saqlab bo‘lmadi');
  }
  return { kind: 'on', endpoint: sub.endpoint };
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return { kind: 'off' };
}
