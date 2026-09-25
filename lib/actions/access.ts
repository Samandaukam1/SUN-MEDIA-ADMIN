'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

/** Employee → Access: one staff role (atomic swap in the database) + extra permissions. */
export async function updateStaffAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = z
    .object({ user_id: z.uuid(), role_key: z.string().min(1, 'Rolni tanlang'), current_role: z.string(), permissions: z.array(z.string()) })
    .safeParse({
      user_id: formData.get('user_id'),
      role_key: formData.get('role_key'),
      current_role: formData.get('current_role') ?? '',
      permissions: formData.getAll('permissions').map(String),
    });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { user_id, role_key, current_role, permissions } = parsed.data;
  const supabase = await createClient();

  if (role_key !== current_role) {
    const { error } = await supabase.rpc('change_staff_role', { p_user_id: user_id, p_role_key: role_key });
    if (error) return { status: 'error', message: toUserMessage(error) };
  }
  const { error } = await supabase.rpc('set_staff_permissions', { p_user_id: user_id, p_permissions: permissions });
  if (error) return { status: 'error', message: toUserMessage(error) };

  revalidatePath(`/team/${user_id}`);
  revalidatePath('/team');
  return { status: 'success', message: 'Rol va ruxsatlar saqlandi.' };
}

/** Roles matrix: grant or withdraw one permission for one role (RLS: roles.manage + DB guard). */
export async function toggleRolePermission(roleId: string, permissionKey: string, granted: boolean): Promise<ActionState> {
  await requirePermission('roles.manage');
  const supabase = await createClient();
  const { error } = granted
    ? await supabase.from('role_permissions').insert({ role_id: roleId, permission_key: permissionKey })
    : await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_key', permissionKey);
  if (error && error.code !== '23505') return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/roles');
  return { status: 'success' };
}

const settingsSchema = z.object({
  work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Kamida bitta ish kuni tanlang'),
  workday_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt HH:MM ko‘rinishida'),
  late_grace_minutes: z.coerce.number().int().min(0).max(120),
  login_domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Domen noto‘g‘ri (masalan: sunmedia.uz)'),
});

/** Settings → work schedule and account defaults (RLS: settings.manage, validated by triggers). */
export async function updateAgencySettings(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('settings.manage');
  const parsed = settingsSchema.safeParse({
    work_days: formData.getAll('work_days'),
    workday_start: formData.get('workday_start'),
    late_grace_minutes: formData.get('late_grace_minutes'),
    login_domain: formData.get('login_domain'),
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  const rows = [
    { key: 'attendance.work_days', value: [...new Set(v.work_days)].sort() },
    { key: 'attendance.workday_start', value: v.workday_start },
    { key: 'attendance.late_grace_minutes', value: v.late_grace_minutes },
    { key: 'accounts.login_domain', value: v.login_domain },
  ];
  for (const row of rows) {
    const { error } = await supabase.from('app_settings').update({ value: row.value }).eq('key', row.key);
    if (error) return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath('/settings');
  return { status: 'success', message: 'Sozlamalar saqlandi. Yangi xodimlar shu jadval bilan yaratiladi.' };
}

const RECIPIENTS = ['assignees', 'managers', 'admins', 'owners', 'client_approvers'] as const;

const alertRuleSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Nomini yozing').max(120),
  target: z.enum(['task', 'content_approval']),
  offset_minutes: z.coerce.number().int().min(-10080).max(1440),
  recipients: z.array(z.enum(RECIPIENTS)).min(1, 'Kamida bitta qabul qiluvchini tanlang'),
  is_active: z.boolean(),
});

/** Settings → deadline alerts (RLS: notifications.manage). Offsets are minutes relative to the deadline. */
export async function saveAlertRule(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('notifications.manage');
  const hours = Number(formData.get('hours') ?? 0);
  const minutes = Number(formData.get('minutes') ?? 0);
  const when = formData.get('when');
  const magnitude = Math.round(Math.abs(hours) * 60 + Math.abs(minutes));
  const parsed = alertRuleSchema.safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    target: formData.get('target') ?? 'task',
    offset_minutes: when === 'after' ? magnitude : when === 'at' ? 0 : -magnitude,
    recipients: formData.getAll('recipients').map(String),
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { id, ...row } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('deadline_alert_rules').update(row).eq('id', id)
    : await supabase.from('deadline_alert_rules').insert({ ...row, title_template: `${row.name}: {task}{content}`, body_template: '{client} · muddat {due_time}' });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/settings');
  return { status: 'success', message: 'Eslatma qoidasi saqlandi.' };
}

export async function toggleAlertRule(id: string, active: boolean): Promise<ActionState> {
  await requirePermission('notifications.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('deadline_alert_rules').update({ is_active: active }).eq('id', id);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/settings');
  return { status: 'success' };
}
