'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './state';

/**
 * Sozlamalar → Sunny ovozi va uslubi (system owner only): the voice settings, the personality profile Sunny follows,
 * and the pronunciation fixes. Everything is written with the owner's own session (row-level security).
 */
const voice = z.object({
  provider: z.enum(['azure', 'gemini', 'off']),
  voice: z.string().regex(/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/, 'Ovoz nomi noto‘g‘ri'),
  fallback_voice: z.string().regex(/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/, 'Ovoz nomi noto‘g‘ri'),
  rate: z.coerce.number().int().min(-50).max(60),
  pitch: z.coerce.number().int().min(-50).max(60),
  monthly_chars: z.coerce.number().int().min(0).max(100_000_000),
});

export async function saveSunnyVoice(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSystemOwner();
  const parsed = voice.safeParse(Object.fromEntries(['provider', 'voice', 'fallback_voice', 'rate', 'pitch', 'monthly_chars'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Qiymatlar noto‘g‘ri.' };
  const value = { ...parsed.data, enabled: fd.get('enabled') === 'on', paid_allowed: fd.get('paid_allowed') === 'on' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('app_settings').update({ value }).eq('key', 'assistant.voice').select('key');
  if (error || !data?.length) return { status: 'error', message: 'Saqlab bo‘lmadi (migratsiya qo‘llanganmi?).' };
  revalidatePath('/settings/sunny');
  return { status: 'success', message: 'Ovoz sozlamalari saqlandi (30 soniyada kuchga kiradi).' };
}

const personality = z.object({
  sarcasm: z.coerce.number().min(0).max(1),
  qitmir_intensity: z.coerce.number().int().min(1).max(3),
  phrases: z.string().max(2000),
  avoid_phrases: z.string().max(2000),
  reply_length: z.enum(['short', 'normal', 'detailed']),
});

export async function saveSunnyStyle(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSystemOwner();
  const parsed = personality.safeParse(Object.fromEntries(['sarcasm', 'qitmir_intensity', 'phrases', 'avoid_phrases', 'reply_length'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) return { status: 'error', message: 'Qiymatlar noto‘g‘ri.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('assistant_personality')
    .update({ ...parsed.data, learn_from_feedback: fd.get('learn_from_feedback') === 'on' })
    .eq('id', 1);
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath('/settings/sunny');
  return { status: 'success', message: 'Uslub profili saqlandi.' };
}

export async function addPronunciation(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireSystemOwner();
  const word = String(fd.get('word') ?? '').trim().slice(0, 80);
  const sayAs = String(fd.get('say_as') ?? '').trim().slice(0, 120);
  if (!word || !sayAs) return { status: 'error', message: 'So‘z va uning aytilishini yozing.' };
  const supabase = await createClient();
  const { error } = await supabase.from('assistant_pronunciations').upsert({ word, say_as: sayAs, note: String(fd.get('note') ?? '').slice(0, 300) || null, created_by: me.userId }, { onConflict: 'word' });
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath('/settings/sunny');
  return { status: 'success', message: `«${word}» endi «${sayAs}» deb o‘qiladi.` };
}

export async function removePronunciation(id: string): Promise<void> {
  await requireSystemOwner();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from('assistant_pronunciations').delete().eq('id', id);
  revalidatePath('/settings/sunny');
}
