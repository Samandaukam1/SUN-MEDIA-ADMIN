'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './state';

/** "Mijozga yuborish": one lead, a selection, or every ready lead of the client (leadIds omitted). */
export async function deliverLeadsAction(clientId: string, leadIds?: string[]): Promise<ActionState> {
  await requirePermission('crm.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('deliver_leads', { p_client: clientId, p_lead_ids: leadIds });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/crm');
  const delivered = Number((data as { delivered?: number } | null)?.delivered ?? 0);
  return { status: 'success', message: delivered ? `${delivered} ta lid mijozga yuborildi.` : 'Yuboriladigan tayyor lid yo‘q.' };
}

export async function discardLeadAction(leadId: string): Promise<ActionState> {
  await requirePermission('crm.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc('discard_leads', { p_lead_ids: [leadId], p_reason: 'Admin chiqarib tashladi' });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/crm');
  return { status: 'success', message: 'Lid chiqarib tashlandi.' };
}

export async function restoreLeadAction(leadId: string): Promise<ActionState> {
  await requirePermission('crm.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_lead', { p_lead_id: leadId });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/crm');
  return { status: 'success', message: 'Lid qaytarildi.' };
}

const reportSchema = z.object({
  client_id: z.uuid('Mijozni tanlang'),
  kind: z.enum(['weekly', 'monthly', 'custom']),
  from: z.iso.date(),
  to: z.iso.date(),
  note: z.string().trim().max(1000),
});

/** CRM hisobotlari → preview → "Mijozga yuborish". */
export async function sendCrmReportAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('crm.manage');
  const parsed = reportSchema.safeParse({
    client_id: formData.get('client_id'),
    kind: formData.get('kind'),
    from: formData.get('from'),
    to: formData.get('to'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.' };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc('send_crm_report', { p_client: v.client_id, p_kind: v.kind, p_from: v.from, p_to: v.to, p_note: v.note || undefined });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/crm/reports');
  redirect(`/crm/reports/${id}`);
}
