'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createLogin, deleteLogin, setLoginBlocked, setTemporaryPassword } from '@/lib/accounts';
import { can, isSystemOwner, requirePermission, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { passwordProblem } from '@/lib/password-policy';
import { guardSystemOwner } from '@/lib/protect';
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
  skill_ids: z.array(z.uuid()).max(30),
  work_start: z.string().regex(/^\d{2}:\d{2}$/, 'Vaqtni kiriting'),
  work_end: z.string().regex(/^\d{2}:\d{2}$/, 'Vaqtni kiriting'),
  employee_status: z.enum(['active', 'on_leave']),
  birth_date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani to‘g‘ri kiriting')]),
  passport_series: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Seriya 2 ta lotin harfi, masalan AB')]),
  passport_number: z.union([z.literal(''), z.string().trim().regex(/^\d{7}$/, 'Raqam 7 ta raqam')]),
  initial_password: z.string().max(72),
}).refine((v) => v.work_end > v.work_start, { message: 'Ish tugash vaqti boshlanishidan keyin bo‘lsin', path: ['work_end'] });

/** Team → Add employee: creates the login, then provisions it with the admin's own session. */
export async function createEmployeeAccount(_: CredentialsState, formData: FormData): Promise<CredentialsState> {
  // Adding people is the system owner's right (or whoever they handed "Yangi xodim qo‘shish" to).
  await requirePermission('employees.create');
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
    skill_ids: formData.getAll('skill_ids').map(String),
    work_start: formData.get('work_start') ?? '09:00',
    work_end: formData.get('work_end') ?? '18:00',
    employee_status: formData.get('employee_status') ?? 'active',
    birth_date: formData.get('birth_date') ?? '',
    passport_series: formData.get('passport_series') ?? '',
    passport_number: formData.get('passport_number') ?? '',
    initial_password: formData.get('initial_password') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const input = parsed.data;
  const context = await requireStaff();
  const weak = input.initial_password ? passwordProblem(input.initial_password, { email: input.email }) : null;
  if (weak) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: { initial_password: weak } };
  const fullName = `${input.first_name} ${input.last_name}`;

  let login;
  try {
    login = await createLogin(input.email, fullName, input.initial_password || undefined);
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

  // Skills, work hours, activity and (system owner only) private data. The login already exists, so a failure here
  // is reported next to the password instead of undoing the account.
  const problems: string[] = [];
  if (input.skill_ids.length) {
    const { error: e } = await supabase.from('employee_skills').insert(input.skill_ids.map((skill_id) => ({ user_id: login.userId, skill_id })));
    if (e) problems.push('skilllar');
  }
  const { error: hoursError } = await supabase.rpc('set_work_hours', { p_user_id: login.userId, p_start: input.work_start, p_end: input.work_end });
  if (hoursError) problems.push('ish vaqti');
  if (input.employee_status !== 'active') {
    const { error: e } = await supabase.from('employees').update({ status: input.employee_status }).eq('user_id', login.userId);
    if (e) problems.push('faollik holati');
  }
  if (isSystemOwner(context) && (input.birth_date || input.passport_series || input.passport_number)) {
    const { error: e } = await supabase.from('employee_private').insert({
      user_id: login.userId,
      birth_date: input.birth_date || null,
      passport_series: input.passport_series || null,
      passport_number: input.passport_number || null,
    });
    if (e) problems.push('shaxsiy ma’lumotlar');
  }

  revalidatePath('/team');
  return {
    status: 'success',
    name: fullName,
    email: login.email,
    password: login.password,
    userId: login.userId,
    note: problems.length ? `Login yaratildi, lekin saqlanmadi: ${problems.join(', ')}. Xodim sahifasida qayta kiriting.` : undefined,
  };
}

const clientUserSchema = z.object({
  client_id: z.uuid(),
  first_name: name('Ism'),
  last_name: name('Familiya'),
  email,
  phone,
  title: z.string().trim().max(80).transform((v) => v || null),
  role_key: z.enum(['client_owner', 'client_employee']),
});

/** Client → Users → Add login (client owner or client employee). */
export async function createClientAccount(_: CredentialsState, formData: FormData): Promise<CredentialsState> {
  const context = await requireStaff();
  // Checked before the login is created: client logins are added by the system owner (clients.create).
  if (!can(context, 'clients.create')) return { status: 'error', message: 'Yangi mijoz loginini faqat Tizim egasi qo‘shadi.' };
  const parsed = clientUserSchema.safeParse({
    client_id: formData.get('client_id'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    title: formData.get('title') ?? '',
    role_key: formData.get('role_key'),
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
    // Clients only follow the work and write to SUN MEDIA; no approval rights are granted any more.
    p_permissions: [],
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
  const blocked = await guardSystemOwner(userId);
  if (blocked) return { status: 'error', message: blocked };
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
  const blocked = await guardSystemOwner(user_id);
  if (blocked) return { status: 'error', message: blocked };

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

// ---------------------------------------------------------------------------
// Access requests: logins nobody set up (e.g. a first Google sign-in) wait until an admin decides.
// ---------------------------------------------------------------------------
const grantSchema = z.object({
  user_id: z.uuid(),
  kind: z.enum(['staff', 'client']),
  first_name: name('Ism'),
  last_name: name('Familiya'),
  role_key: z.string().min(1, 'Rolni tanlang'),
  client_id: z.string().optional(),
  job_title: z.string().trim().max(80).transform((v) => v || null),
});

/** Kirish so‘rovi → "Xodim qilish" / "Mijoz akkaunti qilish": the database checks rank, scope and that the login is unprovisioned. */
export async function grantAccessRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = grantSchema.safeParse({
    user_id: formData.get('user_id'),
    kind: formData.get('kind'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    role_key: formData.get('role_key'),
    client_id: formData.get('client_id') || undefined,
    job_title: formData.get('job_title') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  if (v.kind === 'staff') {
    await requirePermission('employees.create');
    const { error } = await supabase.rpc('provision_staff_member', {
      p_user_id: v.user_id,
      p_first_name: v.first_name,
      p_last_name: v.last_name,
      p_role_key: v.role_key,
      p_job_title: v.job_title ?? undefined,
    });
    if (error) return { status: 'error', message: toUserMessage(error) };
  } else {
    await requirePermission('clients.create');
    if (!v.client_id || !z.uuid().safeParse(v.client_id).success) return { status: 'error', message: 'Mijozni tanlang.', fieldErrors: { client_id: 'Mijozni tanlang' } };
    const { error } = await supabase.rpc('provision_client_user', {
      p_user_id: v.user_id,
      p_client_id: v.client_id,
      p_role_key: v.role_key,
      p_first_name: v.first_name,
      p_last_name: v.last_name,
      p_permissions: [],
    });
    if (error) return { status: 'error', message: toUserMessage(error) };
  }
  // The dialog shows the result first; it refreshes the list when closed.
  return { status: 'success', message: 'Kirish berildi. Foydalanuvchi ilovada “Qayta tekshirish”ni bossa, ish joyi ochiladi.' };
}

/** Rad etish: the login opens nothing and is also blocked in Auth. */
export async function declineAccessRequest(userId: string): Promise<ActionState> {
  await requirePermission('employees.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc('decline_access_request', { p_user_id: userId });
  if (error) return { status: 'error', message: toUserMessage(error) };
  await setLoginBlocked(userId, true).catch(() => undefined);
  revalidatePath('/team/accounts');
  revalidatePath('/system/accounts');
  return { status: 'success', message: 'So‘rov rad etildi.' };
}

const selfSchema = z.object({ first_name: name('Ism'), last_name: name('Familiya'), phone });

/** "Mening profilim": anyone signed in to the panel edits their own name and phone (the RPC allows only self). */
export async function updateMyProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireStaff();
  const parsed = selfSchema.safeParse({ first_name: formData.get('first_name'), last_name: formData.get('last_name'), phone: formData.get('phone') ?? '' });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_account_profile', {
    p_user_id: context.userId,
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_phone: parsed.data.phone ?? undefined,
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Saqlandi.' };
}
