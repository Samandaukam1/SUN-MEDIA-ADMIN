'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { tashkentInstant } from '@/lib/workflow-shared';

export type WorkflowResult = { ok: true; id?: string } | { ok: false; message: string };

/** Signed-in, active SUN MEDIA staff; every rule beyond that is checked by the database functions. */
async function staffClient() {
  const context = await getSessionContext();
  if (!context || context.status !== 'active' || context.kind !== 'staff') return null;
  return createClient();
}

const fail = (error: unknown): WorkflowResult => ({ ok: false, message: toUserMessage(error) });
const NO_ACCESS: WorkflowResult = { ok: false, message: 'Bu amal uchun ruxsatingiz yo‘q.' };
const uuid = z.uuid();

function refresh(contentId?: string) {
  if (contentId) revalidatePath(`/work/content/${contentId}`);
  revalidatePath('/work/tasks');
  revalidatePath('/work/jihozlar');
  revalidatePath('/xodim', 'layout');
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'Vazifa nomini yozing').max(200),
  clientId: uuid,
  contentType: z.enum(['reel', 'video', 'post', 'carousel', 'story', 'design', 'ad_creative', 'other']),
  topic: z.string().trim().min(1, 'Kontent mavzusini yozing').max(300),
  description: z.string().trim().max(4000),
  shootDate: z.string().trim(),
  shootTime: z.string().trim(),
  location: z.string().trim().max(200),
  postDate: z.string().trim(),
  postTime: z.string().trim(),
  responsibleIds: z.array(uuid).max(20),
  scriptwriterId: z.union([uuid, z.literal('')]),
  operatorIds: z.array(uuid).max(20),
  shootMemberIds: z.array(uuid).max(30),
  equipmentIds: z.array(uuid).max(60),
  newEquipment: z.array(z.string().trim().min(1).max(80)).max(20),
  note: z.string().trim().max(4000),
});
export type CreateContentTaskInput = z.input<typeof createSchema>;

/** "+ Vazifa yaratish": the content and all its stages in one step (create_content_task). */
export async function createContentTask(input: CreateContentTaskInput): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase) return NO_ACCESS;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Maydonlarni tekshiring.' };
  const v = parsed.data;
  const shootAt = v.shootDate ? tashkentInstant(v.shootDate, v.shootTime) : null;
  const postAt = v.postDate ? tashkentInstant(v.postDate, v.postTime || '19:00') : null;
  const { data, error } = await supabase.rpc('create_content_task', {
    p: {
      title: v.title,
      client_id: v.clientId,
      content_type: v.contentType,
      topic: v.topic,
      description: v.description,
      note: v.note,
      location: v.location,
      shoot_at: shootAt ?? '',
      post_at: postAt ?? '',
      responsible_ids: v.responsibleIds,
      scriptwriter_id: v.scriptwriterId,
      operator_ids: v.operatorIds,
      shoot_member_ids: v.shootMemberIds,
      equipment_ids: v.equipmentIds,
      new_equipment: v.newEquipment,
    },
  });
  if (error || !data) return fail(error);
  refresh(data);
  revalidatePath('/work/content');
  revalidatePath('/work/shootings');
  revalidatePath('/panel');
  return { ok: true, id: data };
}

export async function saveScript(contentId: string, script: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  if (typeof script !== 'string' || script.length > 20000) return { ok: false, message: 'Ssenariy 20 000 belgidan oshmasin.' };
  const { error } = await supabase.rpc('save_script', { p_content_id: contentId, p_script: script });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function submitScript(contentId: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('submit_script', { p_content_id: contentId });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function reviewScript(contentId: string, approve: boolean, note: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('review_script', { p_content_id: contentId, p_approve: !!approve, p_note: String(note ?? '').slice(0, 4000) });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function assignEditing(contentId: string, editorId: string, dueDate: string, dueTime: string, note: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  if (!uuid.safeParse(editorId).success) return { ok: false, message: 'Montajyorni tanlang.' };
  const due = tashkentInstant(dueDate, dueTime || '18:00');
  if (!due) return { ok: false, message: 'Topshirish muddatini belgilang.' };
  const { error } = await supabase.rpc('assign_editing', { p_content_id: contentId, p_editor_id: editorId, p_due_at: due, p_note: String(note ?? '').slice(0, 4000) });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function reviewEditing(contentId: string, approve: boolean, note: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('review_editing', { p_content_id: contentId, p_approve: !!approve, p_note: String(note ?? '').slice(0, 4000) });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function setEquipmentPrepared(contentId: string, equipmentId: string, prepared: boolean): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success || !uuid.safeParse(equipmentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('set_equipment_prepared', { p_content_id: contentId, p_equipment_id: equipmentId, p_prepared: !!prepared });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function confirmEquipment(contentId: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('confirm_equipment', { p_content_id: contentId });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}

export async function addContentEquipment(contentId: string, name: string): Promise<WorkflowResult> {
  const supabase = await staffClient();
  if (!supabase || !uuid.safeParse(contentId).success) return NO_ACCESS;
  const { error } = await supabase.rpc('add_content_equipment', { p_content_id: contentId, p_name: String(name ?? '').trim().slice(0, 80) });
  if (error) return fail(error);
  refresh(contentId);
  return { ok: true };
}
