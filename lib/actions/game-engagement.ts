'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { engagementCapSchema, engagementDefinitionSchema } from '@/lib/schemas/game-engagement';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const engagementPath = '/clients/games/engagement';

export async function configureGameEngagement(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const rawCap = formData.get('dailyCoinCap');
  const parsed = engagementCapSchema.safeParse({ gameId: 'safi-penalty', dailyCoinCap: typeof rawCap === 'string' && rawCap.trim() ? Number(rawCap) : Number.NaN });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Limitni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('configure_game_engagement', { p_game_key: parsed.data.gameId, p_daily_coin_cap: parsed.data.dailyCoinCap });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(engagementPath);
  return { status: 'success', message: 'Kunlik SUN Coin limiti saqlandi.' };
}

export async function saveGameEngagementDefinition(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  let config: unknown;
  try {
    const raw = formData.get('config');
    if (typeof raw !== 'string' || raw.length > 5000) throw new Error('INVALID_CONFIG');
    config = JSON.parse(raw);
  } catch {
    return { status: 'error', message: 'Topshiriq sozlamalarini tekshiring.' };
  }
  const parsed = engagementDefinitionSchema.safeParse(config);
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_game_engagement_definition', { p_config: parsed.data });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(engagementPath);
  return { status: 'success', message: parsed.data.enabled ? 'Saqlandi. Topshiriq yoqilgan.' : 'Saqlandi. Topshiriq OFF.' };
}
