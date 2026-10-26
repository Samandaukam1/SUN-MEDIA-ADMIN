/* SUN MEDIA — service worker of the installed web app (PWA).
 *
 * What it does, and nothing more:
 *  - shows Web Push notifications from the system (chat, tasks, content…) as real system notifications, with the
 *    app badge, and opens the right page on a click (an open window of the app is reused);
 *  - keeps the app's own static files (JS/CSS/fonts/icons, all versioned by Next.js) for fast starts;
 *  - shows a Sun Media offline page when there is no connection; public pages may be shown from their last copy.
 * Private pages, API answers, chat, tokens and anything signed-in are never stored: they always come from the network.
 * Served by app/sw.js/route.ts with `const VERSION = "<deployment>"` put in front, so every deployment changes the
 * worker's bytes: the browser's update check finds it (even in an app left open for days), installs it, and it takes
 * over only when the page asks (the "Yangilash" button), never in the middle of someone's work.
 */
/* global VERSION */
const STATIC = `sm-static-${VERSION}`;
const PAGES = `sm-pages-${VERSION}`;
const OFFLINE = '/offline.html';
const PUBLIC_PAGES = ['/', '/xizmatlar', '/keyslar', '/hamkorlar', '/tariflar', '/biz-haqimizda', '/aloqa'];
const PRECACHE = [OFFLINE, '/pwa/icon-192.png', '/pwa/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(PRECACHE)));
  // The very first worker starts at once (nothing to replace); later ones wait for the page's go-ahead.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES]);
      for (const name of await caches.keys()) if (name.startsWith('sm-') && !keep.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'BADGE') setBadge(data.count);
});

const isPublicPage = (url) => PUBLIC_PAGES.some((p) => url.pathname === p || (p !== '/' && url.pathname.startsWith(`${p}/`)));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Versioned build files never change: from the cache when there, otherwise fetched once and kept.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa/') || url.pathname.startsWith('/assistant/')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode !== 'navigate') return;
  // Pages: always the network. Without it, a public page's last copy, or the offline page.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        const cc = res.headers.get('Cache-Control') || '';
        if (res.ok && isPublicPage(url) && !/private|no-store/.test(cc)) {
          const cache = await caches.open(PAGES);
          cache.put(url.pathname, res.clone());
        }
        return res;
      } catch {
        if (isPublicPage(url)) {
          const copy = await caches.match(url.pathname, { cacheName: PAGES });
          if (copy) return copy;
        }
        return (await caches.match(OFFLINE, { cacheName: STATIC })) || new Response('Internet yo‘q', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })(),
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------------------------------------------
function setBadge(count) {
  const nav = self.navigator;
  try {
    if (typeof count === 'number' && count > 0) return nav.setAppBadge ? nav.setAppBadge(count) : undefined;
    return nav.clearAppBadge ? nav.clearAppBadge() : undefined;
  } catch {
    // the system may have badges turned off: not an error
  }
}

// Safari (iPhone, iPad, Mac) must show every push, or it stops delivering them; other browsers allow skipping one
// that the person is already looking at.
const mustShow = /Safari/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { title: 'Sun Media', body: event.data ? event.data.text() : '' };
  }
  const title = m.title || 'Sun Media';
  const url = m.url || '/app';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'PUSH', tag: m.tag, notificationType: m.type });
      if (typeof m.badge === 'number') await setBadge(m.badge);
      // The chat is open and in front of the person: the message is already on their screen.
      const room = typeof m.tag === 'string' && m.tag.startsWith('chat:') ? m.tag.slice(5) : null;
      const watching = room && windows.some((w) => w.focused && w.visibilityState === 'visible' && new URL(w.url).searchParams.get('xona') === room);
      if (watching && !mustShow) return;
      await self.registration.showNotification(title, {
        body: m.body || '',
        icon: '/pwa/icon-192.png',
        badge: '/pwa/badge-96.png',
        tag: m.tag || undefined,
        renotify: !!m.tag,
        silent: !!m.silent,
        timestamp: Date.now(),
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // Allowed after a real click on the notification; never let a refusal stop the page from opening.
        await open.focus().catch(() => undefined);
        // Navigate the window the person already has, instead of opening another one.
        try {
          if (open.navigate) return await open.navigate(target);
        } catch {
          // not controlled by this worker yet
        }
        open.postMessage({ type: 'OPEN', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser renewed the subscription (expired keys): register the new one for the same signed-in person.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const fresh =
        event.newSubscription ||
        (old && old.options ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: old.options.applicationServerKey }) : null);
      if (!fresh) return;
      await fetch('/api/push/subscription', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: fresh.toJSON(), replaces: old ? old.endpoint : null }),
      }).catch(() => undefined);
    })(),
  );
});
