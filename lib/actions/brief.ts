'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { questionSchema } from '@/lib/brief/bank-schema';
import { builtinBank } from '@/lib/brief/engine';
import { aiConfig, checkModel } from '@/lib/brief/openai';
import { newToken, runReport, TOKEN_COOKIE, TOKEN_TTL_HOURS } from '@/lib/brief/server';
import { toUserMessage } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { KIOSK_COOKIE } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

/**
 * The manager's side of "Mijoz tahlili" interviews. Every action checks prospects.manage through the manager's own
 * session; reads and edits go through RLS. The service role is used only for what RLS deliberately does not allow
 * a browser session to touch: the session token (its hash) and starting the report job.
 */

const PERMISSION = 'prospects.manage';
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const uuid = z.uuid();

async function handOver(sessionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString();
  const { error } = await createAdminClient()
    .from('brief_sessions')
    .update({ token_hash: hash, token_expires_at: expires })
    .eq('id', sessionId)
    .in('status', ['ready', 'active']);
  if (error) return { ok: false, message: toUserMessage(error) };
  // Only this browser gets the key, only for the interview page; the previous client's key is replaced. The device is
  // locked to the interview until the manager unlocks it with their password.
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/suhbat', maxAge: TOKEN_TTL_HOURS * 3600 });
  jar.set(KIOSK_COOKIE, '1', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: TOKEN_TTL_HOURS * 3600 });
  return { ok: true };
}

const startInput = z.object({
  company: z.string().trim().max(160).catch(''),
  contact: z.string().trim().max(160).catch(''),
  prospectId: z.uuid().nullable().catch(null),
});

/** "Yangi tahlil": a new session on this device; the page then switches to the client's full-screen view. */
export async function briefStart(raw: unknown): Promise<Result<{ id: string }>> {
  const me = await requirePermission(PERMISSION);
  const input = startInput.parse(raw ?? {});
  const supabase = await createClient();
  let prospectId = input.prospectId;
  if (!prospectId && input.company) {
    const { data, error } = await supabase.from('prospects').insert({ name: input.company.slice(0, 120), company: input.company }).select('id').single();
    if (error) return { ok: false, message: toUserMessage(error) };
    prospectId = data.id;
  }
  const { data, error } = await supabase
    .from('brief_sessions')
    .insert({ prospect_id: prospectId, company_hint: input.company || null, contact_hint: input.contact || null, created_by: me.userId })
    .select('id')
    .single();
  if (error) return { ok: false, message: toUserMessage(error) };
  const h = await handOver(data.id);
  if (!h.ok) return h;
  await supabase.from('brief_events').insert({ session_id: data.id, kind: 'started', actor: me.userId });
  revalidatePath('/tahlil');
  return { ok: true, id: data.id };
}

/** Continue an unfinished interview on this device (a fresh key; the old one stops working). */
export async function briefResume(id: string): Promise<Result> {
  const me = await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const supabase = await createClient();
  const { data } = await supabase.from('brief_sessions').select('id, status').eq('id', id).maybeSingle();
  if (!data || !['ready', 'active'].includes(data.status)) return { ok: false, message: 'Bu tahlil yakunlangan yoki yopilgan.' };
  const h = await handOver(id);
  if (!h.ok) return h;
  await supabase.from('brief_events').insert({ session_id: id, kind: 'resumed', actor: me.userId });
  return { ok: true };
}

/** A link for another device (e.g. the client's own tablet). The key is shown once, here, to the manager only. */
export async function briefDeviceLink(id: string): Promise<Result<{ path: string }>> {
  const me = await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const supabase = await createClient();
  const { data } = await supabase.from('brief_sessions').select('status').eq('id', id).maybeSingle();
  if (!data || !['ready', 'active'].includes(data.status)) return { ok: false, message: 'Bu tahlil yakunlangan yoki yopilgan.' };
  const { token, hash } = newToken();
  const { error } = await createAdminClient()
    .from('brief_sessions')
    .update({ token_hash: hash, token_expires_at: new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString() })
    .eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  await supabase.from('brief_events').insert({ session_id: id, kind: 'device_link', actor: me.userId });
  return { ok: true, path: `/suhbat/k/${token}` };
}

/** Close an unfinished interview (its answers stay). */
export async function briefClose(id: string): Promise<Result> {
  const me = await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const { error } = await createAdminClient().from('brief_sessions').update({ status: 'abandoned', token_hash: null, token_expires_at: null }).eq('id', id).in('status', ['ready', 'active']);
  if (error) return { ok: false, message: toUserMessage(error) };
  await (await createClient()).from('brief_events').insert({ session_id: id, kind: 'closed', actor: me.userId });
  revalidatePath('/tahlil');
  revalidatePath(`/tahlil/suhbat/${id}`);
  return { ok: true };
}

/** Deletion (retention control): the session, its answers, reports and trail. The client record stays. */
export async function briefDelete(id: string): Promise<Result> {
  await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const { error } = await (await createClient()).from('brief_sessions').delete().eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath('/tahlil');
  return { ok: true };
}

export async function briefReview(id: string, fields: { notes?: string; review?: string }): Promise<Result> {
  const me = await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const patch: { manager_notes?: string | null; review_status?: string } = {};
  if (fields.notes !== undefined) patch.manager_notes = fields.notes.trim().slice(0, 8000) || null;
  if (fields.review !== undefined) {
    const r = z.enum(['new', 'reviewing', 'reviewed']).safeParse(fields.review);
    if (!r.success) return { ok: false, message: 'Holat noto‘g‘ri.' };
    patch.review_status = r.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.from('brief_sessions').update(patch).eq('id', id);
  if (error) return { ok: false, message: toUserMessage(error) };
  if (patch.review_status) await supabase.from('brief_events').insert({ session_id: id, kind: 'review', detail: { status: patch.review_status }, actor: me.userId });
  revalidatePath(`/tahlil/suhbat/${id}`);
  return { ok: true };
}

/** A new report version from the same answers (the earlier versions stay). */
export async function briefRegenerate(id: string): Promise<Result> {
  const me = await requirePermission(PERMISSION);
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Topilmadi.' };
  const supabase = await createClient();
  const { data: s } = await supabase.from('brief_sessions').select('status').eq('id', id).maybeSingle();
  if (s?.status !== 'completed') return { ok: false, message: 'Tahlil faqat yakunlangan suhbat uchun.' };
  const { data: last } = await supabase.from('brief_reports').select('version, status, created_at').eq('session_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  if (last?.status === 'pending' && Date.now() - Date.parse(last.created_at) < 5 * 60_000) return { ok: false, message: 'Tahlil hozir tayyorlanmoqda — biroz kuting.' };
  const version = (last?.version ?? 0) + 1;
  const { error } = await supabase.from('brief_reports').insert({ session_id: id, version, status: 'pending', created_by: me.userId });
  if (error) return { ok: false, message: error.code === '23505' ? 'Tahlil allaqachon boshlangan.' : toUserMessage(error) };
  after(() => runReport(id, version).catch(() => undefined));
  revalidatePath(`/tahlil/suhbat/${id}`);
  return { ok: true };
}

const correctionInput = z.object({ section: z.string().regex(/^[a-z_]{2,40}$/), text: z.string().trim().max(4000) });

/** A manager's correction of one report section, kept beside the original text with who and when. */
export async function briefCorrect(reportId: string, raw: unknown): Promise<Result> {
  const me = await requirePermission(PERMISSION);
  const c = correctionInput.safeParse(raw);
  if (!uuid.safeParse(reportId).success || !c.success) return { ok: false, message: 'Tuzatish noto‘g‘ri.' };
  const supabase = await createClient();
  const { data: r } = await supabase.from('brief_reports').select('session_id, correction').eq('id', reportId).maybeSingle();
  if (!r) return { ok: false, message: 'Hisobot topilmadi.' };
  const prev = (r.correction ?? {}) as Record<string, unknown>;
  const next = { ...prev, [c.data.section]: c.data.text ? { text: c.data.text, by: me.userId, at: new Date().toISOString() } : undefined };
  const { error } = await supabase
    .from('brief_reports')
    .update({ correction: next as Json, corrected_by: me.userId, corrected_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) return { ok: false, message: toUserMessage(error) };
  await supabase.from('brief_events').insert({ session_id: r.session_id, kind: 'correction', detail: { section: c.data.section }, actor: me.userId });
  revalidatePath(`/tahlil/suhbat/${r.session_id}`);
  return { ok: true };
}

/** Are the configured OpenAI models usable with the server's key? (Nothing is generated.) */
export async function briefAiStatus(): Promise<{ configured: boolean; models: { purpose: string; model: string; ok: boolean; message: string }[] }> {
  await requirePermission(PERMISSION);
  const cfg = aiConfig();
  if (!cfg.key) return { configured: false, models: [] };
  const models = await Promise.all(
    (['question', 'analysis'] as const).map(async (purpose) => {
      const r = await checkModel(cfg.models[purpose]);
      return { purpose, model: cfg.models[purpose], ok: r.ok, message: r.message };
    }),
  );
  return { configured: true, models };
}

// ---------------------------------------------------------------------------------------------------------------
// Question bank: every edit is a new version; finished interviews keep the snapshot they were asked with
// ---------------------------------------------------------------------------------------------------------------

async function latestVersion(key: string): Promise<number> {
  const { data } = await (await createClient()).from('brief_question_versions').select('version').eq('key', key).order('version', { ascending: false }).limit(1).maybeSingle();
  const builtin = builtinBank().find((q) => q.key === key)?.version ?? 0;
  return Math.max(data?.version ?? 0, builtin);
}

export async function briefBankSave(raw: unknown, note?: string): Promise<Result<{ version: number }>> {
  const me = await requirePermission(PERMISSION);
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const key = typeof base.key === 'string' ? base.key : '';
  const version = (await latestVersion(key)) + 1;
  const parsed = questionSchema.safeParse({ ...base, version });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Savol noto‘g‘ri to‘ldirilgan.' };
  const { version: _v, active, ...definition } = parsed.data;
  void _v;
  const { error } = await (await createClient())
    .from('brief_question_versions')
    .insert({ key, version, definition: definition as unknown as Json, active: active ?? true, note: note?.slice(0, 500) || null, created_by: me.userId });
  if (error) return { ok: false, message: error.code === '23505' ? 'Kimdir shu savolni hozirgina o‘zgartirdi — sahifani yangilang.' : toUserMessage(error) };
  revalidatePath('/tahlil/savollar');
  return { ok: true, version };
}
