'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { canMoveTo, type TaskStatus } from './tasks';

export type TaskActionResult = { ok: true } | { ok: false; message: string };

const STATUSES = ['todo', 'in_progress', 'in_review', 'revision', 'done', 'cancelled'] as const;

/** Signed-in SUN MEDIA staff, and the task must be assigned to them (row-level security checks it again). */
async function myTask(taskId: string) {
  const context = await getSessionContext();
  if (!context || context.status !== 'active' || context.kind !== 'staff') return null;
  if (!z.uuid().safeParse(taskId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('tasks')
    .select('id, status, mine:task_assignments!inner(user_id)')
    .eq('id', taskId)
    .eq('mine.user_id', context.userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ? { supabase, task: data, context } : null;
}

export async function moveMyTask(taskId: string, next: string): Promise<TaskActionResult> {
  const parsed = z.enum(STATUSES).safeParse(next);
  if (!parsed.success) return { ok: false, message: 'Noma’lum holat.' };
  const found = await myTask(taskId);
  if (!found) return { ok: false, message: 'Vazifa topilmadi yoki sizga biriktirilmagan.' };
  if (!canMoveTo(found.task.status as TaskStatus, parsed.data)) return { ok: false, message: 'Bu holatga o‘tkazib bo‘lmaydi. Sahifani yangilang.' };
  const { data, error } = await found.supabase.from('tasks').update({ status: parsed.data }).eq('id', taskId).eq('status', found.task.status).select('id');
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: 'Vazifa holati o‘zgargan. Sahifani yangilang.' };
  revalidatePath('/xodim');
  revalidatePath(`/xodim/vazifa/${taskId}`);
  return { ok: true };
}

export async function commentOnMyTask(taskId: string, body: string): Promise<TaskActionResult> {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { ok: false, message: 'Izoh matnini yozing.' };
  if (text.length > 4000) return { ok: false, message: 'Izoh 4000 belgidan oshmasin.' };
  const found = await myTask(taskId);
  if (!found) return { ok: false, message: 'Vazifa topilmadi yoki sizga biriktirilmagan.' };
  const { error } = await found.supabase.from('task_comments').insert({ task_id: taskId, author_id: found.context.userId, body: text });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/xodim/vazifa/${taskId}`);
  return { ok: true };
}

/** Called by the page after the browser finished an upload (create_file_upload → storage → complete_file_upload). */
export async function refreshMyTask(taskId: string): Promise<void> {
  if (!z.uuid().safeParse(taskId).success) return;
  revalidatePath(`/xodim/vazifa/${taskId}`);
}
