'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSystemOwner } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const price = z.union([z.literal(''), z.coerce.number().min(0).max(1000)]);
const schema = z.object({
  daily_limit_member: z.coerce.number().int().min(0, 'Manfiy bo‘lmaydi').max(10000),
  daily_limit_public: z.coerce.number().int().min(0, 'Manfiy bo‘lmaydi').max(10000),
  monthly_budget_usd: z.coerce.number().min(0, 'Manfiy bo‘lmaydi').max(100000),
});

/**
 * Sozlamalar → Sunny AI (system owner only): the daily question limits, the monthly money cap and the price of each
 * model per million tokens. Prices are whatever the owner enters from the provider's own price list — Sunny never
 * assumes one; a model without a price is counted in tokens only.
 */
export async function saveAssistantSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSystemOwner();
  const parsed = schema.safeParse({
    daily_limit_member: formData.get('daily_limit_member'),
    daily_limit_public: formData.get('daily_limit_public'),
    monthly_budget_usd: formData.get('monthly_budget_usd'),
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const pricing: Record<string, { input: number; output: number; cached?: number }> = {};
  for (const model of formData.getAll('model').map(String)) {
    if (!/^[\w.:/-]{2,120}$/.test(model)) continue;
    const [input, output, cached] = ['input', 'output', 'cached'].map((k) => price.safeParse(formData.get(`${k}:${model}`) ?? ''));
    if (!input.success || !output.success || !cached.success) return { status: 'error', message: `${model}: narx 0–1000 USD oralig‘ida bo‘lsin.` };
    if (input.data === '' || output.data === '') continue;
    pricing[model] = { input: input.data, output: output.data, ...(cached.data === '' ? {} : { cached: cached.data }) };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const rows = [
    { key: 'assistant.daily_limit_member', value: v.daily_limit_member },
    { key: 'assistant.daily_limit_public', value: v.daily_limit_public },
    { key: 'assistant.monthly_budget_usd', value: v.monthly_budget_usd },
    { key: 'assistant.pricing', value: pricing },
  ];
  for (const row of rows) {
    const { data, error } = await supabase.from('app_settings').update({ value: row.value }).eq('key', row.key).select('key');
    if (error) return { status: 'error', message: toUserMessage(error) };
    if (!data?.length) return { status: 'error', message: 'Sunny sozlamalari bazada topilmadi (migratsiya qo‘llanmagan).' };
  }
  revalidatePath('/settings');
  return { status: 'success', message: 'Sunny AI sozlamalari saqlandi.' };
}
