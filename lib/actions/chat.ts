'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type ChatActionResult = { ok: true; roomId?: string } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  'Write a message or attach a file': 'Xabar yozing yoki fayl biriktiring.',
  'Message is too long': 'Xabar juda uzun.',
  'Add at least one colleague': 'Kamida bitta hamkasbni tanlang.',
  'Name must be 1–120 characters': 'Guruh nomini yozing (120 belgigacha).',
  'Choose an active colleague': 'Faol hamkasbni tanlang.',
};
const message = (e: { message?: string; code?: string } | null) => (e?.message && MESSAGES[e.message]) || toUserMessage(e);

/** Send into a chat this person belongs to (the database checks membership and who may write to client chats). */
export async function sendRoomMessage(roomId: string, body: string, fileIds: string[] = [], replyTo: string | null = null): Promise<ChatActionResult> {
  await requireStaff();
  if (!z.uuid().safeParse(roomId).success) return { ok: false, message: 'Chat topilmadi.' };
  const files = z.array(z.uuid()).max(10).safeParse(fileIds);
  if (!files.success) return { ok: false, message: 'Fayllar noto‘g‘ri.' };
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text && !files.data.length) return { ok: false, message: 'Xabar yozing.' };
  const supabase = await createClient();
  const reply = replyTo && z.uuid().safeParse(replyTo).success ? replyTo : undefined;
  const { error } = await supabase.rpc('send_message', { p_room_id: roomId, p_body: text, p_file_ids: files.data, p_reply_to: reply });
  if (error) return { ok: false, message: error.code === '42501' ? 'Bu chatga yozish huquqingiz yo‘q (faqat kuzatasiz).' : message(error) };
  revalidatePath('/chat', 'layout');
  revalidatePath('/xodim/chat');
  return { ok: true };
}

export async function markRoomRead(roomId: string): Promise<void> {
  await requireStaff();
  if (!z.uuid().safeParse(roomId).success) return;
  const supabase = await createClient();
  await supabase.rpc('mark_chat_read', { p_room_id: roomId });
}

export async function openDirectChat(userId: string): Promise<ChatActionResult> {
  await requireStaff();
  if (!z.uuid().safeParse(userId).success) return { ok: false, message: 'Hamkasbni tanlang.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('open_direct_chat', { p_user_id: userId });
  if (error || !data) return { ok: false, message: message(error) };
  revalidatePath('/chat', 'layout');
  revalidatePath('/xodim/chat');
  return { ok: true, roomId: data };
}

export async function createGroupChat(name: string, memberIds: string[]): Promise<ChatActionResult> {
  await requireStaff();
  const ids = z.array(z.uuid()).max(100).safeParse(memberIds);
  if (!ids.success) return { ok: false, message: 'A’zolarni tanlang.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_group_chat', { p_name: String(name ?? '').trim(), p_member_ids: ids.data });
  if (error || !data) return { ok: false, message: message(error) };
  revalidatePath('/chat', 'layout');
  revalidatePath('/xodim/chat');
  return { ok: true, roomId: data };
}

/** The author edits their own message (row-level security: own, not deleted); the database stamps "tahrirlangan". */
export async function editRoomMessage(messageId: string, body: string): Promise<ChatActionResult> {
  const context = await requireStaff();
  if (!z.uuid().safeParse(messageId).success) return { ok: false, message: 'Xabar topilmadi.' };
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { ok: false, message: 'Xabar bo‘sh bo‘lmasin.' };
  if (text.length > 4000) return { ok: false, message: 'Xabar juda uzun.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('messages').update({ body: text }).eq('id', messageId).eq('sender_id', context.userId).is('deleted_at', null).select('id');
  if (error) return { ok: false, message: message(error) };
  if (!data?.length) return { ok: false, message: 'Faqat o‘z xabaringizni tahrirlay olasiz.' };
  revalidatePath('/chat', 'layout');
  revalidatePath('/xodim/chat');
  return { ok: true };
}

/** The author deletes their own message: the text is cleared, "Xabar o‘chirilgan" stays in its place. */
export async function deleteRoomMessage(messageId: string): Promise<ChatActionResult> {
  const context = await requireStaff();
  if (!z.uuid().safeParse(messageId).success) return { ok: false, message: 'Xabar topilmadi.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', context.userId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, message: message(error) };
  if (!data?.length) return { ok: false, message: 'Faqat o‘z xabaringizni o‘chira olasiz.' };
  revalidatePath('/chat', 'layout');
  revalidatePath('/xodim/chat');
  return { ok: true };
}
