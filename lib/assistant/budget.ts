import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { ModelUsage } from './gemini';
import { sunnyConfig, type SunnyConfig } from './sunny';
import type { AssistantContext } from './tools';

type Who = Pick<AssistantContext, 'userId' | 'visitorKey' | 'audience'>;
const whoOf = (ctx: Pick<AssistantContext, 'userId' | 'visitorKey'>) => (ctx.userId ? `u:${ctx.userId}` : ctx.visitorKey ? `v:${ctx.visitorKey}` : null);

/**
 * Sunny's AI budget: one question that needs the AI = one count for this person today (the account, or the visitor's
 * one-way key), within the owner's daily limit; and, when the owner set a monthly money cap, the month's estimated
 * cost must still be under it. Only the AI path is counted: exact commands answered by the system are free. If the
 * counters are unavailable (not migrated yet, the database busy), the question goes through — Sunny never refuses a
 * person because of its own bookkeeping.
 */
export async function budgetGate(ctx: Pick<AssistantContext, 'userId' | 'visitorKey'>): Promise<'ok' | 'daily' | 'money'> {
  const who = whoOf(ctx);
  try {
    const db = createAdminClient();
    const [spend, money] = await Promise.all([who ? db.rpc('assistant_spend', { p_who: who, p_member: !!ctx.userId }) : null, db.rpc('assistant_money_ok')]);
    if (spend && !spend.error && spend.data === false) return 'daily';
    if (!money.error && money.data === false) return 'money';
    return 'ok';
  } catch {
    return 'ok';
  }
}

/**
 * What the AI calls of one reply used, as the provider reported them, with the estimated cost from the owner's prices
 * (none configured → recorded without a cost, never a guessed one). Bookkeeping never fails a reply.
 */
export async function recordUsage(ctx: Who, provider: string, usage: ModelUsage[]): Promise<void> {
  const who = whoOf(ctx);
  if (!who || !usage.length) return;
  try {
    const db = createAdminClient();
    await Promise.all(
      usage.map((u) =>
        db.rpc('assistant_record', { p_who: who, p_audience: ctx.audience, p_provider: provider, p_model: u.model, p_input: u.input, p_output: u.output, p_cached: u.cached, p_thoughts: u.thoughts }),
      ),
    );
  } catch {
    // not migrated yet or the database busy: the reply is already on its way
  }
}

/** What the person reads when the budget is used up (honest, with what still works). */
export const BUDGET_SPENT = {
  public: 'Bugungi suhbat limitim tugadi. Ertaga yana yozing — yoki ariza qoldiring, menejerimiz o‘zi bog‘lanadi.',
  member: 'Bugungi AI limiti tugadi. Aniq buyruqlar ishlayveradi: "vazifalarim", "keldim", "bugun qanday ishlarim bor?". Ertaga to‘liq davom etamiz.',
  money: 'Bu oy uchun belgilangan AI xarajati chegarasiga yetildi (egasi sozlamada oshirishi mumkin). Aniq buyruqlar ishlayveradi: "vazifalarim", "keldim", "bugun qanday ishlarim bor?".',
  moneyPublic: 'Hozir suhbat imkonim cheklangan. Ariza qoldiring — menejerimiz o‘zi bog‘lanadi.',
} as const;

/** One reply's real timings (Sozlamalar → Sunny AI shows P50 / P95). Bookkeeping never fails a reply. */
export type ReplyTiming = {
  path: 'local' | 'primary' | 'complex';
  provider?: string;
  model?: string;
  firstMs: number | null;
  totalMs: number;
  prepMs?: number | null;
  apiMs?: number | null;
  toolMs?: number | null;
  toolCalls?: number;
  rounds?: number;
  failed?: boolean;
  stopped?: boolean;
};
export async function recordReply(ctx: Pick<AssistantContext, 'audience'>, t: ReplyTiming): Promise<void> {
  try {
    await createAdminClient().rpc('assistant_reply_record', {
      p_audience: ctx.audience,
      p_path: t.path,
      p_provider: t.provider ?? '',
      p_model: t.model ?? '',
      p_first_ms: t.firstMs ?? -1,
      p_total_ms: Math.max(0, Math.round(t.totalMs)),
      p_prep_ms: t.prepMs ?? -1,
      p_api_ms: t.apiMs ?? -1,
      p_tool_ms: t.toolMs ?? -1,
      p_tool_calls: t.toolCalls ?? 0,
      p_rounds: t.rounds ?? 0,
      p_failed: !!t.failed,
      p_stopped: !!t.stopped,
    });
  } catch {
    // not migrated yet or the database busy
  }
}

let settingsCache: { at: number; cfg: SunnyConfig } | null = null;
/** Sunny's model settings: SUNNY_* env, overridden by the owner's saved ones (read at most every 30 s). */
export async function sunnySettings(): Promise<SunnyConfig> {
  if (settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.cfg;
  let stored: unknown = null;
  try {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'assistant.config').maybeSingle();
    stored = data?.value ?? null;
  } catch {
    // unavailable: the environment's settings apply
  }
  const cfg = sunnyConfig(process.env, stored);
  settingsCache = { at: Date.now(), cfg };
  return cfg;
}
