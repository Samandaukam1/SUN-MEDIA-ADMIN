'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana noto‘g‘ri');

function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[‘’ʻʼ']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'tarif'
  );
}

const planSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Tarif nomini kiriting').max(80),
  description: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null),
  price: z.coerce.number({ message: 'Narxni kiriting' }).min(0, 'Narx manfiy bo‘lmaydi').max(1e12),
  duration_months: z.coerce.number().int().min(1, 'Kamida 1 oy').max(36, 'Ko‘pi bilan 36 oy'),
  client_id: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  is_active: z.boolean(),
  position: z.coerce.number().int().min(0).max(10000),
});

/** Plans → create / edit a tariff with its service quantities (RLS: plans.manage). */
export async function savePlan(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('plans.manage');
  const parsed = planSchema.safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    price: formData.get('price'),
    duration_months: formData.get('duration_months'),
    client_id: formData.get('client_id') ?? '',
    is_active: formData.get('is_active') === 'on',
    position: formData.get('position') || 0,
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { id, ...plan } = parsed.data;

  const features: { service_key: string; quantity: number | null }[] = [];
  for (const key of formData.getAll('service_keys').map(String)) {
    if (formData.get(`inc_${key}`) !== 'on') continue;
    const raw = String(formData.get(`qty_${key}`) ?? '').trim();
    const quantity = raw === '' ? null : Number(raw);
    if (quantity != null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000)) {
      return { status: 'error', message: 'Miqdorlar 0 dan katta butun son bo‘lsin.', fieldErrors: { [`qty_${key}`]: 'Butun son' } };
    }
    features.push({ service_key: key, quantity });
  }

  const supabase = await createClient();
  const row = { ...plan, is_public: plan.client_id === null };
  let planId = id;
  if (id) {
    const { error } = await supabase.from('plans').update(row).eq('id', id);
    if (error) return { status: 'error', message: toUserMessage(error) };
  } else {
    const { data, error } = await supabase
      .from('plans')
      .insert({ ...row, slug: `${slugify(plan.name)}-${Date.now().toString(36)}` })
      .select('id')
      .single();
    if (error) return { status: 'error', message: toUserMessage(error) };
    planId = data.id;
  }

  const keep = features.map((f) => f.service_key);
  const { error: delError } = keep.length
    ? await supabase.from('plan_features').delete().eq('plan_id', planId!).not('service_key', 'in', `(${keep.join(',')})`)
    : await supabase.from('plan_features').delete().eq('plan_id', planId!);
  if (delError) return { status: 'error', message: toUserMessage(delError) };
  if (features.length) {
    const { error } = await supabase
      .from('plan_features')
      .upsert(features.map((f) => ({ plan_id: planId!, service_key: f.service_key, quantity: f.quantity, is_included: true })), { onConflict: 'plan_id,service_key' });
    if (error) return { status: 'error', message: toUserMessage(error) };
  }

  revalidatePath('/plans');
  if (!id) redirect(`/plans/${planId}?saved=1`);
  revalidatePath(`/plans/${planId}`);
  return { status: 'success', message: 'Tarif saqlandi. Mavjud obunalar o‘zgarmaydi — yangi obunalar shu tarkib bilan ochiladi.' };
}

/** Client → Tarif: put the client on a plan from a date (RLS/RPC: subscriptions.manage). */
export async function assignPlan(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('subscriptions.manage');
  const parsed = z
    .object({
      client_id: z.uuid(),
      plan_id: z.uuid({ message: 'Tarifni tanlang' }),
      starts_on: dateKey,
      price: z
        .string()
        .trim()
        .transform((v) => (v === '' ? null : Number(v)))
        .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Narx noto‘g‘ri'),
      notes: z.string().trim().max(500),
    })
    .safeParse({
      client_id: formData.get('client_id'),
      plan_id: formData.get('plan_id'),
      starts_on: formData.get('starts_on'),
      price: formData.get('price') ?? '',
      notes: formData.get('notes') ?? '',
    });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_plan', {
    p_client_id: v.client_id,
    p_plan_id: v.plan_id,
    p_starts_on: v.starts_on,
    p_price: v.price ?? undefined,
    p_notes: v.notes || undefined,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${v.client_id}`);
  return { status: 'success', message: 'Tarif biriktirildi. Oldingi davr shu sanadan bir kun oldin yopildi.' };
}

/** Approve (switch plan) or reject a client's upgrade request. */
export async function handleUpgradeRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('subscriptions.manage');
  const parsed = z
    .object({
      request_id: z.uuid(),
      client_id: z.uuid(),
      decision: z.enum(['approve', 'reject']),
      response: z.string().trim().max(2000),
      starts_on: dateKey.optional(),
    })
    .safeParse({
      request_id: formData.get('request_id'),
      client_id: formData.get('client_id'),
      decision: formData.get('decision'),
      response: formData.get('response') ?? '',
      starts_on: formData.get('starts_on') || undefined,
    });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  if (v.decision === 'reject' && !v.response) return { status: 'error', message: 'Rad etish sababini yozing.', fieldErrors: { response: 'Sababni yozing' } };
  const supabase = await createClient();
  const { error } = await supabase.rpc('handle_upgrade_request', {
    p_request_id: v.request_id,
    p_approve: v.decision === 'approve',
    p_response: v.response || undefined,
    p_starts_on: v.starts_on,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${v.client_id}`);
  revalidatePath('/plans');
  return { status: 'success', message: v.decision === 'approve' ? 'So‘rov tasdiqlandi, yangi tarif ishga tushdi.' : 'So‘rov rad etildi, mijozga xabar yuborildi.' };
}

/** Manual correction of the usage ledger (+ extra work, − returned). */
export async function recordUsage(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('subscriptions.manage');
  const parsed = z
    .object({
      client_id: z.uuid(),
      service_key: z.string().min(1, 'Xizmatni tanlang'),
      quantity: z.coerce
        .number()
        .int('Butun son kiriting')
        .refine((n) => n !== 0, 'Nol bo‘lmasin')
        .refine((n) => Math.abs(n) <= 1000, 'Juda katta'),
      occurred_on: dateKey,
      note: z.string().trim().min(1, 'Izoh yozing (nima uchun)').max(300),
    })
    .safeParse({
      client_id: formData.get('client_id'),
      service_key: formData.get('service_key'),
      quantity: formData.get('quantity'),
      occurred_on: formData.get('occurred_on'),
      note: formData.get('note') ?? '',
    });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('client_plan_usage').insert({ ...parsed.data, source: 'manual' });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Foydalanish yozildi.' };
}
