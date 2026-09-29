'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { CONTENT_TEAM_ROLES } from '@/lib/content';
import { fromLocalInput } from '@/lib/time';
import type { Database, Json } from '@/types/database';
import { fieldErrorsFrom, type ActionState } from './state';

type Enums = Database['public']['Enums'];

const text = (max: number) => z.string().trim().max(max);
const optionalUuid = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());
const localTime = z
  .string()
  .trim()
  .transform((v) => fromLocalInput(v));

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
const CONTENT_TYPES = ['reel', 'video', 'post', 'carousel', 'story', 'design', 'ad_creative', 'other'] as const;
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'telegram', 'linkedin', 'x', 'website', 'other'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const contentSchema = z.object({
  client_id: optionalUuid,
  project_id: optionalUuid,
  title: z.string().trim().min(1, 'Nomini yozing').max(200, '200 belgidan oshmasin'),
  content_type: z.enum(CONTENT_TYPES),
  priority: z.enum(PRIORITIES),
  platforms: z.array(z.enum(PLATFORMS)),
  due_at: localTime,
  client_approval_due_at: localTime,
  publish_at: localTime,
  description: text(4000),
  script: text(20000),
  caption: text(4000),
  is_client_visible: z.boolean(),
});

/** Create (id = null) or update one content item through save_content (team, publications in one transaction). */
export async function saveContentAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = contentSchema.safeParse({
    client_id: formData.get('client_id') ?? '',
    project_id: formData.get('project_id') ?? '',
    title: formData.get('title') ?? '',
    content_type: formData.get('content_type'),
    priority: formData.get('priority') ?? 'normal',
    platforms: formData.getAll('platforms').map(String),
    due_at: formData.get('due_at') ?? '',
    client_approval_due_at: formData.get('client_approval_due_at') ?? '',
    publish_at: formData.get('publish_at') ?? '',
    description: formData.get('description') ?? '',
    script: formData.get('script') ?? '',
    caption: formData.get('caption') ?? '',
    is_client_visible: formData.get('is_client_visible') === 'on',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (!id && !parsed.data.client_id) return { status: 'error', message: 'Mijozni tanlang.', fieldErrors: { client_id: 'Mijozni tanlang' } };

  const team = Object.fromEntries(CONTENT_TEAM_ROLES.map((role) => [role, String(formData.get(`team_${role}`) ?? '') || null]));
  const { client_id: clientId, ...rest } = parsed.data;
  const payload = { ...rest, client_id: id ? undefined : clientId, team };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_content', { p_content_id: id as string, p_payload: payload as unknown as Json });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/work/content');
  redirect(`/work/content/${data}`);
}

export async function setContentStatusAction(contentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const status = String(formData.get('status') ?? '') as Enums['content_status'];
  if (!status) return { status: 'error', message: 'Yangi holatni tanlang.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_content_status', { p_content_id: contentId, p_status: status, p_note: String(formData.get('note') ?? '').trim() || undefined });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/work/content/${contentId}`);
  return { status: 'success', message: 'Holat yangilandi' };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
const TASK_TYPES = ['shooting', 'editing', 'design', 'copywriting', 'publishing', 'review', 'strategy', 'meeting', 'other'] as const;

const taskSchema = z.object({
  client_id: optionalUuid,
  title: z.string().trim().min(1, 'Vazifa nomini yozing').max(200),
  description: text(4000),
  task_type: z.enum(TASK_TYPES),
  priority: z.enum(PRIORITIES),
  due_at: localTime,
  assignees: z.array(z.uuid()).min(1, 'Kamida bitta mas’ul xodimni tanlang'),
});

export async function saveTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = taskSchema.safeParse({
    client_id: formData.get('client_id') ?? '',
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    task_type: formData.get('task_type') ?? 'other',
    priority: formData.get('priority') ?? 'normal',
    due_at: formData.get('due_at') ?? '',
    assignees: formData.getAll('assignees').map(String),
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const payload = { ...parsed.data, project_id: null, content_id: null, starts_at: null, checklist: [], depends_on: [] };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_task', { p_task_id: null as unknown as string, p_payload: payload as unknown as Json });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/work/tasks');
  redirect('/work/tasks?created=1');
}

// ---------------------------------------------------------------------------
// Shootings
// ---------------------------------------------------------------------------
const CREW_ROLES = ['operator', 'editor', 'smm_manager', 'project_manager', 'designer', 'copywriter', 'assistant'] as const;

const shootingSchema = z
  .object({
    client_id: z.uuid('Mijozni tanlang'),
    title: z.string().trim().min(1, 'Syomka nomini yozing').max(200),
    description: text(4000),
    starts_at: localTime.pipe(z.string({ message: 'Boshlanish vaqtini tanlang' })),
    ends_at: localTime.pipe(z.string({ message: 'Tugash vaqtini tanlang' })),
    location_name: text(200),
    location_address: text(300),
    location_url: z
      .string()
      .trim()
      .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Xarita havolasi https:// bilan boshlansin')
      .transform((v) => v || null),
  })
  .refine((v) => new Date(v.ends_at).getTime() > new Date(v.starts_at).getTime(), { path: ['ends_at'], message: 'Tugash vaqti boshlanishidan keyin bo‘lsin' });

export async function saveShootingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = shootingSchema.safeParse({
    client_id: formData.get('client_id') ?? '',
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    starts_at: formData.get('starts_at') ?? '',
    ends_at: formData.get('ends_at') ?? '',
    location_name: formData.get('location_name') ?? '',
    location_address: formData.get('location_address') ?? '',
    location_url: formData.get('location_url') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const crew = CREW_ROLES.flatMap((role) => formData.getAll(`crew_${role}`).map((u) => ({ user_id: String(u), role }))).filter((c) => c.user_id);
  const payload = { ...parsed.data, project_id: null, responsible_manager_id: null, status: 'planned', shot_list: [], crew };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_shooting', { p_shooting_id: null as unknown as string, p_payload: payload as unknown as Json });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/work/shootings');
  redirect('/work/shootings?created=1');
}

// ---------------------------------------------------------------------------
// Attendance (office day): one click per person
// ---------------------------------------------------------------------------
const ATTENDANCE = ['present', 'late', 'absent', 'excused', 'vacation', 'remote'] as const;

export async function markAttendanceAction(input: { userId: string; date: string; status: Enums['attendance_status']; arrivedAt?: string | null; note?: string | null }): Promise<ActionState> {
  await requireStaff();
  const parsed = z
    .object({
      userId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: z.enum(ATTENDANCE),
      arrivedAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Ma’lumot noto‘g‘ri.' };
  const { userId, date, status, arrivedAt, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('attendance')
    .upsert(
      { user_id: userId, work_date: date, status, arrived_at: status === 'present' || status === 'late' ? (arrivedAt ?? null) : null, note: note || null },
      { onConflict: 'user_id,work_date' },
    );
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/team/attendance');
  revalidatePath('/');
  return { status: 'success' };
}

export async function markAllPresentAction(input: { userIds: string[]; date: string }): Promise<ActionState> {
  await requireStaff();
  const ids = z.array(z.uuid()).max(500).safeParse(input.userIds);
  if (!ids.success || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { status: 'error', message: 'Ma’lumot noto‘g‘ri.' };
  if (!ids.data.length) return { status: 'success' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('attendance')
    .upsert(ids.data.map((user_id) => ({ user_id, work_date: input.date, status: 'present' as const })), { onConflict: 'user_id,work_date', ignoreDuplicates: true });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/team/attendance');
  revalidatePath('/');
  return { status: 'success' };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
const contractSchema = z
  .object({
    client_id: z.uuid('Mijozni tanlang'),
    number: z.string().trim().min(1, 'Shartnoma raqamini yozing').max(60),
    title: text(200).transform((v) => v || null),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Boshlanish sanasini tanlang'),
    ends_on: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    amount: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s,]/g, ''))
      .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Summani raqam bilan yozing')
      .transform((v) => (v === '' ? null : Number(v))),
    status: z.enum(['draft', 'active', 'expired', 'terminated']),
    notes: text(2000).transform((v) => v || null),
  })
  .refine((v) => !v.ends_on || v.ends_on >= v.starts_on, { path: ['ends_on'], message: 'Tugash sanasi boshlanishidan keyin bo‘lsin' });

export async function saveContractAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = contractSchema.safeParse({
    client_id: formData.get('client_id') ?? '',
    number: formData.get('number') ?? '',
    title: formData.get('title') ?? '',
    starts_on: formData.get('starts_on') ?? '',
    ends_on: formData.get('ends_on') ?? '',
    amount: formData.get('amount') ?? '',
    status: formData.get('status') ?? 'active',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('contracts').insert(parsed.data);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/clients/contracts');
  return { status: 'success', message: 'Shartnoma qo‘shildi' };
}
