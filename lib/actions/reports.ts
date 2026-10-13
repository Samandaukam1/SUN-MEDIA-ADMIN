'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { can, requirePermission, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'telegram', 'linkedin', 'x', 'website', 'other'] as const;

/** Client → Statistika: register a social account whose numbers will be reported. */
export async function addSocialAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireStaff();
  if (!can(context, 'clients.manage') && !can(context, 'analytics.manage')) return { status: 'error', message: 'Bu amal uchun ruxsatingiz yo‘q.' };
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

const money = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\u00a0]/g, '').replace(',', '.'))
  .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Summa (masalan 1500000 yoki 120.50)')
  .transform((v) => (v === '' ? null : Number(v)));

const FIELDS = [
  'followers_start',
  'followers_end',
  'reach',
  'views',
  'profile_visits',
  'likes',
  'comments',
  'shares',
  'saves',
  'reels_count',
  'posts_count',
  'stories_count',
  'leads',
] as const;

/**
 * Client → Statistika: the month's real numbers for one account (empty = not provided, never 0).
 * "Qoralama" keeps them from the partner; "Nashr qilish" shows them in the partner cabinet and in reports.
 */
export async function saveSocialMonth(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const month = String(formData.get('month') ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { status: 'error', message: 'Oy noto‘g‘ri.' };
  const shape = Object.fromEntries(FIELDS.map((f) => [f, count])) as Record<(typeof FIELDS)[number], typeof count>;
  const parsed = z
    .object({
      client_id: z.uuid(),
      social_account_id: z.uuid(),
      ...shape,
      ad_spend: money,
      ad_currency: z.enum(['UZS', 'USD']),
      status: z.enum(['draft', 'published']),
    })
    .safeParse({
      client_id: formData.get('client_id'),
      social_account_id: formData.get('social_account_id'),
      ...Object.fromEntries(FIELDS.map((f) => [f, formData.get(f) ?? ''])),
      ad_spend: formData.get('ad_spend') ?? '',
      ad_currency: formData.get('ad_currency') ?? 'UZS',
      status: formData.get('intent') === 'publish' ? 'published' : 'draft',
    });
  if (!parsed.success) return { status: 'error', message: 'Raqamlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  if (v.followers_start !== null && v.followers_end === null) {
    return { status: 'error', message: 'Oy oxiridagi obunachilar sonini ham kiriting.', fieldErrors: { followers_end: 'Oy oxiri ham kerak' } };
  }
  const start = new Date(`${month}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from('social_metrics')
    .upsert({ ...v, period_start: month, period_end: end, source: 'manual' }, { onConflict: 'social_account_id,period_start,period_end' });
  if (error) {
    if (error.code === '23P01') return { status: 'error', message: 'Bu davr shu akkaunt uchun kiritilgan boshqa davr bilan ustma-ust tushadi.' };
    return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath(`/clients/${v.client_id}`);
  return {
    status: 'success',
    message: v.status === 'published' ? 'Saqlandi va nashr qilindi — hamkor kabinetida ko‘rinadi.' : 'Qoralama saqlandi — hamkorga ko‘rinmaydi.',
  };
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

/** The report's texts for the partner: achievements, work done and work planned (one item per line). */
export async function saveReportHighlights(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('reports.manage');
  const text = z.string().trim().max(5000, 'Matn 5000 belgidan oshmasin');
  const parsed = z
    .object({ report_id: z.uuid(), client_id: z.uuid(), highlights: text, work_done: text, work_planned: text })
    .safeParse({
      report_id: formData.get('report_id'),
      client_id: formData.get('client_id'),
      highlights: formData.get('highlights') ?? '',
      work_done: formData.get('work_done') ?? '',
      work_planned: formData.get('work_planned') ?? '',
    });
  if (!parsed.success) return { status: 'error', message: 'Matn juda uzun.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('monthly_reports')
    .update({ highlights: v.highlights || null, work_done: v.work_done || null, work_planned: v.work_planned || null })
    .eq('id', v.report_id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Saqlandi.' };
}

/** After the browser uploaded a file to reports/<client>/<report>/files/: the database checks it landed there. */
export async function addReportFile(reportId: string, clientId: string, storagePath: string, name: string): Promise<ActionState> {
  await requirePermission('reports.manage');
  if (!z.uuid().safeParse(reportId).success || !z.uuid().safeParse(clientId).success) return { status: 'error', message: 'Hisobot topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_report_file', { p_report_id: reportId, p_storage_path: storagePath, p_name: String(name ?? '').slice(0, 200) });
  if (error) {
    await supabase.storage.from('reports').remove([storagePath]).catch(() => undefined);
    return { status: 'error', message: error.message === 'A report holds up to 20 files' ? 'Hisobotga 20 tagacha fayl biriktiriladi.' : toUserMessage(error) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success', message: 'Fayl biriktirildi.' };
}

export async function removeReportFile(fileId: string, clientId: string): Promise<ActionState> {
  await requirePermission('reports.manage');
  if (!z.uuid().safeParse(fileId).success) return { status: 'error', message: 'Fayl topilmadi.' };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc('remove_report_file', { p_file_id: fileId });
  if (error || !path) return { status: 'error', message: toUserMessage(error) };
  await supabase.storage.from('reports').remove([path]);
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success', message: 'Fayl olib tashlandi.' };
}
