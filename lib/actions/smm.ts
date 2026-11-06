'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  checkDonatFields,
  checkTelegramUsername,
  enoughBalance,
  isFinal,
  planSmm,
  samePrice,
  smmEstimate,
  toInt,
  type Kind,
  type SmmInput,
} from '@/lib/neosmm/catalog';
import { decText, parseDec } from '@/lib/neosmm/decimal';
import { ORDER_COLUMNS, loadBalance, loadCatalog, neosmm, orderStore, requireSmmOwner, smmConfig, smmOwnerIds, type Balance, type CatalogKind } from '@/lib/neosmm/server';
import { submitOrder, UNKNOWN_RESULT, type NewOrder } from '@/lib/neosmm/submit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

type OrderUpdate = Database['public']['Tables']['neosmm_orders']['Update'];

/**
 * Smm Api actions. Every one starts with `requireSmmOwner()` (the configured owner account, nobody else) before any
 * database row or provider call; Next.js server actions also refuse cross-site posts (Origin check). Inputs are
 * validated here again — nothing from the browser is trusted, not even what the review dialog showed.
 */

export async function smmBalance(): Promise<Balance> {
  await requireSmmOwner();
  return loadBalance();
}

export async function smmCatalog(kind: CatalogKind, fresh = false) {
  const owner = await requireSmmOwner();
  if (!['services', 'donat_services', 'gifts'].includes(kind)) throw new Error('kind');
  return loadCatalog(owner, kind, !!fresh);
}

// ---------------------------------------------------------------------------------------------------------------
// Review → confirm
// ---------------------------------------------------------------------------------------------------------------
const int = z.coerce.number().int();
const smmForm = z.object({
  link: z.string().max(500).optional(),
  quantity: int.optional(),
  comments: z.string().max(20_000).optional(),
  usernames: z.string().max(20_000).optional(),
  hashtag: z.string().max(120).optional(),
  answerNumber: int.optional(),
  runs: int.optional(),
  interval: int.optional(),
});
const orderInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('smm'), id: int.positive(), form: smmForm }),
  z.object({ kind: z.literal('gift'), id: int.positive(), username: z.string().max(40), comment: z.string().max(255).optional() }),
  z.object({
    kind: z.literal('donat'),
    id: int.positive(),
    fields: z.record(z.string(), z.string().max(64)),
    acceptUnverified: z.boolean().optional(),
  }),
]);
export type OrderInput = z.infer<typeof orderInput>;

export type Review = {
  token: string;
  kind: Kind;
  itemId: number;
  itemName: string;
  category: string | null;
  type: string | null;
  target: string;
  details: { label: string; value: string }[];
  quantity: number | null;
  price: string;
  /** SMM: the confirmed quantity the tariff is for; null for fixed-price items. */
  priceUnit: number | null;
  /** SMM: rate × quantity ÷ unit (an estimate); gift / donat: the fixed price. */
  cost: string | null;
  costIsEstimate: boolean;
  currency: string;
  balance: string | null;
  enough: boolean | null;
  check?: { valid: boolean; verified: boolean; playerName: string | null; note: string | null };
  /** Why this cannot be sent (nothing goes to the provider while set). */
  blocked: string | null;
  warnings: string[];
  canCancel: boolean;
  canRefill: boolean;
  providerParams: Record<string, string>;
};

// One NeoSMM account behind every owner: its maintenance pause and the refresh throttle are shared.
const ACCOUNT = 'neosmm';
const pausedUntil = new Map<string, number>();

async function buildReview(owner: string, input: OrderInput, token: string): Promise<Review> {
  const { rateUnit } = smmConfig();
  const balance = await loadBalance();
  const base = { token, kind: input.kind, warnings: [] as string[], balance: balance.ok ? balance.balance : null };

  if (input.kind === 'smm') {
    const catalog = await loadCatalog(owner, 'services', true);
    if (catalog.stale || catalog.error) throw new Error(catalog.error ?? 'Xizmatlarni yangilab bo‘lmadi.');
    const service = catalog.items.find((s) => s.id === input.id);
    if (!service) throw new Error('Xizmat hozir ro‘yxatda yo‘q (o‘chirilgan yoki faol emas).');
    const planned = planSmm(service, input.form as SmmInput);
    const cost = planned.ok ? smmEstimate(service, planned.plan.billed, rateUnit) : null;
    const blocked = !planned.ok
      ? planned.error
      : !rateUnit
        ? 'SMM tarifi qaysi miqdor uchun ekani hali tasdiqlanmagan — narxni hisoblab bo‘lmaydi, buyurtma yuborilmaydi.'
        : null;
    const review: Review = {
      ...base,
      itemId: service.id,
      itemName: service.name,
      category: service.category,
      type: service.type,
      target: planned.ok ? planned.plan.target : (input.form.link ?? ''),
      quantity: planned.ok ? planned.plan.quantity : null,
      details: planned.ok
        ? Object.entries(planned.plan.params)
            .filter(([k]) => !['service', 'link', 'quantity'].includes(k))
            .map(([k, v]) => ({ label: DETAIL[k] ?? k, value: v }))
        : [],
      price: service.rate,
      priceUnit: rateUnit,
      cost,
      costIsEstimate: true,
      currency: balance.ok ? balance.currency : 'UZS',
      enough: enoughBalance(base.balance, cost),
      blocked,
      canCancel: service.cancel,
      canRefill: service.refill,
      providerParams: planned.ok ? { action: 'add', ...planned.plan.params } : {},
    };
    if (/guarantee|kafolat|refill|♻|lifetime|umrbod/i.test(service.name) && !service.refill)
      review.warnings.push('Nomida kafolat / refill yozilgan, lekin provayder bu xizmat uchun refill imkoniyatini ko‘rsatmagan.');
    if (planned.ok && planned.plan.billed !== planned.plan.quantity) review.warnings.push(`Drip-feed: jami ${planned.plan.billed} ta (miqdor × marta) hisoblandi.`);
    return review;
  }

  if (input.kind === 'gift') {
    const catalog = await loadCatalog(owner, 'gifts', true);
    if (catalog.stale || catalog.error) throw new Error(catalog.error ?? 'Sovg‘alarni yangilab bo‘lmadi.');
    const gift = catalog.items.find((g) => g.id === input.id);
    if (!gift) throw new Error('Sovg‘a hozir ro‘yxatda yo‘q.');
    const usernameError = checkTelegramUsername(input.username);
    const username = input.username.trim().startsWith('@') ? input.username.trim() : `@${input.username.trim()}`;
    const comment = (input.comment ?? '').trim();
    return {
      ...base,
      itemId: gift.id,
      itemName: gift.name,
      category: 'Telegram sovg‘asi',
      type: gift.stars ? `${gift.stars} Stars` : null,
      target: username,
      quantity: null,
      details: comment ? [{ label: 'Izoh', value: comment }] : [],
      price: gift.price,
      priceUnit: null,
      cost: gift.price,
      costIsEstimate: false,
      currency: balance.ok ? balance.currency : 'UZS',
      enough: enoughBalance(base.balance, gift.price),
      blocked: usernameError,
      canCancel: false,
      canRefill: false,
      providerParams: { action: 'gift_add', gift: String(gift.id), username, ...(comment ? { comment } : {}) },
    };
  }

  const catalog = await loadCatalog(owner, 'donat_services', true);
  if (catalog.stale || catalog.error) throw new Error(catalog.error ?? 'Donat ro‘yxatini yangilab bo‘lmadi.');
  const product = catalog.items.find((p) => p.id === input.id);
  if (!product) throw new Error('Mahsulot hozir ro‘yxatda yo‘q.');
  const fields = Object.fromEntries(product.requires.map((f) => [f, (input.fields[f] ?? '').trim()]));
  const fieldError = checkDonatFields(product, fields);
  let check: Review['check'];
  let blocked = fieldError;
  if (!fieldError && product.requires.includes('player_id')) {
    const res = await neosmm({ action: 'donat_check_id', product: String(product.id), ...fields });
    if (!res.ok) blocked = `O‘yinchi ID ni tekshirib bo‘lmadi: ${res.message}`;
    else {
      const d = (res.data ?? {}) as Record<string, unknown>;
      check = {
        valid: d.valid === true || d.valid === 'true' || d.valid === 1,
        verified: d.verified === true || d.verified === 'true' || d.verified === 1,
        playerName: typeof d.player_name === 'string' ? d.player_name.slice(0, 120) : null,
        note: typeof d.note === 'string' ? d.note.slice(0, 300) : null,
      };
      if (!check.valid) blocked = 'Provayder bu o‘yinchi ID sini noto‘g‘ri dedi — buyurtma berilmaydi.';
      else if (!check.verified && !input.acceptUnverified) blocked = 'UNVERIFIED';
    }
  }
  const target = Object.values(fields).join(' / ') || '—';
  return {
    ...base,
    itemId: product.id,
    itemName: product.name,
    category: product.game,
    type: product.type,
    target,
    quantity: null,
    details: Object.entries(fields).map(([k, v]) => ({ label: DETAIL[k] ?? k, value: v })),
    price: product.price,
    priceUnit: null,
    cost: product.price,
    costIsEstimate: false,
    currency: product.currency,
    enough: enoughBalance(base.balance, product.price),
    check,
    blocked,
    canCancel: false,
    canRefill: false,
    providerParams: { action: 'donat_add', product: String(product.id), ...fields },
  };
}

const DETAIL: Record<string, string> = {
  comments: 'Izohlar',
  usernames: 'Foydalanuvchilar',
  hashtag: 'Hashtag',
  answer_number: 'Javob raqami',
  runs: 'Drip-feed: marta',
  interval: 'Drip-feed: oraliq (daqiqa)',
  player_id: 'O‘yinchi ID',
  server_id: 'Server ID',
};

type ReviewResult = { ok: true; review: Omit<Review, 'providerParams'> } | { ok: false; message: string };

/** What the browser sees: everything except the parameters that go to the provider (rebuilt on the server). */
function publicReview(review: Review): Omit<Review, 'providerParams'> {
  const { providerParams, ...rest } = review;
  void providerParams;
  return rest;
}

export async function smmReview(raw: OrderInput): Promise<ReviewResult> {
  const owner = await requireSmmOwner();
  const input = orderInput.safeParse(raw);
  if (!input.success) return { ok: false, message: 'Maydonlar noto‘g‘ri to‘ldirilgan.' };
  try {
    return { ok: true, review: publicReview(await buildReview(owner, input.data, randomUUID())) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Tekshirib bo‘lmadi.' };
  }
}

export type PlaceResult =
  | { ok: true; state: 'accepted'; providerOrderId: number; saved: boolean; message: string }
  | { ok: false; state: 'rejected' | 'unknown' | 'duplicate' | 'blocked' | 'paused' | 'changed'; message: string; review?: Omit<Review, 'providerParams'> };

/** "Buyurtmani tasdiqlash": everything is checked again on the server; a changed tariff comes back for a new review. */
export async function smmPlace(token: string, raw: OrderInput, reviewed: { price: string; cost: string | null }): Promise<PlaceResult> {
  const owner = await requireSmmOwner();
  if (!z.uuid().safeParse(token).success) return { ok: false, state: 'blocked', message: 'Ko‘rib chiqishni qaytadan boshlang.' };
  const input = orderInput.safeParse(raw);
  if (!input.success) return { ok: false, state: 'blocked', message: 'Maydonlar noto‘g‘ri to‘ldirilgan.' };
  const pause = pausedUntil.get(ACCOUNT) ?? 0;
  if (pause > Date.now()) return { ok: false, state: 'paused', message: `Provayderda texnik ishlar: ${Math.ceil((pause - Date.now()) / 60_000)} daqiqadan keyin urinib ko‘ring.` };

  let review: Review;
  try {
    review = await buildReview(owner, input.data, token);
  } catch (e) {
    return { ok: false, state: 'blocked', message: e instanceof Error ? e.message : 'Tekshirib bo‘lmadi.' };
  }
  if (review.blocked) return { ok: false, state: 'blocked', message: review.blocked === 'UNVERIFIED' ? 'O‘yinchi ID tasdiqlanmagan — tekshirib, belgilang.' : review.blocked };
  if (!samePrice(review.price, reviewed.price) || (review.cost ?? '') !== (reviewed.cost ?? ''))
    return { ok: false, state: 'changed', message: 'Narx o‘zgardi — yangi narxni ko‘rib, qayta tasdiqlang.', review: publicReview(review) };
  if (review.enough === false) return { ok: false, state: 'blocked', message: 'Balansda mablag‘ yetarli emas. Bot orqali to‘ldiring va balansni yangilang.' };

  const row: NewOrder = {
    id: token,
    owner_id: owner,
    kind: review.kind,
    item_id: review.itemId,
    item_name: review.itemName,
    item_category: review.category,
    item_type: review.type,
    price: review.price,
    price_unit: review.priceUnit,
    currency: review.currency,
    target: review.target.slice(0, 500),
    params: Object.fromEntries(Object.entries(review.providerParams).filter(([k]) => k !== 'action')),
    quantity: review.quantity,
    estimate: review.cost,
    can_cancel: review.canCancel,
    can_refill: review.canRefill,
  };
  let outcome;
  try {
    outcome = await submitOrder(orderStore(owner), neosmm, row, review.providerParams);
  } catch (e) {
    return { ok: false, state: 'blocked', message: e instanceof Error ? e.message : 'Buyurtmani saqlab bo‘lmadi — provayderga yuborilmadi.' };
  }
  if (outcome.state === 'accepted')
    return {
      ok: true,
      state: 'accepted',
      providerOrderId: outcome.providerOrderId,
      saved: outcome.saved,
      message: outcome.saved
        ? `Provayder buyurtmani qabul qildi: #${outcome.providerOrderId}. Bu bajarildi degani emas — holati kuzatiladi.`
        : `Provayder qabul qildi (#${outcome.providerOrderId}), lekin bazaga yozib bo‘lmadi. Raqamni yozib qo‘ying; qayta yubormang.`,
    };
  if (outcome.state === 'rejected') {
    if (outcome.retryAfter) pausedUntil.set(ACCOUNT, Date.now() + outcome.retryAfter * 1000);
    return { ok: false, state: 'rejected', message: outcome.message };
  }
  if (outcome.state === 'duplicate')
    return {
      ok: false,
      state: 'duplicate',
      message: outcome.providerOrderId ? `Bu buyurtma allaqachon yuborilgan: #${outcome.providerOrderId}.` : 'Bu buyurtma allaqachon yuborilgan — “Buyurtmalar”da tekshiring.',
    };
  return { ok: false, state: 'unknown', message: `${UNKNOWN_RESULT}. Qayta yubormang: NeoSMM botida tekshiring va “Buyurtmalar”da natijani belgilang.` };
}

// ---------------------------------------------------------------------------------------------------------------
// History, status, cancel, refill, reconciliation
// ---------------------------------------------------------------------------------------------------------------
export async function smmOrders() {
  await requireSmmOwner();
  const { data, error } = await createAdminClient()
    .from('neosmm_orders')
    .select(ORDER_COLUMNS)
    .in('owner_id', smmOwnerIds())
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return { ok: false as const, message: 'Buyurtmalarni o‘qib bo‘lmadi.', orders: [] };
  return { ok: true as const, orders: data ?? [] };
}

const money = (v: unknown) => {
  const d = parseDec(v);
  return d ? decText(d) : null;
};
const short = (v: unknown, max = 80) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : null);

function statusPatch(d: Record<string, unknown>): OrderUpdate {
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

const lastRefresh = new Map<string, number>();

/** Statuses of the open orders: SMM in batches of up to 100, gifts and donat one by one (their own actions). */
export async function smmRefresh(manual = false) {
  await requireSmmOwner();
  if (!manual && Date.now() - (lastRefresh.get(ACCOUNT) ?? 0) < 20_000) return { ok: true as const, checked: 0, failed: 0 };
  lastRefresh.set(ACCOUNT, Date.now());
  const db = createAdminClient();
  const { data: open } = await db
    .from('neosmm_orders')
    .select('id, kind, provider_order_id, status, refill_id, refill_status')
    .in('owner_id', smmOwnerIds())
    .eq('state', 'accepted')
    .not('provider_order_id', 'is', null)
    .limit(500);
  const rows = (open ?? []).filter((r) => !isFinal(r.status) || (r.refill_id && !isFinal(r.refill_status)));
  let checked = 0;
  let failed = 0;
  const save = async (id: string, patch: OrderUpdate) => {
    const { error } = await db.from('neosmm_orders').update(patch).eq('id', id).in('owner_id', smmOwnerIds());
    if (error) failed++;
    else checked++;
  };

  const smm = rows.filter((r) => r.kind === 'smm' && !isFinal(r.status));
  for (let i = 0; i < smm.length; i += 100) {
    const batch = smm.slice(i, i + 100);
    const res = batch.length === 1 ? await neosmm({ action: 'status', order: String(batch[0].provider_order_id) }) : await neosmm({ action: 'status', orders: batch.map((r) => r.provider_order_id).join(',') });
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
  for (const r of rows.filter((x) => x.kind !== 'smm' && !isFinal(x.status)).slice(0, 25)) {
    const res = await neosmm({ action: r.kind === 'gift' ? 'gift_status' : 'donat_status', order: String(r.provider_order_id) });
    if (res.ok && res.data && typeof res.data === 'object') await save(r.id, statusPatch(res.data as Record<string, unknown>));
    else failed++;
  }
  for (const r of rows.filter((x) => x.refill_id && !isFinal(x.refill_status)).slice(0, 25)) {
    const res = await neosmm({ action: 'refill_status', refill: String(r.refill_id) });
    if (res.ok && res.data && typeof res.data === 'object') await save(r.id, { refill_status: short((res.data as Record<string, unknown>).status) });
    else failed++;
  }
  return { ok: true as const, checked, failed };
}

async function ownRows(owner: string, ids: string[]) {
  const { data } = await createAdminClient()
    .from('neosmm_orders')
    .select('id, kind, state, provider_order_id, status, can_cancel, can_refill, item_id')
    .in('owner_id', smmOwnerIds())
    .in('id', ids);
  return data ?? [];
}

/** Cancel requests (SMM, up to 100). A request accepted by the provider is not a refund: the status shows what happened. */
export async function smmCancel(ids: string[]) {
  const owner = await requireSmmOwner();
  const list = z.array(z.uuid()).min(1).max(100).safeParse(ids);
  if (!list.success) return { ok: false as const, message: 'Buyurtmalarni tanlang (100 tagacha).', results: [] };
  const rows = (await ownRows(owner, list.data)).filter((r) => r.kind === 'smm' && r.state === 'accepted' && r.provider_order_id && r.can_cancel && !isFinal(r.status));
  if (!rows.length) return { ok: false as const, message: 'Bekor qilish mumkin bo‘lgan buyurtma yo‘q.', results: [] };
  const res = await neosmm({ action: 'cancel', orders: rows.map((r) => r.provider_order_id).join(',') }, { mutation: true });
  if (!res.ok) return { ok: false as const, message: res.accepted === 'unknown' ? `${UNKNOWN_RESULT}: holatni yangilab ko‘ring.` : res.message, results: [] };
  const answers = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [res.data as Record<string, unknown>];
  const db = createAdminClient();
  const results = [];
  for (const r of rows) {
    const a = answers.find((x) => toInt(x?.order) === r.provider_order_id);
    const accepted = !!a && (a.cancel === 1 || a.cancel === '1' || a.cancel === true);
    if (accepted) await db.from('neosmm_orders').update({ cancel_requested_at: new Date().toISOString() }).eq('id', r.id).in('owner_id', smmOwnerIds());
    results.push({ id: r.id, ok: accepted, message: accepted ? 'Bekor qilish so‘rovi qabul qilindi (holat keyin yangilanadi).' : typeof a?.error === 'string' ? `Bekor qilinmadi: ${a.error.slice(0, 200)}` : 'Provayder javob bermadi.' });
  }
  return { ok: true as const, message: '', results };
}

export async function smmRefill(id: string) {
  const owner = await requireSmmOwner();
  if (!z.uuid().safeParse(id).success) return { ok: false as const, message: 'Buyurtma topilmadi.' };
  const [r] = await ownRows(owner, [id]);
  if (!r || r.kind !== 'smm' || r.state !== 'accepted' || !r.provider_order_id) return { ok: false as const, message: 'Buyurtma topilmadi.' };
  if (!r.can_refill) return { ok: false as const, message: 'Bu xizmatda refill imkoniyati yo‘q.' };
  const res = await neosmm({ action: 'refill', order: String(r.provider_order_id) }, { mutation: true });
  if (!res.ok) return { ok: false as const, message: res.accepted === 'unknown' ? `${UNKNOWN_RESULT}: keyinroq holatni tekshiring.` : res.message };
  const refill = toInt((res.data as Record<string, unknown>)?.refill);
  if (!refill) return { ok: false as const, message: 'Provayder refill raqamini qaytarmadi.' };
  await createAdminClient().from('neosmm_orders').update({ refill_id: refill, refill_status: 'Pending' }).eq('id', r.id).in('owner_id', smmOwnerIds());
  return { ok: true as const, message: `Refill so‘rovi qabul qilindi: #${refill}.` };
}

/** An unclear submission, settled by the owner after checking in the bot: its provider number, or "not placed". */
export async function smmResolve(id: string, providerOrderId: number | null) {
  await requireSmmOwner();
  if (!z.uuid().safeParse(id).success) return { ok: false as const, message: 'Buyurtma topilmadi.' };
  const db = createAdminClient();
  const { data: r } = await db.from('neosmm_orders').select('id, kind, state, created_at').eq('id', id).in('owner_id', smmOwnerIds()).maybeSingle();
  const stuck = r && (r.state === 'unknown' || (r.state === 'submitting' && Date.now() - Date.parse(r.created_at) > 120_000));
  if (!r || !stuck) return { ok: false as const, message: 'Bu buyurtmaning natijasi allaqachon aniq.' };
  if (providerOrderId === null) {
    await db.from('neosmm_orders').update({ state: 'not_placed', error: 'Egasi tekshirdi: provayderga tushmagan.' }).eq('id', id).in('owner_id', smmOwnerIds());
    return { ok: true as const, message: 'Yuborilmagan deb belgilandi.' };
  }
  if (!Number.isSafeInteger(providerOrderId) || providerOrderId <= 0) return { ok: false as const, message: 'Buyurtma raqami noto‘g‘ri.' };
  const { error } = await db
    .from('neosmm_orders')
    .update({ state: 'accepted', provider_order_id: providerOrderId, error: null, accepted_at: new Date().toISOString() })
    .eq('id', id)
    .in('owner_id', smmOwnerIds());
  if (error) return { ok: false as const, message: error.code === '23505' ? 'Bu raqam boshqa buyurtmaga yozilgan.' : 'Saqlab bo‘lmadi.' };
  return { ok: true as const, message: `#${providerOrderId} biriktirildi — holat yangilanadi.` };
}
