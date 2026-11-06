/**
 * Placing an order exactly once from our side: the local row (its id is the submission token) is written first, so
 * the same token can never reach the provider twice — not on a double click, not from two tabs. The provider is
 * called once. An answer we cannot read (timeout, broken connection) is "Natija noma’lum — tekshirish kerak" and is
 * never resent automatically: the documented API has no idempotency key, so only a person can reconcile it.
 */

import { toInt, type Kind } from './catalog';
import { decText, parseDec } from './decimal';
import type { Call } from './provider';

export const UNKNOWN_RESULT = 'Natija noma’lum — tekshirish kerak';

export type OrderState = 'submitting' | 'accepted' | 'rejected' | 'unknown' | 'not_placed';

export type NewOrder = {
  id: string;
  owner_id: string;
  kind: Kind;
  item_id: number;
  item_name: string;
  item_category: string | null;
  item_type: string | null;
  price: string;
  price_unit: number | null;
  currency: string;
  target: string;
  params: Record<string, string>;
  quantity: number | null;
  estimate: string | null;
  can_cancel: boolean;
  can_refill: boolean;
};

export type OrderPatch = Partial<{
  state: OrderState;
  provider_order_id: number;
  charge: string | null;
  currency: string;
  error: string | null;
  submitted_at: string;
  accepted_at: string;
}>;

export interface OrderStore {
  /** Inserts the row; when its id already exists, nothing is inserted and the existing row's state comes back. */
  claim(row: NewOrder): Promise<{ claimed: true } | { claimed: false; state: OrderState | null; providerOrderId: number | null }>;
  update(id: string, patch: OrderPatch): Promise<boolean>;
}

export type SubmitOutcome =
  | { state: 'accepted'; providerOrderId: number; charge: string | null; saved: boolean }
  | { state: 'rejected'; message: string; retryAfter?: number }
  | { state: 'unknown'; message: string }
  | { state: 'duplicate'; existing: OrderState | null; providerOrderId: number | null };

const money = (v: unknown) => {
  const d = parseDec(v);
  return d ? decText(d) : null;
};

export async function submitOrder(store: OrderStore, call: Call, row: NewOrder, providerParams: Record<string, string>): Promise<SubmitOutcome> {
  const claim = await store.claim(row);
  if (!claim.claimed) return { state: 'duplicate', existing: claim.state, providerOrderId: claim.providerOrderId };

  const res = await call(providerParams, { mutation: true });
  const now = new Date().toISOString();
  if (res.ok) {
    const data = (res.data && typeof res.data === 'object' ? res.data : {}) as Record<string, unknown>;
    const providerOrderId = toInt(data.order);
    if (providerOrderId === null) {
      await store.update(row.id, { state: 'unknown', error: `${UNKNOWN_RESULT} (javobda buyurtma raqami yo‘q)`, submitted_at: now });
      return { state: 'unknown', message: UNKNOWN_RESULT };
    }
    const patch: OrderPatch = {
      state: 'accepted',
      provider_order_id: providerOrderId,
      charge: money(data.charge),
      currency: typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) ? data.currency : row.currency,
      error: null,
      submitted_at: now,
      accepted_at: now,
    };
    // The provider took it: saving its number must not be lost to one database hiccup.
    const saved = (await store.update(row.id, patch)) || (await store.update(row.id, patch));
    return { state: 'accepted', providerOrderId, charge: patch.charge ?? null, saved };
  }
  if (res.accepted === 'no') {
    await store.update(row.id, { state: 'rejected', error: res.message, submitted_at: now });
    return { state: 'rejected', message: res.message, retryAfter: res.retryAfter };
  }
  await store.update(row.id, { state: 'unknown', error: `${UNKNOWN_RESULT}: ${res.message}`, submitted_at: now });
  return { state: 'unknown', message: UNKNOWN_RESULT };
}
