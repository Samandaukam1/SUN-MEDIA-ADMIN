'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

// Wall-clock values from <input type="date|time"> are agency time (UTC+5, no DST).
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString();

const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Sarlavhani yozing').max(160),
  body: z.string().trim().min(1, 'Matnni yozing').max(4000),
  is_pinned: z.boolean(),
  audience_roles: z.array(z.string()),
});

export async function createAnnouncement(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('workspace.manage');
  const parsed = announcementSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
    is_pinned: formData.get('is_pinned') === 'on',
    audience_roles: formData.getAll('audience_roles').map(String),
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase
    .from('announcements')
    .insert({ ...parsed.data, audience_roles: parsed.data.audience_roles.length ? parsed.data.audience_roles : null });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/workspace');
  return { status: 'success', message: 'E’lon barcha tanlangan xodimlarga yuborildi.' };
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Nomini yozing').max(160),
    kind: z.enum(['meeting', 'holiday', 'day_off', 'company_event', 'training', 'birthday']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani tanlang'),
    start: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')),
    end: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')),
    all_day: z.boolean(),
    location: z.string().trim().max(200),
    description: z.string().trim().max(2000),
  })
  .refine((v) => v.all_day || (v.start && v.end && v.end >= v.start), { message: 'Boshlanish va tugash vaqtini to‘g‘ri kiriting', path: ['end'] });

export async function createCompanyEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('workspace.manage');
  const parsed = eventSchema.safeParse({
    title: formData.get('title'),
    kind: formData.get('kind'),
    date: formData.get('date'),
    start: formData.get('start') ?? '',
    end: formData.get('end') ?? '',
    all_day: formData.get('all_day') === 'on',
    location: formData.get('location') ?? '',
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const startsAt = v.all_day ? toIso(v.date, '00:00') : toIso(v.date, v.start);
  const endsAt = v.all_day ? new Date(new Date(toIso(v.date, '00:00')).getTime() + 86_400_000).toISOString() : toIso(v.date, v.end);
  const supabase = await createClient();
  const { error } = await supabase.from('company_events').insert({
    title: v.title,
    kind: v.kind,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: v.all_day,
    location: v.location || null,
    description: v.description || null,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/workspace');
  return { status: 'success', message: 'Tadbir kompaniya kalendariga qo‘shildi.' };
}

const documentSchema = z.object({
  title: z.string().trim().min(1, 'Nomini yozing').max(160),
  category: z.enum(['sop', 'guide', 'brand', 'policy', 'template', 'other']),
  url: z.string().trim().regex(/^https:\/\/\S+$/i, 'Havola https:// bilan boshlansin'),
  description: z.string().trim().max(1000),
  is_pinned: z.boolean(),
});

export async function createSharedDocument(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('workspace.manage');
  const parsed = documentSchema.safeParse({
    title: formData.get('title'),
    category: formData.get('category'),
    url: formData.get('url'),
    description: formData.get('description') ?? '',
    is_pinned: formData.get('is_pinned') === 'on',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('shared_documents').insert({ ...parsed.data, description: parsed.data.description || null });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/workspace');
  return { status: 'success', message: 'Hujjat qo‘shildi.' };
}

/** Soft-delete for any of the three workspace tables. */
export async function archiveWorkspaceItem(table: 'announcements' | 'company_events' | 'shared_documents', id: string): Promise<ActionState> {
  await requirePermission('workspace.manage');
  if (!['announcements', 'company_events', 'shared_documents'].includes(table)) return { status: 'error', message: 'Noto‘g‘ri bo‘lim.' };
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { status: 'error', message: 'Noto‘g‘ri yozuv.' };
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', parsedId.data);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/workspace');
  return { status: 'success' };
}
