import 'server-only';

import { notFound } from 'next/navigation';

import { getSessionContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

import { isFinal, normalizeDonat, normalizeGifts, normalizeServices, platformOf, toInt, type DonatProduct, type Gift, type Service } from './catalog';
import { decText, parseDec } from './decimal';
import type { HealthRow } from './health';
import { parseOwnerIds } from './owners';
import { createProvider, type Call, type ProviderError } from './provider';
import type { NewOrder, OrderPatch, OrderState, OrderStore } from './submit';
import { parseTarget, type TargetInfo } from './targets';

/**
 * Smm Api on the server: who the owners are (NEOSMM_OWNER_USER_ID — explicit verified account ids, never a role), the key
 * (NEOSMM_API_KEY), the confirmed quantity basis of SMM tariffs (NEOSMM_RATE_PER — until it is set, SMM costs are not
 * estimated and SMM orders are not sent), catalogues with a bounded cache, and the order rows. Everything that reads
 * or writes goes through `requireSmmOwner()` first.
 */

export function smmConfig() {
  const per = process.env.NEOSMM_RATE_PER?.trim() ?? '';
  return {
    ownerIds: parseOwnerIds(process.env.NEOSMM_OWNER_USER_ID),
    keyConfigured: !!process.env.NEOSMM_API_KEY?.trim(),
    rateUnit: /^[1-9]\d{0,6}$/.test(per) ? Number(per) : null,
  };
}

/** The signed-in person is one of the configured owners (an active staff account) — null for everyone else, and when unset. */
export async function isSmmOwner(): Promise<string | null> {
  const { ownerIds } = smmConfig();
  if (!ownerIds.length) return null;
  const context = await getSessionContext();
  if (!context || context.status !== 'active' || context.kind !== 'staff') return null;
  return ownerIds.includes(context.userId.toLowerCase()) ? context.userId : null;
}

/** The owners share one NeoSMM account, so they share its orders: rows of any configured owner. */
export const smmOwnerIds = () => smmConfig().ownerIds;

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
    // Services: the copy is stored together with what vanished since the previous one (service health evidence).
    const saved =
      kind === 'services'
        ? db.rpc('neosmm_store_services', { p_owner: owner, p_items: items as unknown as Json })
        : db.from('neosmm_catalog_cache').upsert({ owner_id: owner, kind, data: items as unknown as Json, fetched_at: value.fetchedAt! });
    await saved.then(
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
  'id, kind, state, provider_order_id, item_id, item_name, item_category, item_type, price, price_unit, currency, target, params, quantity, estimate, charge, can_cancel, can_refill, status, remains, start_count, code, cancel_requested_at, refill_id, refill_status, error, provider_error, error_kind, created_at, submitted_at, accepted_at, checked_at, completed_at, plan_id, part_index, profile_id, target_key, queue_key, refill_policy, refill_requested_at, refill_checked_at, refill_error';

export function orderStore(owner: string): OrderStore {
  const db = createAdminClient();
  return {
    async claim(row: NewOrder) {
      if (row.owner_id !== owner) throw new Error('owner mismatch');
      const { error } = await db.from('neosmm_orders').insert({ ...row, refill_policy: (row.refill_policy ?? null) as Json | null, state: 'submitting' satisfies OrderState });
      if (!error) return { claimed: true };
      if (error.code !== '23505') throw new Error('Buyurtmani saqlab bo‘lmadi — provayderga yuborilmadi.');
      const { data } = await db.from('neosmm_orders').select('state, provider_order_id').eq('id', row.id).in('owner_id', smmOwnerIds()).maybeSingle();
      return { claimed: false, state: (data?.state as OrderState | undefined) ?? null, providerOrderId: data?.provider_order_id ?? null };
    },
    async update(id: string, patch: OrderPatch) {
      const { error, count } = await db.from('neosmm_orders').update(patch, { count: 'exact' }).eq('id', id).in('owner_id', smmOwnerIds());
      return !error && (count ?? 0) > 0;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Service health, statuses and the queue — shared by the owner's actions and the worker
// ---------------------------------------------------------------------------------------------------------------
export const HEALTH_COLUMNS =
  'service_id, service_name, service_category, last_accepted_at, last_accepted_order, last_completed_at, last_completed_order, blocked_at, blocked_reason, missing_since, last_seen_at, disabled_at, cleared_at, refill_days, refill_starts, refill_basis, refill_verified_at';

export async function loadHealth(): Promise<Map<number, HealthRow>> {
  const { data } = await createAdminClient().from('neosmm_service_health').select(HEALTH_COLUMNS).eq('provider', 'neosmm').limit(5000);
  return new Map(((data ?? []) as HealthRow[]).map((r) => [r.service_id, r]));
}

/** An owner account the worker may act for: configured, and still an active account. */
export async function ownerActive(ownerId: string): Promise<boolean> {
  if (!smmOwnerIds().includes(ownerId.toLowerCase())) return false;
  const { data } = await createAdminClient().from('profiles').select('status, deleted_at').eq('id', ownerId).maybeSingle();
  return !!data && data.status === 'active' && !data.deleted_at;
}

const money = (v: unknown) => {
  const d = parseDec(v);
  return d ? decText(d) : null;
};
const short = (v: unknown, max = 80) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : null);

type OrderUpdate = Database['public']['Tables']['neosmm_orders']['Update'];

export function statusPatch(d: Record<string, unknown>): OrderUpdate {
  return {
    status: short(d.status),
    charge: money(d.charge),
    remains: short(d.remains, 40),
    start_count: short(d.start_count, 40),
    ...(typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? { currency: d.currency } : {}),
    ...(typeof d.code === 'string' && d.code ? { code: d.code.slice(0, 500) } : {}),
    ...(typeof d.reason === 'string' && d.reason ? { error: d.reason.slice(0, 500) } : {}),
    checked_at: new Date().toISOString(),
  };
}

/**
 * Statuses of the open orders (SMM in batches of up to 100 with `status`, gifts with `gift_status`, donat with
 * `donat_status`) and of open refill requests (`refill_status`). `staleMs` skips rows checked more recently.
 * A final status written here frees the order's queue key (database trigger) and may pause its plan.
 */
export async function refreshStatuses(staleMs = 0): Promise<{ checked: number; failed: number }> {
  const db = createAdminClient();
  const owners = smmOwnerIds();
  if (!owners.length) return { checked: 0, failed: 0 };
  const { data: open } = await db
    .from('neosmm_orders')
    .select('id, kind, provider_order_id, status, refill_id, refill_status, checked_at, refill_checked_at')
    .in('owner_id', owners)
    .eq('state', 'accepted')
    .not('provider_order_id', 'is', null)
    .order('checked_at', { ascending: true, nullsFirst: true })
    .limit(500);
  const stale = (at: string | null) => !staleMs || !at || Date.now() - Date.parse(at) >= staleMs;
  const rows = open ?? [];
  let checked = 0;
  let failed = 0;
  const save = async (id: string, patch: OrderUpdate) => {
    const { error } = await db.from('neosmm_orders').update(patch).eq('id', id).in('owner_id', owners);
    if (error) failed++;
    else checked++;
  };

  const smm = rows.filter((r) => r.kind === 'smm' && !isFinal(r.status) && stale(r.checked_at));
  for (let i = 0; i < smm.length; i += 100) {
    const batch = smm.slice(i, i + 100);
    const res =
      batch.length === 1
        ? await neosmm({ action: 'status', order: String(batch[0].provider_order_id) })
        : await neosmm({ action: 'status', orders: batch.map((r) => r.provider_order_id).join(',') });
    if (!res.ok) {
      failed += batch.length;
      continue;
    }
    const data = res.data as Record<string, unknown> | Record<string, unknown>[];
    for (const r of batch) {
      const one =
        batch.length === 1
          ? data
          : Array.isArray(data)
            ? data.find((x) => toInt((x as Record<string, unknown>).order) === r.provider_order_id)
            : (data as Record<string, unknown>)[String(r.provider_order_id)];
      if (one && typeof one === 'object' && !('error' in one)) await save(r.id, statusPatch(one as Record<string, unknown>));
      else failed++;
    }
  }
  for (const r of rows.filter((x) => x.kind !== 'smm' && !isFinal(x.status) && stale(x.checked_at)).slice(0, 25)) {
    const res = await neosmm({ action: r.kind === 'gift' ? 'gift_status' : 'donat_status', order: String(r.provider_order_id) });
    if (res.ok && res.data && typeof res.data === 'object') await save(r.id, statusPatch(res.data as Record<string, unknown>));
    else failed++;
  }
  for (const r of rows.filter((x) => x.refill_id && !isFinal(x.refill_status) && stale(x.refill_checked_at)).slice(0, 25)) {
    const res = await neosmm({ action: 'refill_status', refill: String(r.refill_id) });
    const now = new Date().toISOString();
    if (res.ok && res.data && typeof res.data === 'object') {
      const d = res.data as Record<string, unknown>;
      await save(r.id, { refill_status: short(d.status), refill_checked_at: now, ...(typeof d.error === 'string' ? { refill_error: d.error.slice(0, 500) } : {}) });
    } else if (!res.ok && res.reason === 'provider') await save(r.id, { refill_checked_at: now, refill_error: res.message.slice(0, 500) });
    else failed++;
  }
  return { checked, failed };
}

/**
 * Orders placed before the queue existed (or written by an older build) get their keys, and an unfinished one takes its
 * key when it is free — so a new order on the same service and target waits for it.
 */
export async function adoptOpenOrders(): Promise<number> {
  const db = createAdminClient();
  const owners = smmOwnerIds();
  if (!owners.length) return 0;
  const { data } = await db
    .from('neosmm_orders')
    .select('id, state, status, item_id, item_name, item_category, target')
    .in('owner_id', owners)
    .eq('kind', 'smm')
    .is('queue_key', null)
    .in('state', ['submitting', 'accepted', 'unknown'])
    .limit(100);
  let n = 0;
  for (const o of data ?? []) {
    if (o.state === 'accepted' && isFinal(o.status)) continue;
    const target = parseTarget(o.target, platformOf({ category: o.item_category ?? '', name: o.item_name }));
    // A link we cannot parse still gets a key (its exact text), so it holds its own queue and is not adopted again.
    const targetKey = target?.key ?? `raw:${o.target.trim().toLowerCase()}`.slice(0, 600);
    const key = `neosmm:${o.item_id}:${targetKey}`.slice(0, 700);
    await db.from('neosmm_orders').update({ queue_key: key, target_key: targetKey }).eq('id', o.id).in('owner_id', owners);
    await db.rpc('neosmm_queue_acquire', { p_key: key, p_order: o.id, p_hold: o.state === 'accepted' ? 'active' : o.state === 'unknown' ? 'unknown' : 'sending' });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------
// Profiles and recent targets (shared by the owners, like the orders)
// ---------------------------------------------------------------------------------------------------------------

/** The one profile card of an Instagram username: found, or created once (a repeated order reuses it). */
export async function ensureProfile(owner: string, username: string): Promise<string | null> {
  const db = createAdminClient();
  const find = async () => (await db.from('neosmm_profiles').select('id').eq('platform', 'instagram').eq('username', username).maybeSingle()).data?.id ?? null;
  const found = await find();
  if (found) return found;
  const { data, error } = await db.from('neosmm_profiles').insert({ username, created_by: owner }).select('id').maybeSingle();
  if (data?.id) return data.id;
  return error?.code === '23505' ? find() : null;
}

/** An existing profile the owner picked (for a post link: only their explicit choice associates it). */
export async function profileExists(id: string): Promise<boolean> {
  const { data } = await createAdminClient().from('neosmm_profiles').select('id').eq('id', id).maybeSingle();
  return !!data;
}

/** Remembers a used target for suggestions (shows it again if it had been removed from them). */
export async function recordTarget(target: string, info: TargetInfo, profileId: string | null) {
  const db = createAdminClient();
  const { data } = await db.from('neosmm_recent_targets').select('use_count').eq('target_key', info.key).maybeSingle();
  const row = {
    target_key: info.key,
    platform: info.platform,
    target: target.slice(0, 500),
    kind: info.kind,
    username: info.username,
    profile_id: profileId,
    last_used_at: new Date().toISOString(),
    hidden_at: null,
  };
  await (data ? db.from('neosmm_recent_targets').update({ ...row, use_count: data.use_count + 1 }).eq('target_key', info.key) : db.from('neosmm_recent_targets').insert(row)).then(
    () => undefined,
    () => undefined,
  );
}
