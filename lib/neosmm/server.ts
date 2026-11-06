import 'server-only';

import { notFound } from 'next/navigation';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

import { normalizeDonat, normalizeGifts, normalizeServices, type DonatProduct, type Gift, type Service } from './catalog';
import { createProvider, type Call, type ProviderError } from './provider';
import type { NewOrder, OrderPatch, OrderState, OrderStore } from './submit';

/**
 * Smm Api on the server: who the owner is (NEOSMM_OWNER_USER_ID — one verified account, never a role), the key
 * (NEOSMM_API_KEY), the confirmed quantity basis of SMM tariffs (NEOSMM_RATE_PER — until it is set, SMM costs are not
 * estimated and SMM orders are not sent), catalogues with a bounded cache, and the order rows. Everything that reads
 * or writes goes through `requireSmmOwner()` first.
 */

const uuid = z.uuid();

export function smmConfig() {
  const owner = process.env.NEOSMM_OWNER_USER_ID?.trim() ?? '';
  const per = process.env.NEOSMM_RATE_PER?.trim() ?? '';
  return {
    ownerId: uuid.safeParse(owner).success ? owner.toLowerCase() : null,
    keyConfigured: !!process.env.NEOSMM_API_KEY?.trim(),
    rateUnit: /^[1-9]\d{0,6}$/.test(per) ? Number(per) : null,
  };
}

/** The signed-in person is the configured owner (an active staff account) — false for everyone else, and when unset. */
export async function isSmmOwner(): Promise<string | null> {
  const { ownerId } = smmConfig();
  if (!ownerId) return null;
  const context = await getSessionContext();
  if (!context || context.status !== 'active' || context.kind !== 'staff') return null;
  return context.userId.toLowerCase() === ownerId ? context.userId : null;
}

/** Owner or a plain 404 (the module does not exist for anyone else). */
export async function requireSmmOwner(): Promise<string> {
  const id = await isSmmOwner();
  if (!id) notFound();
  return id;
}

let provider: Call | null = null;
export const neosmm: Call = (params, opts) => (provider ??= createProvider({ key: process.env.NEOSMM_API_KEY }))(params, opts);

// ---------------------------------------------------------------------------------------------------------------
// Catalogues: a short cache per server instance, the last good copy in the database for outages.
// ---------------------------------------------------------------------------------------------------------------
export type CatalogKind = 'services' | 'donat_services' | 'gifts';
type ItemOf<K extends CatalogKind> = K extends 'services' ? Service : K extends 'gifts' ? Gift : DonatProduct;
export type Catalog<K extends CatalogKind> = {
  items: ItemOf<K>[];
  skipped: number;
  fetchedAt: string | null;
  /** Old copy shown because the provider could not be reached now. */
  stale: boolean;
  error: string | null;
};

const TTL_MS = 5 * 60_000;
const memory = new Map<string, { at: number; value: Catalog<CatalogKind> }>();

const normalize = (kind: CatalogKind, data: unknown) =>
  kind === 'services' ? normalizeServices(data) : kind === 'gifts' ? normalizeGifts(data) : normalizeDonat(data);

export async function loadCatalog<K extends CatalogKind>(owner: string, kind: K, fresh = false): Promise<Catalog<K>> {
  const memKey = `${owner}:${kind}`;
  const hit = memory.get(memKey);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value as Catalog<K>;

  const res = await neosmm({ action: kind });
  const db = createAdminClient();
  if (res.ok && Array.isArray(res.data)) {
    const { items, skipped } = normalize(kind, res.data);
    const value = { items, skipped, fetchedAt: new Date().toISOString(), stale: false, error: null } as Catalog<K>;
    memory.set(memKey, { at: Date.now(), value });
    await db
      .from('neosmm_catalog_cache')
      .upsert({ owner_id: owner, kind, data: items as unknown as Json, fetched_at: value.fetchedAt! })
      .then(
        () => undefined,
        () => undefined,
      );
    return value;
  }
  const message = res.ok ? 'NeoSMM ro‘yxat o‘rniga boshqa javob qaytardi.' : res.message;
  // A failed request is not an empty catalogue: the last good copy, marked as old, or the error itself.
  const { data: cached } = await db.from('neosmm_catalog_cache').select('data, fetched_at').eq('owner_id', owner).eq('kind', kind).maybeSingle();
  if (cached && Array.isArray(cached.data)) {
    const { items, skipped } = normalize(kind, cached.data);
    return { items, skipped, fetchedAt: cached.fetched_at, stale: true, error: message } as Catalog<K>;
  }
  return { items: [], skipped: 0, fetchedAt: null, stale: false, error: message } as Catalog<K>;
}

export type Balance = { ok: true; balance: string; currency: string; at: string } | { ok: false; error: string; reason: ProviderError['reason'] };

export async function loadBalance(): Promise<Balance> {
  const res = await neosmm({ action: 'balance' });
  if (!res.ok) return { ok: false, error: res.message, reason: res.reason };
  const d = (res.data ?? {}) as Record<string, unknown>;
  const balance = typeof d.balance === 'string' || typeof d.balance === 'number' ? String(d.balance).trim() : '';
  if (!/^-?\d+(\.\d+)?$/.test(balance)) return { ok: false, error: 'NeoSMM balans o‘rniga tushunarsiz javob qaytardi.', reason: 'bad_response' };
  const currency = typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'UZS';
  return { ok: true, balance, currency, at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------------------------------------------
// Orders (service role, always filtered by the verified owner)
// ---------------------------------------------------------------------------------------------------------------
export const ORDER_COLUMNS =
  'id, kind, state, provider_order_id, item_id, item_name, item_category, item_type, price, price_unit, currency, target, params, quantity, estimate, charge, can_cancel, can_refill, status, remains, start_count, code, cancel_requested_at, refill_id, refill_status, error, created_at, submitted_at, accepted_at, checked_at';

export function orderStore(owner: string): OrderStore {
  const db = createAdminClient();
  return {
    async claim(row: NewOrder) {
      if (row.owner_id !== owner) throw new Error('owner mismatch');
      const { error } = await db.from('neosmm_orders').insert({ ...row, state: 'submitting' satisfies OrderState });
      if (!error) return { claimed: true };
      if (error.code !== '23505') throw new Error('Buyurtmani saqlab bo‘lmadi — provayderga yuborilmadi.');
      const { data } = await db.from('neosmm_orders').select('state, provider_order_id').eq('id', row.id).eq('owner_id', owner).maybeSingle();
      return { claimed: false, state: (data?.state as OrderState | undefined) ?? null, providerOrderId: data?.provider_order_id ?? null };
    },
    async update(id: string, patch: OrderPatch) {
      const { error, count } = await db.from('neosmm_orders').update(patch, { count: 'exact' }).eq('id', id).eq('owner_id', owner);
      return !error && (count ?? 0) > 0;
    },
  };
}
