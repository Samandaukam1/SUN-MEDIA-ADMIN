import 'server-only';

import { syncDue } from '@/lib/instagram/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

import { adapterOf, smmEstimate, type Service } from './catalog';
import { decCmp, parseDec } from './decimal';
import { healthOf, type ErrorKind } from './health';
import { adoptOpenOrders, loadBalance, loadCatalog, loadHealth, neosmm, orderStore, ownerActive, refreshStatuses, smmConfig, type Balance, type Catalog } from './server';
import { runPool } from './schedule';
import { sendClaimed } from './submit';

/**
 * The scheduled-order worker (called every minute by pg_cron through /api/smm/worker, and right after the owner creates
 * a plan). Each run: recovers interrupted claims, follows open orders, then sends the due parts of independent plans —
 * each after fresh checks of the plan, the service, its tariff and limits, and the balance. Plans never wait for each
 * other: only parts on the same service + target share a queue key (the provider takes one active order per link and
 * service). Checks run one by one (the balance is reserved part by part); the sends then go a few at a time. A part
 * whose check fails is not sent: its plan pauses with the reason (or, for a passing outage, the part simply waits).
 * An unclear result is never resent by itself.
 */

export type WorkerReport = { recovered: number; adopted: number; checked: number; sent: number; paused: number; waiting: number; profiles: number; skipped?: string };

const STATUS_STALE_MS = 150_000;
const MAX_SENDS_PER_RUN = 12;
// Provider connections open at once from one run (independent targets; NeoSMM publishes no rate limit — kept modest).
const SEND_CONCURRENCY = 4;
// Passing refusals: the database gives the part its own retry time; the plan stays active.
const PASSING: ReadonlySet<ErrorKind> = new Set(['maintenance', 'active_order', 'network']);

type Claimed = { plan_id: string; part_index: number; order_id: string };

/** `deadlineMs`: no new provider call starts after this (a started one may still take the 30 s write timeout). */
export async function runWorker({ planId = null, deadlineMs = 25_000 }: { planId?: string | null; deadlineMs?: number } = {}): Promise<WorkerReport> {
  const started = Date.now();
  const report: WorkerReport = { recovered: 0, adopted: 0, checked: 0, sent: 0, paused: 0, waiting: 0, profiles: 0 };
  const { ownerIds, keyConfigured, rateUnit } = smmConfig();
  if (!ownerIds.length) return { ...report, skipped: 'owners' };
  if (!keyConfigured) return { ...report, skipped: 'key' };
  const db = createAdminClient();

  report.recovered = ((await db.rpc('neosmm_recover')).data as number | null) ?? 0;
  report.adopted = await adoptOpenOrders();
  if (!planId) {
    report.checked = (await refreshStatuses(STATUS_STALE_MS)).checked;
    // Connected Instagram profiles due for their hourly reading (independent of NeoSMM; a failure there is recorded per card).
    report.profiles = await syncDue().catch(() => 0);
  }

  const { data: claimed, error } = await db.rpc('neosmm_claim_parts', { p_limit: MAX_SENDS_PER_RUN, p_lease_seconds: 120, p_plan: planId ?? undefined });
  if (error || !claimed?.length) return report;

  const catalogs = new Map<string, Catalog<'services'>>();
  let balance: Balance | null = null;
  let spentSinceBalance = { n: 0n, s: 2 };
  const health = await loadHealth();

  type Ready = { c: Claimed; send: () => Promise<void> };
  const ready: Ready[] = [];
  const unclaimOf = (c: Claimed) => async (reason: string | null, retryInSec?: number) => {
    await db.rpc('neosmm_unclaim_part', {
      p_order: c.order_id,
      p_pause_reason: reason ?? undefined,
      p_due_at: retryInSec ? new Date(Date.now() + retryInSec * 1000).toISOString() : undefined,
    });
    if (reason) report.paused++;
    else report.waiting++;
  };

  for (const c of claimed as Claimed[]) {
    const unclaim = unclaimOf(c);
    if (Date.now() - started > deadlineMs) {
      await unclaim(null);
      continue;
    }
    const { data: plan } = await db.from('neosmm_plans').select('*').eq('id', c.plan_id).in('owner_id', ownerIds).maybeSingle();
    const { data: part } = await db.from('neosmm_plan_parts').select('*').eq('plan_id', c.plan_id).eq('part_index', c.part_index).maybeSingle();
    if (!plan || !part) {
      await unclaim('Reja egasi tasdiqlanmadi — yuborilmadi.');
      continue;
    }
    if (!(await ownerActive(plan.owner_id))) {
      await unclaim('Reja egasining akkaunti faol emas yoki egalar ro‘yxatida yo‘q — yuborilmadi.');
      continue;
    }
    if (!rateUnit) {
      await unclaim('SMM tarif birligi tasdiqlanmagan — narxni hisoblab bo‘lmaydi.');
      continue;
    }

    let catalog = catalogs.get(plan.owner_id);
    if (!catalog) {
      catalog = await loadCatalog(plan.owner_id, 'services', true);
      catalogs.set(plan.owner_id, catalog);
    }
    if (catalog.stale || catalog.error) {
      // A failed catalogue fetch is not a removed service: the part waits and is tried again.
      await unclaim(null, 120);
      continue;
    }
    const service: Service | undefined = catalog.items.find((s) => s.id === plan.service_id);
    if (!service) {
      await unclaim('Xizmat yangi katalogda yo‘q — yuborilmadi. Boshqa xizmat tanlang yoki rejani bekor qiling.');
      continue;
    }
    const h = healthOf(health.get(service.id));
    if (!h.orderable) {
      await unclaim(`Xizmat holati: ${h.label}${h.reason ? ` (${h.reason})` : ''} — yuborilmadi.`);
      continue;
    }
    if (!adapterOf(service.type)) {
      await unclaim(`Xizmat turi o‘zgardi (“${service.type}”) — yuborilmadi.`);
      continue;
    }
    const lo = service.min ?? 1;
    const hi = service.max ?? Number.MAX_SAFE_INTEGER;
    if (part.quantity < lo || part.quantity > hi) {
      await unclaim(`Xizmat chegaralari o‘zgardi: endi ${lo}–${hi}, bu qism ${part.quantity} ta. Rejani qayta tuzing.`);
      continue;
    }
    const now = parseDec(service.rate);
    const confirmed = parseDec(plan.price);
    if (!now || !confirmed || decCmp(now, confirmed) > 0) {
      await unclaim(`Narx oshdi: ${plan.price} → ${service.rate} (${rateUnit} ta uchun). Ko‘rib chiqib, qayta tasdiqlang.`);
      continue;
    }
    const estimate = smmEstimate(service, part.billed, rateUnit);
    if (!estimate) {
      await unclaim('Narxni hisoblab bo‘lmadi — yuborilmadi.');
      continue;
    }

    balance ??= await loadBalance();
    if (!balance.ok) {
      if (balance.reason === 'config' || /api kaliti|API o‘chirilgan/.test(balance.error)) await unclaim(`NeoSMM hisobi: ${balance.error}`);
      else await unclaim(null, balance.reason === 'unavailable' ? 600 : 120);
      continue;
    }
    const left = parseDec(balance.balance);
    const need = parseDec(estimate)!;
    const scale = Math.max(left?.s ?? 0, need.s, spentSinceBalance.s);
    const at = (d: { n: bigint; s: number }) => d.n * 10n ** BigInt(scale - d.s);
    if (!left || at(left) - at(spentSinceBalance) < at(need)) {
      await unclaim('Balansda mablag‘ yetarli emas. Bot orqali to‘ldiring, so‘ng “Davom ettirish”ni bosing.');
      continue;
    }

    const params: Record<string, string> = { ...((plan.params ?? {}) as Record<string, string>), service: String(plan.service_id), link: plan.target };
    if (plan.origin === 'split' || 'quantity' in params) params.quantity = String(part.quantity);
    const row = {
      owner_id: plan.owner_id,
      kind: 'smm',
      item_id: service.id,
      item_name: service.name,
      item_category: service.category,
      item_type: service.type,
      price: service.rate,
      price_unit: rateUnit,
      currency: plan.currency,
      target: plan.target,
      params,
      quantity: part.quantity,
      estimate,
      can_cancel: service.cancel,
      can_refill: service.refill,
      target_key: plan.target_key,
      profile_id: plan.profile_id,
      refill_policy: plan.refill_policy,
    };
    // Reserved now, so the next part's balance check already counts this one.
    const s = Math.max(need.s, spentSinceBalance.s);
    spentSinceBalance = { n: spentSinceBalance.n * 10n ** BigInt(s - spentSinceBalance.s) + need.n * 10n ** BigInt(s - need.s), s };
    ready.push({
      c,
      send: async () => {
        // Last check under the plan's lock (pause / cancel / ownership), the order row written in the same transaction;
        // the provider call follows at once, so no written row is left unsent by this run.
        const { data: begun } = await db.rpc('neosmm_begin_send', { p_order: c.order_id, p_row: row as unknown as Json });
        if (begun !== 'ok') {
          report.waiting++;
          return;
        }
        const outcome = await sendClaimed(orderStore(plan.owner_id), neosmm, { id: c.order_id, currency: plan.currency }, { action: 'add', ...params });
        if (outcome.state === 'accepted') {
          report.sent++;
          if (!outcome.saved) console.error('smm worker: accepted order not saved', { order: c.order_id, provider: outcome.providerOrderId });
        } else if (outcome.state === 'rejected' && PASSING.has(outcome.errorKind)) {
          report.waiting++;
          // The provider asked for a longer wait than the database's own step: honour it.
          if (outcome.retryAfter) {
            const at = new Date(Date.now() + outcome.retryAfter * 1000).toISOString();
            await db.from('neosmm_plan_parts').update({ due_at: at }).eq('plan_id', c.plan_id).eq('part_index', c.part_index).eq('state', 'planned').lt('due_at', at);
          }
        } else report.paused++;
      },
    });
  }

  await runPool(ready, SEND_CONCURRENCY, async (r) => {
    if (Date.now() - started > deadlineMs) await unclaimOf(r.c)(null);
    // One part's trouble never stops the others; whatever was written is settled by neosmm_recover, never resent.
    else await r.send().catch((e) => console.error('smm worker: send failed', { order: r.c.order_id, error: e instanceof Error ? e.message : 'unknown' }));
  });
  return report;
}
