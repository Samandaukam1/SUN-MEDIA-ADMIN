'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isSystemOwner, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type TeamResult = { ok: true } | { ok: false; message: string };
const uuid = z.uuid();

/** Which skills a person has (row-level security: people with employees.manage). */
export async function setEmployeeSkills(userId: string, skillIds: string[]): Promise<TeamResult> {
  await requireStaff();
  const ids = z.array(uuid).max(30).safeParse(skillIds);
  if (!uuid.safeParse(userId).success || !ids.success) return { ok: false, message: 'Ma’lumot noto‘g‘ri.' };
  const supabase = await createClient();
  const { data: current, error } = await supabase.from('employee_skills').select('skill_id').eq('user_id', userId);
  if (error) return { ok: false, message: toUserMessage(error) };
  const have = new Set(current.map((c) => c.skill_id));
  const want = new Set(ids.data);
  const remove = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) {
    const { error: e } = await supabase.from('employee_skills').delete().eq('user_id', userId).in('skill_id', remove);
    if (e) return { ok: false, message: toUserMessage(e) };
  }
  if (add.length) {
    const { error: e } = await supabase.from('employee_skills').insert(add.map((skill_id) => ({ user_id: userId, skill_id })));
    if (e) return { ok: false, message: toUserMessage(e) };
  }
  revalidatePath(`/team/${userId}`);
  revalidatePath('/team');
  return { ok: true };
}

/** When a person is expected at work (the Rahbar or HR; set_work_hours checks). */
export async function setWorkHours(userId: string, start: string, end: string): Promise<TeamResult> {
  await requireStaff();
  if (!uuid.safeParse(userId).success || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { ok: false, message: 'Vaqtni to‘g‘ri kiriting.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_work_hours', { p_user_id: userId, p_start: start, p_end: end });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/team/${userId}`);
  revalidatePath('/team/attendance');
  return { ok: true };
}

const privateSchema = z.object({
  birth_date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  passport_series: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Seriya 2 ta lotin harfi, masalan AB')]),
  passport_number: z.union([z.literal(''), z.string().trim().regex(/^\d{7}$/, 'Pasport raqami 7 ta raqam')]),
});

/** Birth date and passport: the system owner only (the database refuses everyone else too). */
export async function savePrivateData(userId: string, input: z.input<typeof privateSchema>): Promise<TeamResult> {
  const context = await requireStaff();
  if (!isSystemOwner(context)) return { ok: false, message: 'Bu ma’lumotni faqat Tizim egasi o‘zgartiradi.' };
  const parsed = privateSchema.safeParse(input);
  if (!uuid.safeParse(userId).success || !parsed.success) return { ok: false, message: parsed.success ? 'Ma’lumot noto‘g‘ri.' : parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from('employee_private').upsert(
    {
      user_id: userId,
      birth_date: parsed.data.birth_date || null,
      passport_series: parsed.data.passport_series || null,
      passport_number: parsed.data.passport_number || null,
    },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/team/${userId}`);
  return { ok: true };
}

const skillSchema = z.object({
  name: z.string().trim().min(1, 'Nomini yozing').max(60),
  workflow_role: z.enum(['scriptwriter', 'operator', 'editor', '']),
});

/** The skills catalogue (system owner): add, rename, tag, remove. */
export async function saveSkill(id: string | null, input: z.input<typeof skillSchema>): Promise<TeamResult> {
  const context = await requireStaff();
  if (!isSystemOwner(context)) return { ok: false, message: 'Skilllarni faqat Tizim egasi boshqaradi.' };
  const parsed = skillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const row = { name: parsed.data.name, workflow_role: parsed.data.workflow_role || null };
  // A workflow field belongs to one skill: moving the tag frees it from the previous one.
  if (row.workflow_role) {
    const { error: e } = await supabase.from('skills').update({ workflow_role: null }).eq('workflow_role', row.workflow_role).neq('id', id ?? '00000000-0000-0000-0000-000000000000');
    if (e) return { ok: false, message: toUserMessage(e) };
  }
  const { error } = id && uuid.safeParse(id).success ? await supabase.from('skills').update(row).eq('id', id) : await supabase.from('skills').insert(row);
  if (error) return { ok: false, message: error.code === '23505' ? 'Bunday skill allaqachon bor.' : toUserMessage(error) };
  revalidatePath('/team/skills');
  return { ok: true };
}

export async function deleteSkill(id: string): Promise<TeamResult> {
  const context = await requireStaff();
  if (!isSystemOwner(context) || !uuid.safeParse(id).success) return { ok: false, message: 'Skilllarni faqat Tizim egasi boshqaradi.' };
  const supabase = await createClient();
  const { error } = await supabase.from('skills').delete().eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/team/skills');
  return { ok: true };
}

/** "Davomat xatomi?": every employee is told which record to check; nothing is deleted. */
export async function reportAttendanceError(attendanceId: string, note: string): Promise<TeamResult> {
  await requireStaff();
  if (!uuid.safeParse(attendanceId).success) return { ok: false, message: 'Yozuv topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('report_attendance_error', { p_attendance_id: attendanceId, p_note: String(note ?? '').slice(0, 500) });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/team/attendance');
  return { ok: true };
}

export async function resolveAttendanceAlert(alertId: string, resolution: string, dismiss: boolean): Promise<TeamResult> {
  await requireStaff();
  if (!uuid.safeParse(alertId).success) return { ok: false, message: 'Ogohlantirish topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_attendance_alert', { p_alert_id: alertId, p_resolution: String(resolution ?? '').slice(0, 500), p_dismiss: !!dismiss });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/team/attendance');
  return { ok: true };
}
