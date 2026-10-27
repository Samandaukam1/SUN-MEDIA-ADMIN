import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { AssistantContext } from './tools';

/**
 * Sunny's daily AI budget (phase 9): one question that needs the AI = one count for this person today (the account,
 * or the visitor's one-way key), within the owner's limit (app_settings). Only the AI path is counted: exact commands
 * answered by the system are free. If the counter itself is unavailable (not migrated yet, the database busy), the
 * question goes through — Sunny never refuses a person because of its own bookkeeping.
 */
export async function withinBudget(ctx: Pick<AssistantContext, 'userId' | 'visitorKey'>): Promise<boolean> {
  const who = ctx.userId ? `u:${ctx.userId}` : ctx.visitorKey ? `v:${ctx.visitorKey}` : null;
  if (!who) return true;
  try {
    const { data, error } = await createAdminClient().rpc('assistant_spend', { p_who: who, p_member: !!ctx.userId });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

/** What the person reads when today's share is used up (honest, with what still works). */
export const BUDGET_SPENT = {
  public: 'Bugungi suhbat limitim tugadi. Ertaga yana yozing — yoki ariza qoldiring, menejerimiz o‘zi bog‘lanadi.',
  member: 'Bugungi AI limiti tugadi. Aniq buyruqlar ishlayveradi: "vazifalarim", "keldim", "bugun qanday ishlarim bor?". Ertaga to‘liq davom etamiz.',
} as const;
