'use server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fromLocalInput } from '@/lib/time';
import { safiCosmetic, safiEvent, safiLimits, safiRuntime } from '@/lib/schemas/safi-production';
import type { ActionState } from './state';

export async function saveSafiProduction(_: ActionState, form: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const operation = form.get('operation');
  const num = (key: string) => { const v = form.get(key); return typeof v === 'string' && v.trim() ? Number(v) : NaN; };
  const on = (key: string) => form.get(key) === 'on';
  const id = form.get('id') || undefined;
  let name: string;
  let params: Record<string, unknown>;
  if (operation === 'runtime') {
    const parsed = safiRuntime.safeParse({ enabled: on('enabled'), practice_enabled: on('practice_enabled'), reward_enabled: on('reward_enabled'), leaderboards_enabled: on('leaderboards_enabled'), free_interval_hours: num('free_interval_hours'), attempt_cost: num('attempt_cost'), lucky_chance: num('lucky_percent') / 100, arena: form.get('arena'), personality: form.get('personality') });
    if (!parsed.success) return { status: 'error', message: 'O‘yin sozlamalarini tekshiring.' };
    name = 'configure_safi'; params = { p_config: parsed.data };
  } else if (operation === 'event') {
    const parsed = safiEvent.safeParse({ id, title: form.get('title'), enabled: on('enabled'), boss: on('boss'), starts_at: fromLocalInput(String(form.get('starts_at'))), ends_at: fromLocalInput(String(form.get('ends_at'))), arena: form.get('arena'), personality: form.get('personality') });
    if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Tadbirni tekshiring.' };
    name = 'save_safi_event'; params = { p_config: parsed.data };
  } else if (operation === 'cosmetic') {
    const parsed = safiCosmetic.safeParse({ id, code: form.get('code'), title: form.get('title'), enabled: on('enabled'), slot: form.get('slot'), price: num('price'), appearance: { color: form.get('color') || undefined, arena: form.get('appearance_arena') || undefined, symbol: form.get('symbol') || undefined } });
    if (!parsed.success) return { status: 'error', message: 'Buyum sozlamalarini tekshiring.' };
    name = 'save_safi_cosmetic'; params = { p_config: parsed.data };
  } else if (operation === 'limits') {
    const parsed = safiLimits.safeParse({ id, maxWins: form.get('maxWins') ? num('maxWins') : null, cooldownHours: num('cooldownHours') });
    if (!parsed.success) return { status: 'error', message: 'Mukofot limitlarini tekshiring.' };
    name = 'set_safi_campaign_limits'; params = { p_campaign: parsed.data.id, p_max_wins: parsed.data.maxWins, p_cooldown_hours: parsed.data.cooldownHours };
  } else return { status: 'error', message: 'Amal mavjud emas.' };
  const client = await createClient();
  const { error } = await client.rpc(name as never, params as never);
  if (error) return { status: 'error', message: 'Saqlanmadi. Qiymatlarni tekshirib qayta urinib ko‘ring.' };
  revalidatePath('/clients/games/safi-penalty/control');
  revalidatePath('/clients/games/safi-penalty');
  return { status: 'success', message: 'SAFI sozlamalari saqlandi.' };
}
