'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Rang #RRGGBB ko‘rinishida');

const campaignSchema = z
  .object({
    client_id: z.uuid('Mijozni tanlang'),
    template: z.enum(['penalty', 'pour']),
    title: z.string().trim().min(1, 'Nomini yozing').max(80),
    subtitle: z.string().trim().max(160).transform((v) => v || null),
    rules: z.string().trim().max(1000).transform((v) => v || null),
    primary: color,
    background: color,
    text: color,
    attempts: z.coerce.number().int().min(1).max(30),
    target_score: z.coerce.number().int().min(1),
    difficulty: z.enum(['easy', 'normal', 'hard', 'extreme']),
    reward_days: z.coerce.number().int().min(1).max(365),
    win_mode: z.enum(['skill', 'probability', 'first_play_guaranteed', 'next_player_guaranteed']),
    win_percent: z.coerce.number().min(0).max(100),
    cooldown_minutes: z.coerce.number().int().min(0).max(10080),
    max_sessions_per_day: z.coerce.number().int().min(1).max(100),
    max_wins_per_user: z.coerce.number().int().min(1).max(100),
    max_rewards_total: z.string().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().positive().nullable()),
    starts_at: z.string().transform((v) => (v ? new Date(v).toISOString() : new Date().toISOString())),
    ends_at: z.string().transform((v) => (v ? new Date(v).toISOString() : null)),
  })
  .refine((v) => v.target_score <= v.attempts, { message: 'Maqsad urinishlar sonidan oshmasin', path: ['target_score'] });

/** Mijozlar → O‘yinlar → Yangi kampaniya. The database gates it behind the agency's Pro (promo.tools). */
export async function createGameCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const keys = ['client_id', 'template', 'title', 'subtitle', 'rules', 'primary', 'background', 'text', 'attempts', 'target_score', 'difficulty', 'reward_days',
    'win_mode', 'win_percent', 'cooldown_minutes', 'max_sessions_per_day', 'max_wins_per_user', 'max_rewards_total', 'starts_at', 'ends_at'];
  const parsed = campaignSchema.safeParse(Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ''])));
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('game_campaigns').insert({
    client_id: v.client_id,
    template: v.template,
    title: v.title,
    subtitle: v.subtitle,
    rules: v.rules,
    brand: { primary: v.primary, background: v.background, text: v.text },
    attempts: v.attempts,
    target_score: v.target_score,
    difficulty: v.difficulty,
    reward_days: v.reward_days,
    win_mode: v.win_mode,
    win_probability: v.win_mode === 'skill' ? 1 : v.win_percent / 100,
    cooldown_minutes: v.cooldown_minutes,
    max_sessions_per_day: v.max_sessions_per_day,
    max_wins_per_user: v.max_wins_per_user,
    max_rewards_total: v.max_rewards_total,
    starts_at: v.starts_at,
    ends_at: v.ends_at,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/clients/games');
  return { status: 'success', message: 'Kampaniya yaratildi.' };
}

export async function setCampaignActive(id: string, active: boolean): Promise<ActionState> {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('game_campaigns').update({ is_active: active }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/clients/games');
  return { status: 'success' };
}

/** "Keyingi o‘yinchi yutadi" (next_player_guaranteed campaigns only). */
export async function guaranteeNextPlayer(id: string): Promise<ActionState> {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc('game_guarantee_next', { p_campaign: id });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/clients/games');
  return { status: 'success', message: 'Keyingi boshlangan o‘yin sovg‘ali bo‘ladi.' };
}
