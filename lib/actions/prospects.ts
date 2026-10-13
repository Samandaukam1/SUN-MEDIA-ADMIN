'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { AiFailedError, AiNotConfiguredError, type AiContent } from '@/lib/ai';
import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { analyseBrief, analyseInstagram } from '@/lib/prospects/analysis';
import { profileFacts } from '@/lib/prospects/instagram';
import { cleanAnswers, isAnswered, readableAnswers, type Answers } from '@/lib/prospects/questions';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { fieldErrorsFrom, type ActionState } from './state';

const PERMISSION = 'prospects.manage';
export type ProspectResult = { ok: true } | { ok: false; message: string };

function aiMessage(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return 'AI ulanmagan: serverga ANTHROPIC_API_KEY qo‘shilishi kerak.';
  if (e instanceof AiFailedError) return e.message;
  return toUserMessage(e);
}

const handle = z
  .string()
  .trim()
  .max(120)
  .transform((v) => v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '').replace(/\?.*$/, ''))
  .transform((v) => v || null);

const prospectSchema = z.object({
  name: z.string().trim().min(1, 'Mijoz yoki brend nomini yozing').max(120),
  company: z.string().trim().max(160).transform((v) => v || null),
  phone: z.string().trim().max(40).transform((v) => v || null),
  instagram: handle,
});

export async function createProspect(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission(PERMISSION);
  const parsed = prospectSchema.safeParse({
    name: formData.get('name') ?? '',
    company: formData.get('company') ?? '',
    phone: formData.get('phone') ?? '',
    instagram: formData.get('instagram') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.from('prospects').insert(parsed.data).select('id').single();
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath('/tahlil');
  redirect(`/tahlil/${data.id}`);
}

export async function updateProspect(id: string, fields: { name?: string; company?: string; phone?: string; instagram?: string; notes?: string; status?: string }): Promise<ProspectResult> {
  await requirePermission(PERMISSION);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const patch: Database['public']['Tables']['prospects']['Update'] = {};
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) return { ok: false, message: 'Nom bo‘sh bo‘lmasin.' };
    patch.name = name.slice(0, 120);
  }
  if (fields.company !== undefined) patch.company = fields.company.trim().slice(0, 160) || null;
  if (fields.phone !== undefined) patch.phone = fields.phone.trim().slice(0, 40) || null;
  if (fields.instagram !== undefined) patch.instagram = handle.parse(fields.instagram);
  if (fields.notes !== undefined) patch.notes = fields.notes.trim().slice(0, 4000) || null;
  if (fields.status !== undefined) {
    const s = z.enum(['new', 'analyzed', 'won', 'lost']).safeParse(fields.status);
    if (!s.success) return { ok: false, message: 'Holat noto‘g‘ri.' };
    patch.status = s.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.from('prospects').update(patch).eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/tahlil/${id}`);
  revalidatePath('/tahlil');
  return { ok: true };
}

export async function saveAnswers(id: string, answers: Answers): Promise<ProspectResult> {
  await requirePermission(PERMISSION);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.from('prospects').update({ answers: cleanAnswers(answers) }).eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(`/tahlil/${id}`);
  return { ok: true };
}

async function loadProspect(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('prospects').select('id, name, company, instagram, answers').eq('id', id).maybeSingle();
  return { supabase, prospect: data };
}

/** AI reads the interview and suggests a tariff, the client's real needs and the first steps. */
export async function runBriefAnalysis(id: string): Promise<ProspectResult> {
  await requirePermission(PERMISSION);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const { supabase, prospect } = await loadProspect(id);
  if (!prospect) return { ok: false, message: 'Topilmadi.' };
  const answers = cleanAnswers(prospect.answers);
  const answered = Object.values(answers).filter(isAnswered).length;
  if (answered < 5) return { ok: false, message: `Kamida 5 ta savolga javob kerak (hozir ${answered} ta).` };
  const lines = readableAnswers(answers);
  try {
    const { result, model } = await analyseBrief({ name: prospect.name, company: prospect.company, instagram: prospect.instagram, answers: lines });
    const { error } = await supabase.from('prospect_analyses').insert({ prospect_id: id, kind: 'brief', input: { answers: lines }, result, model });
    if (error) return { ok: false, message: toUserMessage(error) };
    await supabase.from('prospects').update({ status: 'analyzed' }).eq('id', id).eq('status', 'new');
  } catch (e) {
    return { ok: false, message: aiMessage(e) };
  }
  revalidatePath(`/tahlil/${id}`);
  revalidatePath('/tahlil');
  return { ok: true };
}

const num = z.union([z.number(), z.string()]).transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/[\s,]/g, '')))).pipe(z.number().min(0).max(1e9));
const optionalNum = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null || v === '' ? null : typeof v === 'number' ? v : Number(String(v).replace(/[\s,]/g, ''))))
  .pipe(z.number().min(0).max(1e9).nullable());

const instagramInput = z.object({
  handle: handle.pipe(z.string({ message: 'Instagram nomini yozing' })),
  followers: num,
  following: optionalNum,
  posts: optionalNum,
  avgLikes: optionalNum,
  avgComments: optionalNum,
  avgViews: optionalNum,
  postsLast30: optionalNum,
  bio: z.string().trim().max(600).catch(''),
  screenshots: z.array(z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)).max(6),
});

/** AI looks at the profile: numbers (with computed facts) and up to six screenshots. */
export async function runInstagramAnalysis(id: string, raw: unknown): Promise<ProspectResult> {
  await requirePermission(PERMISSION);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const parsed = instagramInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Instagram nomi va obunachilar sonini to‘g‘ri kiriting.' };
  const v = parsed.data;
  if (v.screenshots.some((p) => !p.startsWith(`${id}/`))) return { ok: false, message: 'Skrinshotlar noto‘g‘ri.' };
  const { supabase, prospect } = await loadProspect(id);
  if (!prospect) return { ok: false, message: 'Topilmadi.' };

  const numbers = { followers: v.followers, following: v.following, posts: v.posts, avgLikes: v.avgLikes, avgComments: v.avgComments, avgViews: v.avgViews, postsLast30: v.postsLast30 };
  const facts = profileFacts(numbers);
  const images: AiContent[] = [];
  for (const path of v.screenshots) {
    const { data } = await supabase.storage.from('prospects').download(path);
    if (!data) continue;
    const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    images.push({ type: 'image', source: { type: 'base64', media_type: type, data: Buffer.from(await data.arrayBuffer()).toString('base64') } });
  }
  try {
    const { result, model } = await analyseInstagram({
      handle: `@${v.handle}`,
      numbers,
      facts,
      bio: v.bio,
      answers: readableAnswers(cleanAnswers(prospect.answers)),
      images,
    });
    const { error } = await supabase
      .from('prospect_analyses')
      .insert({ prospect_id: id, kind: 'instagram', input: { handle: v.handle, numbers, facts, bio: v.bio, screenshots: v.screenshots }, result, model });
    if (error) return { ok: false, message: toUserMessage(error) };
    if (!prospect.instagram) await supabase.from('prospects').update({ instagram: v.handle }).eq('id', id);
  } catch (e) {
    return { ok: false, message: aiMessage(e) };
  }
  revalidatePath(`/tahlil/${id}`);
  return { ok: true };
}

export async function deleteProspect(id: string): Promise<ProspectResult> {
  await requirePermission(PERMISSION);
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const supabase = await createClient();
  const { data: files } = await supabase.storage.from('prospects').list(id);
  if (files?.length) await supabase.storage.from('prospects').remove(files.map((f) => `${id}/${f.name}`));
  const { error } = await supabase.from('prospects').delete().eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/tahlil');
  return { ok: true };
}
