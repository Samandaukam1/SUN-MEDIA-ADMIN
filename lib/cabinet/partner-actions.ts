'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { loadChatRoom } from './partner-data';
import { resolvePartner } from './partner-context';

export type PartnerActionResult = { ok: true } | { ok: false; message: string };

/** A message (and optional already-uploaded files) from the partner into the brand's chat with SUN MEDIA. */
export async function sendPartnerMessage(brand: string | null, body: string, fileIds: string[] = []): Promise<PartnerActionResult> {
  const scope = await resolvePartner(brand);
  if (scope.preview) return { ok: false, message: 'Ko‘rish rejimida xabar yuborilmaydi.' };
  const text = typeof body === 'string' ? body.trim() : '';
  const files = z.array(z.uuid()).max(10).safeParse(fileIds);
  if (!files.success) return { ok: false, message: 'Fayllar noto‘g‘ri.' };
  if (!text && !files.data.length) return { ok: false, message: 'Xabar yozing.' };
  if (text.length > 4000) return { ok: false, message: 'Xabar 4000 belgidan oshmasin.' };
  const room = await loadChatRoom(scope.clientId);
  if (!room) return { ok: false, message: 'Chat topilmadi. SUN MEDIA bilan bog‘laning.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('send_message', { p_room_id: room.id, p_body: text, p_file_ids: files.data });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/kabinet/chat');
  return { ok: true };
}

export async function markPartnerChatRead(brand: string | null): Promise<void> {
  const scope = await resolvePartner(brand);
  if (scope.preview) return;
  const room = await loadChatRoom(scope.clientId);
  if (!room) return;
  const supabase = await createClient();
  await supabase.rpc('mark_chat_read', { p_room_id: room.id });
}

/** "Tarifni oshirish" — a request SUN MEDIA answers; nothing changes until they approve it. */
export async function requestPartnerUpgrade(brand: string | null, planId: string, message: string): Promise<PartnerActionResult> {
  const scope = await resolvePartner(brand);
  if (scope.preview) return { ok: false, message: 'Ko‘rish rejimida so‘rov yuborilmaydi.' };
  if (!scope.permissions.includes('client.plan.request_upgrade')) return { ok: false, message: 'Tarifni o‘zgartirishni brend rahbari so‘raydi.' };
  if (!z.uuid().safeParse(planId).success) return { ok: false, message: 'Tarifni tanlang.' };
  const note = typeof message === 'string' ? message.trim().slice(0, 1000) : '';
  const supabase = await createClient();
  const { error } = await supabase.from('plan_upgrade_requests').insert({ client_id: scope.clientId, requested_plan_id: planId, message: note || null });
  if (error) return { ok: false, message: error.code === '23505' ? 'Sizda javob kutayotgan so‘rov bor.' : toUserMessage(error) };
  revalidatePath('/kabinet/tarif');
  return { ok: true };
}

export async function cancelPartnerUpgrade(brand: string | null, requestId: string): Promise<PartnerActionResult> {
  const scope = await resolvePartner(brand);
  if (scope.preview) return { ok: false, message: 'Ko‘rish rejimi.' };
  if (!z.uuid().safeParse(requestId).success) return { ok: false, message: 'So‘rov topilmadi.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('plan_upgrade_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('client_id', scope.clientId)
    .select('id');
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: 'So‘rovni bekor qilib bo‘lmadi.' };
  revalidatePath('/kabinet/tarif');
  return { ok: true };
}
