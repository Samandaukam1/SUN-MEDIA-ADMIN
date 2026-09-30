'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { rewardCampaignSchema, rewardCampaignUpdateSchema, safiLevelSchema, type SafiLevel } from '@/lib/schemas/game-rewards';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const rulesPath = '/clients/games/safi-penalty/rewards/rules';

function refresh() {
  revalidatePath(rulesPath);
  revalidatePath('/clients/games/safi-penalty');
}

function readConfig(formData: FormData): unknown {
  const raw = formData.get('config');
  if (typeof raw !== 'string' || raw.length > 20_000) throw new Error('INVALID_CONFIG');
  return JSON.parse(raw);
}

/** A new reward campaign with its rules (draft, or switched on at once). */
export async function createRewardCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  let config: unknown;
  try {
    config = readConfig(formData);
  } catch {
    return { status: 'error', message: 'Kampaniya sozlamalarini tekshiring.' };
  }
  const parsed = rewardCampaignSchema.safeParse(config);
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_game_reward_campaign', { p_config: parsed.data });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refresh();
  return { status: 'success', message: parsed.data.status === 'active' ? 'Kampaniya ishga tushdi. Qoidalar keyingi Reward Mode raundlaridan qo‘llanadi.' : 'Qoralama saqlandi. Kampaniya hali mukofot bermaydi.' };
}

/** Name, dates and rules of an existing campaign. Applies to rounds that end from now on — no app update needed. */
export async function updateRewardCampaign(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Kampaniya topilmadi.' };
  let config: unknown;
  try {
    config = readConfig(formData);
  } catch {
    return { status: 'error', message: 'Kampaniya sozlamalarini tekshiring.' };
  }
  const parsed = rewardCampaignUpdateSchema.safeParse(config);
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  let removedRaw: unknown = [];
  try {
    removedRaw = JSON.parse(String(formData.get('removed') ?? '[]'));
  } catch {
    removedRaw = [];
  }
  const removed = z.array(z.number().int().min(1).max(10)).safeParse(removedRaw);
  const rules = [...parsed.data.rules, ...(removed.success ? removed.data.map((score) => ({ score, remove: true })) : [])];
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_game_reward_campaign', { p_campaign: id, p_config: { ...parsed.data, rules } });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refresh();
  return { status: 'success', message: 'Saqlandi. O‘zgarish keyingi tugagan raunddan kuchga kiradi.' };
}

export async function setRewardCampaignStatus(id: string, status: 'active' | 'paused' | 'ended'): Promise<ActionState> {
  await requirePermission('promo.manage');
  const parsed = z.object({ id: z.uuid(), status: z.enum(['active', 'paused', 'ended']) }).safeParse({ id, status });
  if (!parsed.success) return { status: 'error', message: 'Kampaniya yoki holat noto‘g‘ri.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_game_reward_campaign_status', { p_campaign: parsed.data.id, p_status: parsed.data.status });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refresh();
  return { status: 'success', message: status === 'active' ? 'Kampaniya yoqildi — Reward Mode ochiq.' : status === 'paused' ? 'Kampaniya pauzada — mukofot berilmaydi.' : 'Kampaniya tugatildi. Tarixi saqlanadi.' };
}

/** The level new rounds start with (a running round keeps its own). */
export async function setSafiLevel(level: SafiLevel): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!safiLevelSchema.safeParse(level).success) return { status: 'error', message: 'Bunday daraja yo‘q.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_game_center_difficulty', { p_game_key: 'safi-penalty', p_difficulty: level });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refresh();
  return { status: 'success', message: 'Daraja yangilandi. Yangi raundlarga qo‘llanadi.' };
}
