'use server';

import { randomUUID } from 'node:crypto';

import { after } from 'next/server';
import { z } from 'zod';

import { adapterOf, checkTarget, platformOf, samePrice, smmEstimate } from '@/lib/neosmm/catalog';
import { decText, parseDec } from '@/lib/neosmm/decimal';
import { healthOf, type HealthRow } from '@/lib/neosmm/health';
import { policyFrom, readPolicy, type RefillPolicy } from '@/lib/neosmm/refill';
import {
  HEALTH_COLUMNS,
  ORDER_COLUMNS,
  ensureProfile,
  loadBalance,
  loadCatalog,
  loadHealth,
  profileExists,
  recordTarget,
  requireSmmOwner,
  smmConfig,
  smmOwnerIds,
} from '@/lib/neosmm/server';
import { MAX_WINDOW_HOURS, sendingTimes, splitQuantity } from '@/lib/neosmm/split';
import { parseTarget, queueKey } from '@/lib/neosmm/targets';
import { runWorker } from '@/lib/neosmm/worker';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/**
 * Smm Api: split plans, service health switches and refill terms, recent targets, profile cards. Each action starts
 * with `requireSmmOwner()` and reads / writes only rows of the configured owners.
 */

const int = z.coerce.number().int();
const uuid = z.uuid();

// ---------------------------------------------------------------------------------------------------------------
// Split plans
// ---------------------------------------------------------------------------------------------------------------
const planInput = z.object({
  serviceId: int.positive(),
  link: z.string().max(500),
  total: int.positive().max(100_000_000),
  /** ISO instant; null — now. */
  startAt: z.string().max(40).nullable(),
  windowHours: z.coerce.number().min(0).max(MAX_WINDOW_HOURS),
  preferred: int.positive().max(100_000_000).nullable().optional(),
  even: z.boolean().optional(),
  profileId: uuid.nullable().optional(),
});
export type PlanInput = z.infer<typeof planInput>;

export type PlanReview = {
  token: string;
  serviceId: number;
  serviceName: string;
  category: string;
  target: string;
  targetKind: 'profile' | 'post' | 'link' | null;
  username: string | null;
  total: number;
  parts: { index: number; quantity: number; at: string; estimate: string }[];
  spacingSeconds: number;
  windowSeconds: number;
  price: string;
  priceUnit: number | null;
  currency: string;
  estimate: string | null;
  balance: string | null;
  enough: boolean | null;
  queueBusy: boolean;
  refill: RefillPolicy;
  health: { label: string; reason: string | null };
  blocked: string | null;
  warnings: string[];
};

const addDec = (a: string, b: string) => {
  const x = parseDec(a)!;
  const y = parseDec(b)!;
  const s = Math.max(x.s, y.s);
  return decText({ n: x.n * 10n ** BigInt(s - x.s) + y.n * 10n ** BigInt(s - y.s), s });
};

async function buildPlan(owner: string, input: PlanInput, token: string) {
  const { rateUnit } = smmConfig();
  const catalog = await loadCatalog(owner, 'services', true);
  if (catalog.stale || catalog.error) throw new Error(catalog.error ?? 'Xizmatlarni yangilab bo‘lmadi.');
  const service = catalog.items.find((s) => s.id === input.serviceId);
  if (!service) throw new Error('Xizmat hozir ro‘yxatda yo‘q (o‘chirilgan yoki faol emas).');
  const healthRow = (await loadHealth()).get(service.id) ?? null;
  const health = healthOf(healthRow);
  const platform = platformOf(service);
  const link = input.link.trim();
  const target = parseTarget(link, platform);
  const balance = await loadBalance();
  const warnings: string[] = [];

  let blocked: string | null = null;
  if (!rateUnit) blocked = 'SMM tarifi qaysi miqdor uchun ekani tasdiqlanmagan — narxni hisoblab bo‘lmaydi.';
  else if (!health.orderable) blocked = `Xizmat holati: ${health.label}${health.reason ? ` — ${health.reason}` : ''}. Yangi buyurtma qabul qilinmaydi.`;
  else if (adapterOf(service.type) !== 'default') blocked = `Bo‘lib yuborish faqat oddiy (Default) xizmatlarda: bu xizmat turi “${service.type}”.`;
  else blocked = checkTarget(link, platform) ?? (target ? null : 'Havolani tushunib bo‘lmadi.');

  const split = splitQuantity({ total: input.total, min: service.min ?? 1, max: service.max ?? 100_000_000, preferred: input.preferred ?? null, even: !!input.even });
  if (!blocked && !split.ok) blocked = split.error;

  const now = Date.now();
  const start = input.startAt ? Date.parse(input.startAt) : now;
  if (!blocked && (!Number.isFinite(start) || start < now - 5 * 60_000)) blocked = 'Boshlanish vaqti o‘tib ketgan — hozirgi yoki keyingi vaqtni tanlang.';
  if (!blocked && start > now + 30 * 86_400_000) blocked = 'Boshlanish 30 kundan uzoq bo‘lmasin.';
  const n = split.ok ? split.parts.length : 0;
  const windowSeconds = Math.round(input.windowHours * 3600);
  const { spacingSeconds, times } = sendingTimes(Math.max(start, now), n > 1 ? windowSeconds : 0, n);
  const parts = split.ok
    ? split.parts.map((quantity, index) => ({ index, quantity, at: new Date(times[index]).toISOString(), estimate: rateUnit ? smmEstimate(service, quantity, rateUnit)! : '0' }))
    : [];
  const estimate = parts.length && rateUnit ? parts.reduce((sum, p) => addDec(sum, p.estimate), '0') : null;
  if (!blocked && n > 1 && windowSeconds < 60) blocked = 'Bir nechta qism uchun yuborish oralig‘ini (soat) kiriting.';

  let queueBusy = false;
  if (target) {
    const { data } = await createAdminClient().from('neosmm_queue').select('order_id').eq('queue_key', queueKey(service.id, target)).maybeSingle();
    queueBusy = !!data;
  }
  const bal = balance.ok ? parseDec(balance.balance) : null;
  const need = estimate ? parseDec(estimate) : null;
  const enough = bal && need ? bal.n * 10n ** BigInt(Math.max(bal.s, need.s) - bal.s) >= need.n * 10n ** BigInt(Math.max(bal.s, need.s) - need.s) : null;

  if (n > 1)
    warnings.push(
      `“${input.windowHours} soat” — yuborish oralig‘i, yetkazib berish muddati emas. Provayderning bajarishi va oldingi buyurtmani kutish tugashni kechiktirishi mumkin.`,
    );
  if (queueBusy) warnings.push('Oldingi buyurtma tugashini kutmoqda: shu xizmat va havolada tugamagan buyurtma bor — birinchi qism u tugagach yuboriladi.');
  if (service.dripfeed) warnings.push('Bu xizmatda provayderning o‘z drip-feed’i bor. Bu reja undan foydalanmaydi: har qism alohida oddiy buyurtma.');
  if (enough === false) warnings.push('Hozirgi balans butun reja uchun yetmaydi. Har qism oldidan balans tekshiriladi; yetmasa reja to‘xtaydi.');
  warnings.push('Bo‘lib yuborish Instagram cheklovlaridan himoya qilmaydi va sun’iy faollikni yashirmaydi.');
  if (target?.kind === 'post' && !input.profileId) warnings.push('Post / reels havolasi: profil kartasiga faqat siz tanlasangiz bog‘lanadi.');

  const review: PlanReview = {
    token,
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    target: link,
    targetKind: target?.kind ?? null,
    username: target?.username ?? null,
    total: input.total,
    parts,
    spacingSeconds,
    windowSeconds: n > 1 ? windowSeconds : 0,
    price: service.rate,
    priceUnit: rateUnit,
    currency: balance.ok ? balance.currency : 'UZS',
    estimate,
    balance: balance.ok ? balance.balance : null,
    enough,
    queueBusy,
    refill: policyFrom(service.refill, healthRow),
    health: { label: health.label, reason: health.reason },
    blocked,
    warnings,
  };
  return { review, service, target, start: Math.max(start, now) };
}

export async function smmPlanReview(raw: PlanInput): Promise<{ ok: true; review: PlanReview } | { ok: false; message: string }> {
  const owner = await requireSmmOwner();
  const input = planInput.safeParse(raw);
  if (!input.success) return { ok: false, message: 'Maydonlar noto‘g‘ri to‘ldirilgan.' };
  try {
    return { ok: true, review: (await buildPlan(owner, input.data, randomUUID())).review };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Tekshirib bo‘lmadi.' };
  }
}

/** "Rejani tasdiqlash": rebuilt on the server; a changed tariff or total comes back for a new review. */
export async function smmPlanCreate(
  token: string,
  raw: PlanInput,
  reviewed: { price: string; estimate: string | null; parts: number[] },
): Promise<{ ok: true; message: string; planId: string } | { ok: false; message: string; review?: PlanReview }> {
  const owner = await requireSmmOwner();
  if (!uuid.safeParse(token).success) return { ok: false, message: 'Ko‘rib chiqishni qaytadan boshlang.' };
  const input = planInput.safeParse(raw);
  if (!input.success) return { ok: false, message: 'Maydonlar noto‘g‘ri to‘ldirilgan.' };
  let built;
  try {
    built = await buildPlan(owner, input.data, token);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Tekshirib bo‘lmadi.' };
  }
  const { review, service, target, start } = built;
  if (review.blocked || !target || !review.estimate || !review.priceUnit) return { ok: false, message: review.blocked ?? 'Rejani tuzib bo‘lmadi.' };
  if (!samePrice(review.price, reviewed.price) || review.estimate !== reviewed.estimate || review.parts.map((p) => p.quantity).join() !== reviewed.parts.join())
    return { ok: false, message: 'Narx yoki chegaralar o‘zgardi — yangi rejani ko‘rib, qayta tasdiqlang.', review };

  const profileId =
    target.platform === 'Instagram' && target.kind === 'profile' && target.username
      ? await ensureProfile(owner, target.username)
      : input.data.profileId && (await profileExists(input.data.profileId))
        ? input.data.profileId
        : null;
  const { data, error } = await createAdminClient().rpc('neosmm_create_plan', {
    p_plan: {
      id: token,
      owner_id: owner,
      origin: 'split',
      service_id: service.id,
      service_name: service.name,
      service_category: service.category,
      service_type: service.type,
      target: review.target,
      target_key: target.key,
      queue_key: queueKey(service.id, target),
      profile_id: profileId,
      params: { service: String(service.id), link: review.target },
      total_quantity: review.total,
      spacing_seconds: review.spacingSeconds,
      start_at: new Date(start).toISOString(),
      window_seconds: review.windowSeconds,
      price: review.price,
      price_unit: review.priceUnit,
      currency: review.currency,
      estimate: review.estimate,
      can_cancel: service.cancel,
      can_refill: service.refill,
      refill_policy: review.refill,
    } as unknown as Json,
    p_parts: review.parts.map((p) => ({ part_index: p.index, order_id: randomUUID(), quantity: p.quantity, billed: p.quantity, estimate: p.estimate, planned_at: p.at })) as unknown as Json,
  });
  if (error) return { ok: false, message: 'Rejani saqlab bo‘lmadi — hech narsa yuborilmadi.' };
  await recordTarget(review.target, target, profileId);
  if (data === 'exists') return { ok: true, message: 'Bu reja allaqachon yaratilgan.', planId: token };
  // The first part, when due now, goes out right away (same checks and locks as the scheduled run).
  after(() => runWorker({ planId: token, deadlineMs: 25_000 }).then(() => undefined, () => undefined));
  return {
    ok: true,
    planId: token,
    message: `Reja saqlandi: ${review.parts.length} ta qism. Server ularni o‘z vaqtida yuboradi — brauzer yopiq bo‘lsa ham.`,
  };
}

const PLAN_COLUMNS =
  'id, origin, service_id, service_name, service_category, target, target_key, queue_key, profile_id, total_quantity, part_count, spacing_seconds, start_at, window_seconds, price, price_unit, currency, estimate, can_cancel, can_refill, refill_policy, status, pause_reason, paused_at, created_at';

export async function smmPlans() {
  await requireSmmOwner();
  const db = createAdminClient();
  const owners = smmOwnerIds();
  const { data: plans, error } = await db.from('neosmm_plans').select(PLAN_COLUMNS).in('owner_id', owners).order('created_at', { ascending: false }).limit(100);
  if (error) return { ok: false as const, message: 'Rejalarni o‘qib bo‘lmadi.', plans: [] };
  const ids = (plans ?? []).map((p) => p.id);
  const keys = [...new Set((plans ?? []).map((p) => p.queue_key))];
  const [{ data: parts }, { data: orders }, { data: queue }] = await Promise.all([
    ids.length ? db.from('neosmm_plan_parts').select('plan_id, part_index, order_id, quantity, estimate, planned_at, due_at, state, note, dispatched_at, retry_count').in('plan_id', ids).order('part_index') : Promise.resolve({ data: [] }),
    ids.length ? db.from('neosmm_orders').select(ORDER_COLUMNS).in('owner_id', owners).in('plan_id', ids).order('created_at') : Promise.resolve({ data: [] }),
    keys.length ? db.from('neosmm_queue').select('queue_key, order_id, hold, acquired_at').in('queue_key', keys) : Promise.resolve({ data: [] }),
  ]);
  // Who holds each key when it is not the plan's own part: the order a queued part is really waiting for.
  const own = new Set((parts ?? []).map((x) => x.order_id));
  const foreign = (queue ?? []).map((q) => q.order_id).filter((id) => !own.has(id));
  const { data: holders } = foreign.length
    ? await db.from('neosmm_orders').select('id, target, quantity, provider_order_id, status, state, item_id, created_at, plan_id').in('owner_id', owners).in('id', foreign)
    : { data: [] };
  return {
    ok: true as const,
    plans: (plans ?? []).map((p) => ({
      ...p,
      parts: (parts ?? []).filter((x) => x.plan_id === p.id),
      orders: (orders ?? []).filter((o) => o.plan_id === p.id),
      queue: (queue ?? []).find((q) => q.queue_key === p.queue_key) ?? null,
      holder: (holders ?? []).find((o) => o.id === (queue ?? []).find((q) => q.queue_key === p.queue_key)?.order_id) ?? null,
    })),
  };
}

const CONTROL_ERRORS: Record<string, string> = {
  not_found: 'Reja topilmadi.',
  not_active: 'Reja faol emas.',
  not_paused: 'Reja pauzada emas.',
  unresolved: 'Avval natijasi noma’lum qismni “Buyurtmalar”da hal qiling (botda tekshirib).',
  finished: 'Reja allaqachon tugagan yoki bekor qilingan.',
};

/** Pauza / Davom ettirish / Yuborilmagan qismlarni bekor qilish — unsent parts only. */
export async function smmPlanControl(id: string, action: 'pause' | 'resume' | 'cancel') {
  await requireSmmOwner();
  if (!uuid.safeParse(id).success || !['pause', 'resume', 'cancel'].includes(action)) return { ok: false as const, message: 'Reja topilmadi.' };
  const { data, error } = await createAdminClient().rpc('neosmm_plan_control', { p_plan: id, p_action: action, p_owner_ids: smmOwnerIds() });
  const r = (data ?? {}) as { ok?: boolean; code?: string; cancelled?: number; inflight?: number };
  if (error || !r.ok) return { ok: false as const, message: CONTROL_ERRORS[r.code ?? ''] ?? 'Amalni bajarib bo‘lmadi.' };
  if (action === 'resume') after(() => runWorker({ planId: id, deadlineMs: 25_000 }).then(() => undefined, () => undefined));
  if (action === 'cancel')
    return {
      ok: true as const,
      message: `${r.cancelled ?? 0} ta yuborilmagan qism bekor qilindi.${r.inflight ? ` ${r.inflight} tasi allaqachon yuborilgan yoki natijasi noma’lum — u provayderdagi holatida qoladi (bekor qilish uchun buyurtmaning o‘zida “Bekor qilish”).` : ''}`,
    };
  return { ok: true as const, message: action === 'pause' ? 'Reja pauza qilindi: yangi qismlar yuborilmaydi.' : 'Reja davom ettirildi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Service health: the owner's switch, clearing a block, verified refill terms
// ---------------------------------------------------------------------------------------------------------------
export async function smmHealth(): Promise<HealthRow[]> {
  await requireSmmOwner();
  return [...(await loadHealth()).values()];
}

export async function smmServiceSet(
  serviceId: number,
  action: 'disable' | 'enable' | 'clear_block',
  meta: { name?: string; category?: string } = {},
): Promise<{ ok: boolean; message: string; row?: HealthRow }> {
  const owner = await requireSmmOwner();
  if (!Number.isSafeInteger(serviceId) || serviceId <= 0) return { ok: false, message: 'Xizmat topilmadi.' };
  const now = new Date().toISOString();
  const patch =
    action === 'disable'
      ? { disabled_at: now, disabled_by: owner }
      : action === 'enable'
        ? { disabled_at: null, disabled_by: null }
        : // Back to "Tekshirilmagan" — earlier evidence does not count any more.
          { blocked_at: null, blocked_reason: null, blocked_order: null, cleared_at: now, cleared_by: owner };
  const { data, error } = await createAdminClient()
    .from('neosmm_service_health')
    .upsert({ service_id: serviceId, service_name: meta.name?.slice(0, 500) ?? null, service_category: meta.category?.slice(0, 200) ?? null, ...patch }, { onConflict: 'provider,service_id', ignoreDuplicates: false })
    .select(HEALTH_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, message: 'Saqlab bo‘lmadi.' };
  return {
    ok: true,
    message: action === 'disable' ? 'Xizmat qo‘lda o‘chirildi: yangi buyurtma qabul qilinmaydi.' : action === 'enable' ? 'Xizmat yoqildi.' : 'Blok olib tashlandi: xizmat “Tekshirilmagan”.',
    row: data as HealthRow,
  };
}

const terms = z.object({ days: int.min(1).max(3650), starts: z.enum(['accepted', 'completed']), basis: z.string().trim().min(5).max(500) });

/** The owner's verified refill terms for a service (used as the snapshot of its next orders; older orders keep theirs). */
export async function smmServiceRefillTerms(serviceId: number, raw: z.infer<typeof terms> | null, meta: { name?: string; category?: string } = {}) {
  const owner = await requireSmmOwner();
  if (!Number.isSafeInteger(serviceId) || serviceId <= 0) return { ok: false as const, message: 'Xizmat topilmadi.' };
  const t = raw ? terms.safeParse(raw) : null;
  if (t && !t.success) return { ok: false as const, message: 'Muddat (kun), boshlanish hodisasi va manbani (qayerda tasdiqlangan) kiriting.' };
  const value = t?.success
    ? { refill_days: t.data.days, refill_starts: t.data.starts, refill_basis: t.data.basis, refill_verified_by: owner, refill_verified_at: new Date().toISOString() }
    : { refill_days: null, refill_starts: null, refill_basis: null, refill_verified_by: null, refill_verified_at: null };
  const { error } = await createAdminClient()
    .from('neosmm_service_health')
    .upsert({ service_id: serviceId, service_name: meta.name?.slice(0, 500) ?? null, service_category: meta.category?.slice(0, 200) ?? null, ...value }, { onConflict: 'provider,service_id' });
  if (error) return { ok: false as const, message: 'Saqlab bo‘lmadi.' };
  return { ok: true as const, message: t ? 'Kafolat shartlari saqlandi — keyingi buyurtmalarga yoziladi.' : 'Kafolat shartlari olib tashlandi.' };
}

/** Verified terms for one order that has none recorded yet (a recorded snapshot is never rewritten). */
export async function smmOrderRefillTerms(orderId: string, raw: z.infer<typeof terms>) {
  await requireSmmOwner();
  if (!uuid.safeParse(orderId).success) return { ok: false as const, message: 'Buyurtma topilmadi.' };
  const t = terms.safeParse(raw);
  if (!t.success) return { ok: false as const, message: 'Muddat (kun), boshlanish hodisasi va manbani kiriting.' };
  const db = createAdminClient();
  const { data: o } = await db.from('neosmm_orders').select('id, kind, can_refill, refill_policy').eq('id', orderId).in('owner_id', smmOwnerIds()).maybeSingle();
  if (!o || o.kind !== 'smm') return { ok: false as const, message: 'Buyurtma topilmadi.' };
  if (readPolicy(o.refill_policy)?.verified) return { ok: false as const, message: 'Bu buyurtmaning kafolat shartlari allaqachon yozilgan — o‘zgartirilmaydi.' };
  const policy: RefillPolicy = { api: o.can_refill, verified: true, days: t.data.days, starts: t.data.starts, basis: t.data.basis, verified_at: new Date().toISOString() };
  const { error } = await db.from('neosmm_orders').update({ refill_policy: policy as unknown as Json }).eq('id', orderId).in('owner_id', smmOwnerIds());
  return error ? { ok: false as const, message: 'Saqlab bo‘lmadi.' } : { ok: true as const, message: 'Kafolat shartlari shu buyurtmaga yozildi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Recent targets
// ---------------------------------------------------------------------------------------------------------------
export async function smmTargets() {
  await requireSmmOwner();
  const { data } = await createAdminClient()
    .from('neosmm_recent_targets')
    .select('target_key, platform, target, kind, username, profile_id, last_used_at, use_count')
    .is('hidden_at', null)
    .order('last_used_at', { ascending: false })
    .limit(60);
  return data ?? [];
}

/** Removes a suggestion; the orders that used the link stay as they are. */
export async function smmTargetHide(key: string) {
  await requireSmmOwner();
  if (typeof key !== 'string' || !key || key.length > 600) return { ok: false as const };
  const { error } = await createAdminClient().from('neosmm_recent_targets').update({ hidden_at: new Date().toISOString() }).eq('target_key', key);
  return { ok: !error };
}

// ---------------------------------------------------------------------------------------------------------------
// Profile cards and observations
// ---------------------------------------------------------------------------------------------------------------
const OBS_COLUMNS = 'id, profile_id, observed_at, followers, following, media_count, display_name, source, origin, note';
// The Instagram connection as the card shows it — never a token.
const IG_COLUMNS = 'profile_id, status, username, account_type, permissions, connected_at, last_attempt_at, last_success_at, last_error, last_error_at, next_sync_at, token_expires_at';

export async function smmProfiles() {
  await requireSmmOwner();
  const db = createAdminClient();
  const owners = smmOwnerIds();
  const { data: profiles } = await db.from('neosmm_profiles').select('id, platform, username, ig_user_id, display_name, display_name_source, avatar_url, created_at').order('updated_at', { ascending: false }).limit(200);
  const ids = (profiles ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const [{ data: obs }, { data: orders }, { data: plans }, { data: ig }] = await Promise.all([
    db.from('neosmm_profile_observations').select(OBS_COLUMNS).in('profile_id', ids).order('observed_at', { ascending: true }).limit(5000),
    db.from('neosmm_orders').select('id, profile_id, state, status, charge, estimate, currency, queue_key, created_at').in('owner_id', owners).in('profile_id', ids).limit(2000),
    db.from('neosmm_plans').select('id, profile_id, status').in('owner_id', owners).in('profile_id', ids).limit(500),
    db.from('neosmm_ig_connections').select(IG_COLUMNS).in('profile_id', ids),
  ]);
  return (profiles ?? []).map((p) => ({
    ...p,
    observations: (obs ?? []).filter((o) => o.profile_id === p.id),
    orders: (orders ?? []).filter((o) => o.profile_id === p.id),
    plans: (plans ?? []).filter((x) => x.profile_id === p.id),
    ig: (ig ?? []).find((x) => x.profile_id === p.id) ?? null,
  }));
}

export async function smmProfile(id: string) {
  await requireSmmOwner();
  if (!uuid.safeParse(id).success) return null;
  const db = createAdminClient();
  const owners = smmOwnerIds();
  const { data: profile } = await db.from('neosmm_profiles').select('id, platform, username, ig_user_id, display_name, display_name_source, avatar_url, created_at').eq('id', id).maybeSingle();
  if (!profile) return null;
  const [{ data: observations }, { data: orders }, { data: plans }, { data: ig }] = await Promise.all([
    db.from('neosmm_profile_observations').select(OBS_COLUMNS).eq('profile_id', id).order('observed_at', { ascending: true }).limit(2000),
    db.from('neosmm_orders').select(ORDER_COLUMNS).in('owner_id', owners).eq('profile_id', id).order('created_at', { ascending: false }).limit(300),
    db.from('neosmm_plans').select(PLAN_COLUMNS).in('owner_id', owners).eq('profile_id', id).order('created_at', { ascending: false }).limit(100),
    db.from('neosmm_ig_connections').select(IG_COLUMNS).eq('profile_id', id).maybeSingle(),
  ]);
  const keys = [...new Set((orders ?? []).map((o) => o.queue_key).filter((k): k is string => !!k))];
  const { data: queue } = keys.length ? await db.from('neosmm_queue').select('queue_key, order_id, hold, acquired_at').in('queue_key', keys) : { data: [] };
  return { profile, observations: observations ?? [], orders: orders ?? [], plans: plans ?? [], queue: queue ?? [], ig: ig ?? null };
}

const observation = z.object({
  followers: int.min(0).max(10_000_000_000).nullable().optional(),
  following: int.min(0).max(10_000_000_000).nullable().optional(),
  mediaCount: int.min(0).max(10_000_000).nullable().optional(),
  displayName: z.string().trim().max(150).nullable().optional(),
  /** ISO; null — now. */
  observedAt: z.string().max(40).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** A manual observation: what the owner saw on the profile, and when (labelled "qo‘lda" everywhere). */
export async function smmObservationAdd(profileId: string, raw: z.infer<typeof observation>) {
  const owner = await requireSmmOwner();
  if (!uuid.safeParse(profileId).success || !(await profileExists(profileId))) return { ok: false as const, message: 'Profil topilmadi.' };
  const v = observation.safeParse(raw);
  if (!v.success) return { ok: false as const, message: 'Qiymatlarni butun son bilan kiriting.' };
  const { followers = null, following = null, mediaCount = null, displayName = null, note = null } = v.data;
  if (followers === null && following === null && mediaCount === null && !displayName) return { ok: false as const, message: 'Kamida bitta qiymat kiriting.' };
  const at = v.data.observedAt ? Date.parse(v.data.observedAt) : Date.now();
  if (!Number.isFinite(at) || at > Date.now() + 60_000) return { ok: false as const, message: 'Kuzatuv vaqti kelajakda bo‘lmasin.' };
  const db = createAdminClient();
  const { error } = await db.from('neosmm_profile_observations').insert({
    profile_id: profileId,
    observed_at: new Date(at).toISOString(),
    followers,
    following,
    media_count: mediaCount,
    display_name: displayName || null,
    source: 'manual',
    origin: 'Egasi qo‘lda kiritdi',
    note: note || null,
    created_by: owner,
  });
  if (error) return { ok: false as const, message: 'Saqlab bo‘lmadi.' };
  if (displayName) await db.from('neosmm_profiles').update({ display_name: displayName, display_name_source: 'manual' }).eq('id', profileId);
  return { ok: true as const, message: 'Kuzatuv saqlandi.' };
}

/** Removes a manual observation entered by mistake (API observations are kept). */
export async function smmObservationDelete(id: string) {
  await requireSmmOwner();
  if (!uuid.safeParse(id).success) return { ok: false as const, message: 'Topilmadi.' };
  const { error, count } = await createAdminClient().from('neosmm_profile_observations').delete({ count: 'exact' }).eq('id', id).eq('source', 'manual');
  return !error && count ? { ok: true as const, message: 'O‘chirildi.' } : { ok: false as const, message: 'O‘chirib bo‘lmadi.' };
}

/** Profile cards to pick from (for linking a post / reels order explicitly). */
export async function smmProfileList() {
  await requireSmmOwner();
  const { data } = await createAdminClient().from('neosmm_profiles').select('id, username, display_name').order('username').limit(300);
  return data ?? [];
}
