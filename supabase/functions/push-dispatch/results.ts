// Pure mapping between claimed deliveries, the Expo push request and the delivery results that
// complete_push_deliveries expects. No Deno or network APIs here so it can be unit-tested anywhere.

export type Claimed = {
  delivery_id: number;
  token: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  priority: 'low' | 'normal' | 'high';
  badge: number | null;
};

export type ExpoMessage = {
  to: string;
  title: string;
  body?: string;
  data: Record<string, unknown>;
  sound: 'default' | null;
  badge?: number;
  priority: 'default' | 'high';
  channelId: string;
};

export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

export type DeliveryResult = {
  delivery_id: number;
  status: 'sent' | 'failed';
  ticket_id?: string;
  error?: string;
  device_not_registered?: boolean;
};

export function toExpoMessages(batch: Claimed[]): ExpoMessage[] {
  return batch.map((d) => ({
    to: d.token,
    title: d.title,
    body: d.body ?? undefined,
    data: d.data ?? {},
    // Low-priority events (chat in busy rooms) arrive silently.
    sound: d.priority === 'low' ? null : 'default',
    badge: d.badge ?? undefined,
    priority: d.priority === 'high' ? 'high' : 'default',
    channelId: 'default',
  }));
}

/** Expo answers tickets in request order; a failed HTTP call fails the whole batch (it is retried). */
export function toResults(batch: Claimed[], tickets: ExpoTicket[] | null, httpError?: string): DeliveryResult[] {
  return batch.map((d, i) => {
    const ticket = tickets?.[i];
    if (!ticket) return { delivery_id: d.delivery_id, status: 'failed', error: httpError ?? 'No ticket returned' };
    if (ticket.status === 'ok') return { delivery_id: d.delivery_id, status: 'sent', ticket_id: ticket.id };
    const code = ticket.details?.error;
    return {
      delivery_id: d.delivery_id,
      status: 'failed',
      error: [code, ticket.message].filter(Boolean).join(': ') || 'Expo rejected the message',
      device_not_registered: code === 'DeviceNotRegistered',
    };
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
