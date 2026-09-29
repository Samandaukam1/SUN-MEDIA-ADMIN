'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireSystemOwner } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const promoSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, 'Kod: 3–32 ta harf, raqam, - yoki _'),
    title: z.string().trim().min(1, 'Nomini yozing').max(120),
    description: z.string().trim().max(500).transform((v) => v || null),
    reward_days: z.coerce.number().int().min(1, 'Kamida 1 kun').max(3650),
    starts_at: z.string().transform((v) => (v ? new Date(v).toISOString() : new Date().toISOString())),
    expires_at: z.string().transform((v) => (v ? new Date(v).toISOString() : null)),
    max_redemptions: z.string().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().positive().nullable()),
    per_user_limit: z.coerce.number().int().min(1).max(100),
    per_workspace_limit: z.coerce.number().int().min(1).max(100),
    audience: z.enum(['everyone', 'new_users', 'clients', 'agency']),
    eligible_client_ids: z.array(z.uuid()),
    is_active: z.boolean(),
  })
  .refine((v) => !v.expires_at || v.expires_at > v.starts_at, { message: 'Tugash sanasi boshlanishdan keyin bo‘lsin', path: ['expires_at'] });

/** Promo kodlar → Yangi kod. RLS: promo.manage; the code is stored upper-case, the counter by the database. */
export async function createPromoCode(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const days = formData.get('reward_days') === 'custom' ? formData.get('custom_days') : formData.get('reward_days');
  const parsed = promoSchema.safeParse({
    code: formData.get('code'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    reward_days: days,
    starts_at: formData.get('starts_at') ?? '',
    expires_at: formData.get('expires_at') ?? '',
    max_redemptions: formData.get('max_redemptions') ?? '',
    per_user_limit: formData.get('per_user_limit') ?? 1,
    per_workspace_limit: formData.get('per_workspace_limit') ?? 1,
    audience: formData.get('audience') ?? 'everyone',
    eligible_client_ids: formData.getAll('eligible_client_ids').map(String),
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('promo_codes').insert({ ...parsed.data, plan_key: 'pro' });
  if (error) return { status: 'error', message: error.code === '23505' ? 'Bunday kod allaqachon bor.' : toUserMessage(error) };
  revalidatePath('/clients/promo');
  return { status: 'success', message: `${parsed.data.code} yaratildi.` };
}

export async function setPromoActive(id: string, active: boolean): Promise<ActionState> {
  await requirePermission('promo.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('promo_codes').update({ is_active: active }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/clients/promo');
  return { status: 'success' };
}

/** Tizim boshqaruvi → Obunalar: give Pro for N days (or without end) to a workspace. */
export async function grantPlan(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSystemOwner();
  const parsed = z
    .object({
      workspace_id: z.uuid('Workspace’ni tanlang'),
      plan_key: z.string().min(1),
      days: z.string().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(3650).nullable()),
      note: z.string().trim().max(500),
    })
    .safeParse({ workspace_id: formData.get('workspace_id'), plan_key: formData.get('plan_key') ?? 'pro', days: formData.get('days') ?? '', note: formData.get('note') ?? '' });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_workspace_plan', {
    p_workspace: parsed.data.workspace_id,
    p_plan: parsed.data.plan_key,
    p_days: parsed.data.days as number,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/system/subscriptions');
  return { status: 'success', message: 'Obuna berildi.' };
}

export async function endSubscription(id: string): Promise<ActionState> {
  await requireSystemOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc('end_workspace_subscription', { p_subscription: id });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/system/subscriptions');
  return { status: 'success' };
}

/** Plan catalogue: one feature of one plan (on/off, limit; empty limit = unlimited). */
export async function savePlanFeature(planKey: string, featureKey: string, enabled: boolean, limit: number | null): Promise<ActionState> {
  await requireSystemOwner();
  const supabase = await createClient();
  const { error } = await supabase
    .from('saas_plan_features')
    .upsert({ plan_key: planKey, feature_key: featureKey, enabled, limit_value: limit }, { onConflict: 'plan_key,feature_key' });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/system/subscriptions');
  return { status: 'success' };
}

export async function savePlanPrice(planKey: string, priceCents: number): Promise<ActionState> {
  await requireSystemOwner();
  if (!Number.isInteger(priceCents) || priceCents < 0) return { status: 'error', message: 'Narx noto‘g‘ri.' };
  const supabase = await createClient();
  const { error } = await supabase.from('saas_plans').update({ price_cents: priceCents }).eq('key', planKey);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/system/subscriptions');
  return { status: 'success' };
}
