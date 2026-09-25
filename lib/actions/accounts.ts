'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createLogin, deleteLogin, setLoginBlocked, setTemporaryPassword } from '@/lib/accounts';
import { requirePermission, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState, type CredentialsState } from './state';

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}ni kiriting`)
    .max(60, `${label} 60 belgidan oshmasin`);

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ''))
  .refine((v) => v === '' || /^\+?\d{7,15}$/.test(v), 'Telefon raqami noto‘g‘ri')
  .transform((v) => v || null);

const email = z.string().trim().toLowerCase().email('Email/login noto‘g‘ri');

const employeeSchema = z.object({
  first_name: name('Ism'),
  last_name: name('Familiya'),
  email,
  phone,
  job_title: z.string().trim().max(80).transform((v) => v || null),
  role_key: z.string().min(1, 'Rolni tanlang'),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
  permissions: z.array(z.string()),
  client_ids: z.array(z.uuid()),
});

/** Team → Add employee: creates the login, then provisions it with the admin's own session. */
export async function createEmployeeAccount(_: CredentialsState, formData: FormData): Promise<CredentialsState> {
  await requirePermission('employees.manage');
  const parsed = employeeSchema.safeParse({
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    job_title: formData.get('job_title') ?? '',
    role_key: formData.get('role_key'),
    employment_type: formData.get('employment_type') ?? 'full_time',
    permissions: formData.getAll('permissions').map(String),
    client_ids: formData.getAll('client_ids').map(String),
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const input = parsed.data;
  const fullName = `${input.first_name} ${input.last_name}`;

  let login;
  try {
    login = await createLogin(input.email, fullName);
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), fieldErrors: { email: toUserMessage(error) } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('provision_staff_member', {
    p_user_id: login.userId,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_role_key: input.role_key,
    p_job_title: input.job_title ?? undefined,
    p_phone: input.phone ?? undefined,
    p_employment_type: input.employment_type,
    p_permissions: input.permissions,
    p_client_ids: input.client_ids,
  });
  if (error) {
    // The database refused (permission, rank, validation): remove the half-created login.
    await deleteLogin(login.userId).catch(() => undefined);
    return { status: 'error', message: toUserMessage(error) };
  }

  revalidatePath('/team');
  return { status: 'success', name: fullName, email: login.email, password: login.password, userId: login.userId };
}

const clientUserSchema = z.object({
  client_id: z.uuid(),
  first_name: name('Ism'),
  last_name: name('Familiya'),
  email,
  phone,
  title: z.string().trim().max(80).transform((v) => v || null),
  role_key: z.enum(['client_owner', 'client_employee']),
  can_approve: z.boolean(),
});

/** Client → Users → Add login (client owner or client employee). */
export async function createClientAccount(_: CredentialsState, formData: FormData): Promise<CredentialsState> {
  await requireStaff();
  const parsed = clientUserSchema.safeParse({
    client_id: formData.get('client_id'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    title: formData.get('title') ?? '',
    role_key: formData.get('role_key'),
    can_approve: formData.get('can_approve') === 'on',
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const input = parsed.data;
  const fullName = `${input.first_name} ${input.last_name}`;

  let login;
  try {
    login = await createLogin(input.email, fullName);
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), fieldErrors: { email: toUserMessage(error) } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('provision_client_user', {
    p_user_id: login.userId,
    p_client_id: input.client_id,
    p_role_key: input.role_key,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_phone: input.phone ?? undefined,
    p_title: input.title ?? undefined,
    // Client owners approve through their role; employees only when explicitly allowed.
    p_permissions: input.role_key === 'client_employee' && input.can_approve ? ['client.approve'] : [],
  });
  if (error) {
    await deleteLogin(login.userId).catch(() => undefined);
    return { status: 'error', message: toUserMessage(error) };
  }

  revalidatePath(`/clients/${input.client_id}`);
  return { status: 'success', name: fullName, email: login.email, password: login.password, userId: login.userId };
}

/** Issues a new temporary password; the database decides whether the caller may do it. */
export async function resetAccountPassword(userId: string): Promise<CredentialsState> {
  await requireStaff();
  const supabase = await createClient();
  const { data: email, error } = await supabase.rpc('authorize_password_reset', { p_user_id: userId });
  if (error || !email) return { status: 'error', message: toUserMessage(error) };
  try {
    const password = await setTemporaryPassword(userId);
    return { status: 'success', name: '', email, password, userId };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}

const statusSchema = z.object({
  user_id: z.uuid(),
  status: z.enum(['active', 'suspended', 'disabled']),
  reason: z.string().trim().max(300),
  revalidate: z.string().startsWith('/'),
});

/** Active / Suspended / Disabled. RLS access is cut by the status; the Auth ban ends open sessions. */
export async function setAccountStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = statusSchema.safeParse({
    user_id: formData.get('user_id'),
    status: formData.get('status'),
    reason: formData.get('reason') ?? '',
    revalidate: formData.get('revalidate') ?? '/team',
  });
  if (!parsed.success) return { status: 'error', message: 'Holatni tanlang.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { user_id, status, reason, revalidate } = parsed.data;
  if (status !== 'active' && !reason) return { status: 'error', message: 'Bloklash sababini yozing.', fieldErrors: { reason: 'Sababni yozing' } };

  const supabase = await createClient();
  const { data: previous, error } = await supabase.rpc('set_account_status', { p_user_id: user_id, p_status: status, p_reason: reason || undefined });
  if (error) return { status: 'error', message: toUserMessage(error) };

  try {
    await setLoginBlocked(user_id, status !== 'active');
  } catch (e) {
    // Keep the profile and the login consistent: roll the status back.
    await supabase.rpc('set_account_status', { p_user_id: user_id, p_status: previous, p_reason: 'Avtomatik tiklash' });
    return { status: 'error', message: toUserMessage(e) };
  }

  revalidatePath(revalidate);
  return { status: 'success', message: status === 'active' ? 'Akkaunt faollashtirildi.' : 'Akkaunt bloklandi.' };
}

const profileSchema = z.object({
  user_id: z.uuid(),
  first_name: name('Ism'),
  last_name: name('Familiya'),
  phone,
  job_title: z.string().trim().max(80).transform((v) => v || null),
  department: z.string().trim().max(80).transform((v) => v || null),
  employment_type: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
  employee_status: z.enum(['active', 'on_leave', 'terminated']).optional(),
});

/** Edits names/phone (RPC) and, for employees, the HR fields (RLS: employees.manage). */
export async function updateStaffProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('employees.manage');
  const parsed = profileSchema.safeParse({
    user_id: formData.get('user_id'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone') ?? '',
    job_title: formData.get('job_title') ?? '',
    department: formData.get('department') ?? '',
    employment_type: formData.get('employment_type') ?? undefined,
    employee_status: formData.get('employee_status') ?? undefined,
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const input = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.rpc('update_account_profile', {
    p_user_id: input.user_id,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_phone: input.phone ?? undefined,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };

  const { error: hrError } = await supabase
    .from('employees')
    .update({
      job_title: input.job_title,
      department: input.department,
      ...(input.employment_type ? { employment_type: input.employment_type } : {}),
      ...(input.employee_status ? { status: input.employee_status } : {}),
    })
    .eq('user_id', input.user_id);
  if (hrError) return { status: 'error', message: toUserMessage(hrError) };

  revalidatePath(`/team/${input.user_id}`);
  revalidatePath('/team');
  return { status: 'success', message: 'Saqlandi.' };
}

/** Client employee approval right (client_member_permissions). */
export async function setClientApproval(clientId: string, userId: string, allowed: boolean): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_client_member_permissions', {
    p_client_id: clientId,
    p_user_id: userId,
    p_permissions: allowed ? ['client.approve'] : [],
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success', message: allowed ? 'Tasdiqlash huquqi berildi.' : 'Tasdiqlash huquqi olib tashlandi.' };
}
