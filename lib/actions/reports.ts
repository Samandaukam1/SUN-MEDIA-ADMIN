'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'telegram', 'linkedin', 'x', 'website', 'other'] as const;

/** Client → Statistika: register a social account whose numbers will be reported. */
export async function addSocialAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('clients.manage');
  const parsed = z
    .object({
      client_id: z.uuid(),
      platform: z.enum(PLATFORMS, { message: 'Platformani tanlang' }),
      handle: z.string().trim().min(1, 'Akkaunt nomini yozing').max(120).transform((v) => v.replace(/^@/, '')),
      url: z
        .string()
        .trim()
        .max(300)
        .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Havola https:// bilan boshlansin')
        .transform((v) => v || null),
    })
    .safeParse({ client_id: formData.get('client_id'), platform: formData.get('platform'), handle: formData.get('handle') ?? '', url: formData.get('url') ?? '' });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('social_accounts').insert(parsed.data);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Akkaunt qo‘shildi.' };
}

const count = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ''))
  .refine((v) => v === '' || /^\d+$/.test(v), 'Butun son')
  .transform((v) => (v === '' ? null : Number(v)));

const FIELDS = ['followers_start', 'followers_end', 'reach', 'views', 'profile_visits', 'likes', 'comments', 'shares', 'saves'] as const;

/** Client → Statistika: the month's real numbers for one account (empty = not provided, never 0). */
export async function saveSocialMonth(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const month = String(formData.get('month') ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { status: 'error', message: 'Oy noto‘g‘ri.' };
  const shape = Object.fromEntries(FIELDS.map((f) => [f, count])) as Record<(typeof FIELDS)[number], typeof count>;
  const parsed = z
    .object({ client_id: z.uuid(), social_account_id: z.uuid(), ...shape })
    .safeParse({
      client_id: formData.get('client_id'),
      social_account_id: formData.get('social_account_id'),
      ...Object.fromEntries(FIELDS.map((f) => [f, formData.get(f) ?? ''])),
    });
  if (!parsed.success) return { status: 'error', message: 'Faqat butun sonlar kiriting.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const start = new Date(`${month}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from('social_metrics')
    .upsert({ ...parsed.data, period_start: month, period_end: end, source: 'manual' }, { onConflict: 'social_account_id,period_start,period_end' });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Saqlandi. Hisobotni qayta hisoblang.' };
}

/** Client → Hisobotlar: build (or rebuild) a month's report as a draft. */
export async function generateReport(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('reports.manage');
  const clientId = String(formData.get('client_id') ?? '');
  const month = String(formData.get('month') ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { status: 'error', message: 'Oyni tanlang.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('generate_monthly_report', { p_client_id: clientId, p_month: month });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success', message: 'Hisobot tayyorlandi (qoralama). Tekshirib, nashr qiling.' };
}

export async function setReportPublished(reportId: string, clientId: string, publish: boolean): Promise<ActionState> {
  await requirePermission('reports.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc(publish ? 'publish_monthly_report' : 'archive_monthly_report', { p_report_id: reportId });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success' };
}

export async function saveReportHighlights(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('reports.manage');
  const parsed = z
    .object({ report_id: z.uuid(), client_id: z.uuid(), highlights: z.string().trim().max(5000) })
    .safeParse({ report_id: formData.get('report_id'), client_id: formData.get('client_id'), highlights: formData.get('highlights') ?? '' });
  if (!parsed.success) return { status: 'error', message: 'Matn juda uzun.' };
  const supabase = await createClient();
  const { error } = await supabase.from('monthly_reports').update({ highlights: parsed.data.highlights || null }).eq('id', parsed.data.report_id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Saqlandi.' };
}
