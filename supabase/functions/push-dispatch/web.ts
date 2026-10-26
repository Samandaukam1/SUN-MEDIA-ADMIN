// Pure mapping for web devices (the installed web app and browsers): claimed delivery → the message the service
// worker shows, and the push service's answer → the delivery result. No Deno or network APIs here.
import type { PushOptions, PushResponse } from '../_shared/webpush.ts';
import type { Claimed, DeliveryResult } from './results.ts';

export type WebClaimed = Claimed & { platform: 'web'; p256dh: string; auth_secret: string; notification_id: string };

/** What public/sw.js receives (and shows as the system notification). */
export type WebMessage = {
  title: string;
  body: string;
  /** Opened on click: the resolver finds this person's page for it and records the click. */
  url: string;
  /** One notification per chat room (the latest message replaces the previous one); one per item otherwise. */
  tag: string;
  badge: number | null;
  type: string | null;
  silent: boolean;
};

export const isWeb = (d: Claimed): d is WebClaimed => (d as Partial<WebClaimed>).platform === 'web';

export function webMessage(d: WebClaimed): { payload: string; options: PushOptions } {
  const data = d.data ?? {};
  const type = typeof data.type === 'string' ? data.type : null;
  const route = typeof data.route === 'string' ? data.route : '';
  const room = /^\/chat\/([0-9a-f-]{36})$/.exec(route)?.[1];
  const message: WebMessage = {
    title: d.title.slice(0, 120),
    body: (d.body ?? '').slice(0, 600),
    url: `/open?n=${d.notification_id}`,
    tag: room ? `chat:${room}` : `n:${d.notification_id}`,
    badge: d.badge,
    type,
    // Busy group chats arrive without a sound, like on the phone app.
    silent: d.priority === 'low',
  };
  return {
    payload: JSON.stringify(message),
    options: {
      // A chat message is news for a day; a director's order or an overdue task, for three.
      ttl: d.priority === 'high' ? 3 * 86_400 : 86_400,
      urgency: d.priority === 'high' ? 'high' : 'normal',
      topic: d.notification_id.replace(/-/g, ''),
    },
  };
}

export function webResult(d: WebClaimed, res: PushResponse | Error): DeliveryResult {
  if (res instanceof Error) return { delivery_id: d.delivery_id, status: 'failed', error: res.message.slice(0, 300) };
  if (res.status >= 200 && res.status < 300) return { delivery_id: d.delivery_id, status: 'sent' };
  const error = `Web push HTTP ${res.status}${res.text ? `: ${res.text}` : ''}`;
  // 404 / 410: unsubscribed, expired or the app removed — the device is retired, not retried.
  return { delivery_id: d.delivery_id, status: 'failed', error, device_not_registered: res.status === 404 || res.status === 410 };
}
