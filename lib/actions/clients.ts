'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { can, requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Kompaniya nomini kiriting').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/[^A-Z0-9]/g, ''))
    .refine((v) => v === '' || (v.length >= 2 && v.length <= 12), 'Kod 2–12 ta lotin harf yoki raqam'),
  legal_name: optional(160),
  industry: optional(80),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Sayt https:// bilan boshlansin')
    .transform((v) => v || null),
  address: optional(200),
  description: optional(1000),
});

function codeFrom(name: string): string {
  const letters = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (letters || 'CLIENT').slice(0, 8);
}

function read(formData: FormData) {
  return {
    name: formData.get('name') ?? '',
    code: formData.get('code') ?? '',
    legal_name: formData.get('legal_name') ?? '',
    industry: formData.get('industry') ?? '',
    website: formData.get('website') ?? '',
    address: formData.get('address') ?? '',
    description: formData.get('description') ?? '',
  };
}

/** Clients → Add client: the system owner's right (RLS: clients.create). */
export async function createClientRecord(_: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireStaff();
  if (!can(context, 'clients.create')) return { status: 'error', message: 'Yangi mijozni faqat Tizim egasi qo‘shadi.' };
  const parsed = clientSchema.safeParse(read(formData));
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, code: input.code || codeFrom(input.name), created_by: context.userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { status: 'error', message: 'Bu kod bilan mijoz bor.', fieldErrors: { code: 'Boshqa kod tanlang' } };
    return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath('/clients');
  redirect(`/clients/${data.id}?tab=users`);
}

const updateSchema = clientSchema.extend({
  id: z.uuid(),
  status: z.enum(['active', 'paused', 'disabled', 'archived']),
});

export async function updateClientRecord(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = updateSchema.safeParse({ ...read(formData), id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { id, ...input } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('clients')
    .update({ ...input, code: input.code || codeFrom(input.name) })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') return { status: 'error', message: 'Bu kod bilan mijoz bor.', fieldErrors: { code: 'Boshqa kod tanlang' } };
    return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath(`/clients/${id}`);
  revalidatePath('/clients');
  return { status: 'success', message: 'Saqlandi.' };
}

const teamSchema = z.object({
  client_id: z.uuid(),
  user_id: z.uuid('Xodimni tanlang'),
  team_role: z.enum(['account_manager', 'project_manager', 'smm_manager', 'operator', 'editor', 'designer', 'copywriter', 'assistant']),
});

/** Assign a SUN MEDIA employee to the client's team (RLS + staff-only guard in the database). */
export async function assignTeamMember(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = teamSchema.safeParse({ client_id: formData.get('client_id'), user_id: formData.get('user_id'), team_role: formData.get('team_role') });
  if (!parsed.success) return { status: 'error', message: 'Xodim va rolni tanlang.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from('client_team_members').insert(parsed.data);
  if (error) {
    if (error.code === '23505') return { status: 'error', message: 'Bu xodim shu rolda allaqachon biriktirilgan.' };
    return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath(`/clients/${parsed.data.client_id}`);
  return { status: 'success', message: 'Xodim biriktirildi.' };
}

export async function removeTeamMember(clientId: string, userId: string, teamRole: string): Promise<ActionState> {
  await requireStaff();
  const role = teamSchema.shape.team_role.safeParse(teamRole);
  if (!role.success) return { status: 'error', message: 'Noto‘g‘ri rol.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_team_members')
    .delete()
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .eq('team_role', role.data);
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success' };
}

const billingSchema = z.object({
  agreed_price: z.coerce.number().min(0).max(1e13).nullable(),
  currency: z.enum(['UZS', 'USD']),
  billing_period: z.enum(['monthly', 'quarterly', 'yearly', 'one_time']),
  next_payment_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  next_payment_amount: z.coerce.number().min(0).max(1e13).nullable(),
  payment_status: z.enum(['paid', 'pending', 'partial']),
  last_paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  note: z.string().trim().max(1000).nullable(),
});
export type BillingInput = z.input<typeof billingSchema>;

/** The agreed price and payments of one client (only this client; the tariff's list price is untouched). */
export async function saveClientBilling(clientId: string, input: BillingInput): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireStaff();
  if (!z.uuid().safeParse(clientId).success) return { ok: false, message: 'Mijoz topilmadi.' };
  const parsed = billingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Narx va sanalarni tekshiring.' };
  const supabase = await createClient();
  const { error } = await supabase.from('client_billing').upsert({ client_id: clientId, ...parsed.data, note: parsed.data.note || null }, { onConflict: 'client_id' });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/clients');
  return { ok: true };
}
