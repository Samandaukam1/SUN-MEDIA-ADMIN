'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { z } from 'zod';

import { AgentAiOffline, agentJson } from '@/lib/agents/ai';
import { startAgentConnect, disconnectAgent } from '@/lib/agents/connect';
import { isEditable, normalizeColor, normalizeUsername } from '@/lib/agents/core';
import { SYSTEM_RULES, briefText } from '@/lib/agents/creative';
import { applyEdit, generateItem, rejectItem } from '@/lib/agents/pipeline';
import { approveItem, publishItem } from '@/lib/agents/publisher';
import { addMemory, BUCKET, briefOf, db, memoryOf, requireAgents, upload } from '@/lib/agents/server';
import { runResearch } from '@/lib/agents/worker';
import { agencyDateKey, isDateKey } from '@/lib/time';
import type { Json } from '@/types/database';

import { fieldErrorsFrom, type ActionState } from './state';

export type AgentResult = { ok: boolean; message: string };
const uuid = (v: string) => z.uuid().safeParse(v).success;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Ko‘pi bilan ${max} belgi`)
    .transform((v) => v || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt HH:MM ko‘rinishida');

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Profil nomini yozing').max(120),
  instagram_username: z
    .string()
    .trim()
    .max(200)
    .transform((v, ctx) => {
      if (!v) return null;
      const u = normalizeUsername(v);
      if (!u) ctx.addIssue({ code: 'custom', message: 'Instagram havolasi yoki @username noto‘g‘ri' });
      return u;
    }),
  phone: text(40),
  telegram: text(64).transform((v) => (v ? v.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '') : null)),
  address: text(300),
  website: text(200),
  business: text(300),
  products: text(3000),
  audience: text(2000),
  region: text(200),
  language: z.enum(['uz', 'uz-cyrl', 'ru']),
  goal: text(1000),
  advantages: text(3000),
  tone: text(500),
  instructions: text(6000),
  facts: text(6000),
  price_source: text(3000),
  cta: text(200),
  forbidden: text(2000),
  good_examples: text(4000),
  bad_examples: text(4000),
  stories_per_day: z.coerce.number().int().min(1, '1–10').max(10, '1–10'),
  story_time: time,
  post_time: time,
  post_start_date: z.string().refine(isDateKey, 'Sana noto‘g‘ri'),
  approval_mode: z.enum(['manual', 'auto']),
  auto_publish: z.boolean(),
  research_enabled: z.boolean(),
  colors: z.record(z.string(), z.string()),
});

function readProfileForm(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? '');
  const colors: Record<string, string> = {};
  for (const k of ['primary', 'secondary', 'bg', 'text']) {
    const c = normalizeColor(s(`color_${k}`));
    if (c) colors[k] = c;
  }
  return profileSchema.safeParse({
    name: s('name'),
    instagram_username: s('instagram'),
    phone: s('phone'),
    telegram: s('telegram'),
    address: s('address'),
    website: s('website'),
    business: s('business'),
    products: s('products_text'),
    audience: s('audience'),
    region: s('region'),
    language: s('language') || 'uz',
    goal: s('goal'),
    advantages: s('advantages'),
    tone: s('tone'),
    instructions: s('instructions'),
    facts: s('facts'),
    price_source: s('price_source'),
    cta: s('cta'),
    forbidden: s('forbidden'),
    good_examples: s('good_examples'),
    bad_examples: s('bad_examples'),
    stories_per_day: s('stories_per_day') || 3,
    story_time: s('story_time') || '09:00',
    post_time: s('post_time') || '08:00',
    post_start_date: s('post_start_date') || agencyDateKey(),
    approval_mode: s('approval_mode') === 'auto' ? 'auto' : 'manual',
    auto_publish: fd.get('auto_publish') === 'on',
    research_enabled: fd.get('research_enabled') === 'on',
    colors,
  });
}

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function saveAsset(profileId: string, kind: string, file: File, note: string | null): Promise<string | null> {
  if (!file || typeof file === 'string' || !file.size) return null;
  if (!ALLOWED.has(file.type)) return 'Faqat PNG, JPEG yoki WebP rasm.';
  if (file.size > 2.8 * 1024 * 1024) return 'Rasm 2,8 MB dan katta — kichraytirib yuklang.';
  const buf = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return 'Rasm o‘qilmadi.';
  }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${profileId}/assets/${kind}-${randomBytes(6).toString('hex')}.${ext}`;
  await upload(path, buf, file.type);
  await db()
    .from('agent_assets')
    .insert({ profile_id: profileId, kind, storage_path: path, file_name: file.name.slice(0, 200), mime: file.type, width: meta.width ?? 0, height: meta.height ?? 0, note });
  return null;
}

export async function createAgentProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAgents();
  const parsed = readProfileForm(fd);
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { colors, ...rest } = parsed.data;
  const { data, error } = await db()
    .from('agent_profiles')
    .insert({ ...rest, colors: colors as Json, created_by: ctx.userId })
    .select('id')
    .single();
  if (error) return { status: 'error', message: error.code === '23505' ? 'Bu Instagram profil allaqachon qo‘shilgan.' : 'Profilni saqlab bo‘lmadi.' };
  const logo = fd.get('logo');
  if (logo instanceof File && logo.size) await saveAsset(data.id, 'logo', logo, null);
  for (const f of fd.getAll('product_files')) if (f instanceof File && f.size) await saveAsset(data.id, 'product', f, null);
  // Yaqin 3 kunlik slotlar darhol yaratiladi; birinchi story va post shu zahoti navbatga qo'yiladi.
  await db().rpc('agents_plan', { p_profile: data.id, p_days: 3 });
  revalidatePath('/agents');
  redirect(`/agents/profillar/${data.id}?yangi=1`);
}

export async function updateAgentProfile(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  if (!uuid(id)) return { status: 'error', message: 'Profil topilmadi.' };
  const parsed = readProfileForm(fd);
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { colors, ...rest } = parsed.data;
  const { data: before } = await db().from('agent_profiles').select('instagram_username').eq('id', id).maybeSingle();
  const { error } = await db().from('agent_profiles').update({ ...rest, colors: colors as Json }).eq('id', id);
  if (error) return { status: 'error', message: error.code === '23505' ? 'Bu Instagram profil boshqa kartada bor.' : 'Saqlab bo‘lmadi.' };
  // Profil havolasi o'zgarsa: ulangan hisob bilan moslik qayta tekshiriladi — mos bo'lmasa nashr to'xtaydi.
  if (before && before.instagram_username !== rest.instagram_username) {
    const { data: conn } = await db().from('agent_ig_connections').select('id, username').eq('profile_id', id).maybeSingle();
    if (conn && conn.username !== rest.instagram_username) {
      await db().from('agent_profiles').update({ auto_publish: false }).eq('id', id);
      await db().from('agent_ig_connections').update({ status: 'reauth', last_error: 'Profil havolasi o‘zgardi — ulangan hisob mos emas. Qayta ulang.' }).eq('id', conn.id);
    }
  }
  await db().rpc('agents_plan', { p_profile: id, p_days: 3 });
  revalidatePath(`/agents/profillar/${id}`);
  return { status: 'success', message: 'Saqlandi. Keyingi materiallar yangi ko‘rsatmalar bilan tayyorlanadi.' };
}

export async function setAgentProfileStatus(id: string, action: 'pause' | 'resume' | 'archive'): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(id)) return { ok: false, message: 'Topilmadi.' };
  let message = '';
  if (action === 'pause') {
    await db().from('agent_profiles').update({ status: 'paused', paused_at: new Date().toISOString() }).eq('id', id);
    message = 'Pauza: yangi materiallar va nashrlar to‘xtadi.';
  } else if (action === 'resume') {
    await db().from('agent_profiles').update({ status: 'paused' }).eq('id', id).eq('status', 'archived');
    const { data: n } = await db().rpc('agents_resume', { p_profile: id });
    message = n ? `Qayta yoqildi. ${n} ta eski material qayta rejalashtirishni kutmoqda (birdan chiqmaydi).` : 'Qayta yoqildi.';
  } else {
    await db().from('agent_profiles').update({ status: 'archived', auto_publish: false }).eq('id', id);
    message = 'Arxivlandi.';
  }
  revalidatePath('/agents', 'layout');
  return { ok: true, message };
}

export async function uploadAgentAssets(profileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  if (!uuid(profileId)) return { status: 'error', message: 'Profil topilmadi.' };
  const kind = z.enum(['logo', 'product', 'style', 'reference']).safeParse(fd.get('kind'));
  if (!kind.success) return { status: 'error', message: 'Fayl turini tanlang.' };
  const note = String(fd.get('note') ?? '').trim().slice(0, 300) || null;
  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { status: 'error', message: 'Rasm tanlang.' };
  const errors: string[] = [];
  for (const f of files.slice(0, 10)) {
    const e = await saveAsset(profileId, kind.data, f, note);
    if (e) errors.push(`${f.name}: ${e}`);
  }
  revalidatePath(`/agents/profillar/${profileId}`);
  return errors.length ? { status: 'error', message: errors.join(' ') } : { status: 'success', message: `${files.length} ta rasm yuklandi.` };
}

export async function deleteAgentAsset(assetId: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(assetId)) return { ok: false, message: 'Topilmadi.' };
  const { data } = await db().from('agent_assets').delete().eq('id', assetId).select('profile_id, storage_path').maybeSingle();
  if (data) {
    await db().storage.from(BUCKET).remove([data.storage_path]);
    revalidatePath(`/agents/profillar/${data.profile_id}`);
  }
  return { ok: true, message: 'O‘chirildi.' };
}

export async function addAgentMemory(profileId: string, kind: string, content: string): Promise<AgentResult> {
  const ctx = await requireAgents();
  if (!uuid(profileId) || !['brand_rule', 'preference', 'fact', 'plan'].includes(kind)) return { ok: false, message: 'Noto‘g‘ri so‘rov.' };
  if (!content.trim()) return { ok: false, message: 'Matn yozing.' };
  await addMemory(profileId, kind, content, {}, ctx.userId);
  revalidatePath(`/agents/profillar/${profileId}`);
  return { ok: true, message: 'Xotiraga qo‘shildi.' };
}

export async function deactivateAgentMemory(id: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(id)) return { ok: false, message: 'Topilmadi.' };
  const { data } = await db().from('agent_memory').update({ active: false }).eq('id', id).select('profile_id').maybeSingle();
  if (data) revalidatePath(`/agents/profillar/${data.profile_id}`);
  return { ok: true, message: 'O‘chirildi.' };
}

/** "Hozir tayyorlash": tanlangan kun uchun slot (bo'lmasa yaratiladi) va darhol tayyorlash. */
export async function generateAgentNow(profileId: string, kind: 'story' | 'post', dateKey: string): Promise<AgentResult & { itemId?: string }> {
  await requireAgents();
  if (!uuid(profileId) || !['story', 'post'].includes(kind) || !isDateKey(dateKey)) return { ok: false, message: 'Noto‘g‘ri so‘rov.' };
  const { data: p } = await db().from('agent_profiles').select('status, story_time, post_time').eq('id', profileId).maybeSingle();
  if (!p || p.status !== 'active') return { ok: false, message: 'Profil faol emas.' };
  const at = new Date(`${dateKey}T${(kind === 'story' ? p.story_time : p.post_time).slice(0, 5)}:00+05:00`).toISOString();
  await db().from('agent_items').upsert({ profile_id: profileId, kind, target_date: dateKey, scheduled_at: at, prepare_at: new Date().toISOString() }, { onConflict: 'profile_id,kind,target_date', ignoreDuplicates: true });
  const { data: item } = await db().from('agent_items').select('id, status').eq('profile_id', profileId).eq('kind', kind).eq('target_date', dateKey).maybeSingle();
  if (!item) return { ok: false, message: 'Slot yaratilmadi.' };
  if (!isEditable(item.status)) return { ok: false, message: 'Bu kun uchun material allaqachon chiqarilgan yoki ishlanmoqda.', itemId: item.id };
  const r = await generateItem(item.id, { newIdea: true });
  revalidatePath('/agents', 'layout');
  return { ok: r.ok, message: r.ok ? 'Material tayyor.' : (r.message ?? 'Tayyorlab bo‘lmadi.'), itemId: item.id };
}

export async function regenerateAgentItem(itemId: string): Promise<AgentResult> {
  const ctx = await requireAgents();
  if (!uuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('status').eq('id', itemId).maybeSingle();
  if (!item || !isEditable(item.status)) return { ok: false, message: 'Chiqarilgan yoki ishlanayotgan materialni qayta yaratib bo‘lmaydi.' };
  const r = await generateItem(itemId, { newIdea: true, by: ctx.userId });
  revalidatePath('/agents', 'layout');
  return { ok: r.ok, message: r.ok ? 'Yangi g‘oya bilan qayta yaratildi.' : (r.message ?? 'Xato.') };
}

async function itemAndProfile(itemId: string) {
  if (!uuid(itemId)) return null;
  const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!item) return null;
  const { data: profile } = await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle();
  return profile ? { item, profile } : null;
}

export async function approveAgentItem(itemId: string): Promise<AgentResult> {
  const ctx = await requireAgents();
  const x = await itemAndProfile(itemId);
  if (!x) return { ok: false, message: 'Topilmadi.' };
  const r = await approveItem(x.item, x.profile, ctx.userId);
  revalidatePath('/agents', 'layout');
  return r;
}

export async function rejectAgentItem(itemId: string, reason: string): Promise<AgentResult> {
  const ctx = await requireAgents();
  const x = await itemAndProfile(itemId);
  if (!x) return { ok: false, message: 'Topilmadi.' };
  if (!isEditable(x.item.status)) return { ok: false, message: 'Chiqarilgan materialni rad etib bo‘lmaydi.' };
  await rejectItem(x.item, ctx.userId, reason.trim().slice(0, 500));
  revalidatePath('/agents', 'layout');
  return { ok: true, message: 'Rad etildi. G‘oya va sabab xotiraga yozildi — qaytarilmaydi.' };
}

/** Tuzatish: izoh bilan qayta yozish. `rule` — doimiy brend qoidasi sifatida saqlash (bir martalik emas). */
export async function fixAgentItem(itemId: string, comment: string, rule: boolean): Promise<AgentResult> {
  const ctx = await requireAgents();
  const x = await itemAndProfile(itemId);
  const note = comment.trim().slice(0, 1500);
  if (!x) return { ok: false, message: 'Topilmadi.' };
  if (!note) return { ok: false, message: 'Nimani tuzatish kerakligini yozing.' };
  if (!isEditable(x.item.status)) return { ok: false, message: 'Chiqarilgan materialni tuzatib bo‘lmaydi.' };
  await db().from('agent_approvals').insert({ item_id: itemId, version_id: x.item.current_version_id, decision: 'fix', scope: rule ? 'rule' : 'once', comment: note, decided_by: ctx.userId });
  await addMemory(x.profile.id, rule ? 'brand_rule' : 'correction', note, { item_id: itemId, scope: rule ? 'doimiy' : 'bir martalik' }, ctx.userId);
  await db().from('agent_items').update({ status: 'needs_fix' }).eq('id', itemId);
  const r = await generateItem(itemId, { correction: note, by: ctx.userId });
  revalidatePath('/agents', 'layout');
  return { ok: r.ok, message: r.ok ? 'Tuzatildi — yangi versiya tasdiqqa tayyor.' : (r.message ?? 'Qayta yozib bo‘lmadi.') };
}

export async function editAgentItem(itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAgents();
  const x = await itemAndProfile(itemId);
  if (!x || !x.item.current_version_id) return { status: 'error', message: 'Topilmadi.' };
  if (!isEditable(x.item.status)) return { status: 'error', message: 'Chiqarilgan materialni tahrirlab bo‘lmaydi.' };
  const count = Number(fd.get('frames') ?? 0);
  const frames = Array.from({ length: Math.min(10, Math.max(1, count)) }, (_, i) => ({
    role: String(fd.get(`role_${i}`) ?? 'value'),
    headline: String(fd.get(`headline_${i}`) ?? ''),
    body: String(fd.get(`body_${i}`) ?? ''),
    cta: String(fd.get(`cta_${i}`) ?? ''),
  }));
  if (frames.some((f) => !f.headline.trim())) return { status: 'error', message: 'Har kadrda sarlavha bo‘lsin.' };
  const r = await applyEdit(itemId, { frames, caption: String(fd.get('caption') ?? '').trim(), hashtags: String(fd.get('hashtags') ?? '').trim() }, ctx.userId);
  revalidatePath(`/agents/kontent/${itemId}`);
  return r.ok ? { status: 'success', message: 'Saqlandi: yangi versiya, rasmlar qayta chizildi. Qayta tasdiqlang.' } : { status: 'error', message: r.message ?? 'Saqlab bo‘lmadi.' };
}

export async function rescheduleAgentItem(itemId: string, dateKey: string, hhmm: string): Promise<AgentResult> {
  await requireAgents();
  const x = await itemAndProfile(itemId);
  if (!x || !isDateKey(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return { ok: false, message: 'Sana yoki vaqt noto‘g‘ri.' };
  if (!isEditable(x.item.status)) return { ok: false, message: 'Chiqarilgan materialni ko‘chirib bo‘lmaydi.' };
  const at = new Date(`${dateKey}T${hhmm}:00+05:00`);
  if (at.getTime() < Date.now()) return { ok: false, message: 'O‘tib ketgan vaqtni tanlab bo‘lmaydi.' };
  const { data: clash } = await db().from('agent_items').select('id').eq('profile_id', x.profile.id).eq('kind', x.item.kind).eq('target_date', dateKey).neq('id', itemId).maybeSingle();
  if (clash) return { ok: false, message: 'Bu kunda shu turdagi boshqa material bor.' };
  // Vaqt o'zgardi → hash o'zgaradi → eski tasdiq amal qilmaydi: qayta tasdiq kerak.
  const status = x.item.current_version_id ? (['qa_failed', 'limit_reached'].includes(x.item.status) ? x.item.status : 'pending_approval') : 'queued';
  await db().from('agent_items').update({ target_date: dateKey, scheduled_at: at.toISOString(), status, last_error: null }).eq('id', itemId);
  revalidatePath('/agents', 'layout');
  return { ok: true, message: 'Ko‘chirildi. Vaqt o‘zgargani uchun qayta tasdiqlash kerak.' };
}

export async function publishAgentNow(itemId: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const r = await publishItem(itemId, { manual: true });
  revalidatePath('/agents', 'layout');
  return { ok: r.ok, message: r.message };
}

export async function connectAgentInstagram(profileId: string, force: boolean): Promise<AgentResult> {
  const ctx = await requireAgents();
  if (!uuid(profileId)) return { ok: false, message: 'Topilmadi.' };
  const r = await startAgentConnect(ctx.userId, profileId, force);
  if (!r.ok) return { ok: false, message: r.message };
  redirect(r.url);
}

export async function disconnectAgentInstagram(profileId: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(profileId)) return { ok: false, message: 'Topilmadi.' };
  await disconnectAgent(profileId);
  revalidatePath(`/agents/profillar/${profileId}`);
  return { ok: true, message: 'Instagram uzildi, avtomatik nashr o‘chirildi.' };
}

export async function runAgentResearch(profileId: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(profileId)) return { ok: false, message: 'Topilmadi.' };
  const r = await runResearch(profileId);
  revalidatePath(`/agents/profillar/${profileId}`);
  return { ok: r.ok, message: r.message };
}

const DIRECTIONS = {
  type: 'object',
  properties: { directions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'description'], additionalProperties: false } } },
  required: ['directions'],
  additionalProperties: false,
};

/** 5–7 ta kontent yo'nalishi (biznesga mos). AI ulanmagan bo'lsa — umumiy, tahrirlanadigan ro'yxat. */
export async function buildAgentDirections(profileId: string): Promise<AgentResult> {
  await requireAgents();
  if (!uuid(profileId)) return { ok: false, message: 'Topilmadi.' };
  const { data: p } = await db().from('agent_profiles').select('*').eq('id', profileId).maybeSingle();
  if (!p) return { ok: false, message: 'Topilmadi.' };
  let list: { title: string; description: string }[];
  try {
    const r = await agentJson({
      stage: 'write',
      profileId,
      purpose: 'directions',
      system: SYSTEM_RULES,
      user: `${briefText(briefOf(p), await memoryOf(p.id), false)}\n\nShu biznes uchun 5–7 ta kontent yo‘nalishi (rubrika) tuz: har biri auditoriyaga foyda va biznes maqsadiga xizmat qilsin, bir-biridan farq qilsin. title ≤ 60 belgi, description ≤ 200 belgi.`,
      schema: DIRECTIONS,
    });
    list = z.object({ directions: z.array(z.object({ title: z.string().min(1).max(160), description: z.string().max(600) })).min(3).max(8) }).parse(r.data).directions;
  } catch (e) {
    if (!(e instanceof AgentAiOffline)) return { ok: false, message: e instanceof Error ? e.message : 'Xato.' };
    list = [
      { title: 'Foydali maslahatlar', description: 'Auditoriya muammosini hal qiladigan qisqa, amaliy maslahat.' },
      { title: 'Mahsulot yaqindan', description: 'Bitta mahsulot yoki xizmat, bitta aniq foyda (faqat brifdagi faktlar).' },
      { title: 'Savol-javob', description: 'Mijozlar ko‘p beradigan savollar va sodda javoblar.' },
      { title: 'Sahna ortida', description: 'Jamoa va ish jarayoni — ishonch uchun.' },
      { title: 'Xato va yechim', description: 'Ko‘p uchraydigan xatolar va ularning oldini olish.' },
    ];
  }
  await db().from('agent_directions').delete().eq('profile_id', profileId);
  await db().from('agent_directions').insert(list.slice(0, 7).map((d, i) => ({ profile_id: profileId, title: d.title.slice(0, 160), description: d.description.slice(0, 600), position: i })));
  revalidatePath(`/agents/profillar/${profileId}`);
  return { ok: true, message: `${Math.min(7, list.length)} ta yo‘nalish tuzildi.` };
}

const settingsSchema = z.object({
  publishing_enabled: z.boolean(),
  simulate: z.boolean(),
  prepare_lead_hours: z.coerce.number().int().min(1).max(72),
  late_grace_minutes: z.coerce.number().int().min(5).max(1440),
  daily_ai_limit: z.coerce.number().int().min(0).max(5000),
  regen_limit: z.coerce.number().int().min(1).max(20),
  research_weekday: z.coerce.number().int().min(1).max(7),
});

export async function saveAgentSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  const parsed = settingsSchema.safeParse({
    publishing_enabled: fd.get('publishing_enabled') === 'on',
    simulate: fd.get('simulate') === 'on',
    prepare_lead_hours: fd.get('prepare_lead_hours'),
    late_grace_minutes: fd.get('late_grace_minutes'),
    daily_ai_limit: fd.get('daily_ai_limit'),
    regen_limit: fd.get('regen_limit'),
    research_weekday: fd.get('research_weekday'),
  });
  if (!parsed.success) return { status: 'error', message: 'Qiymatlarni tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  await db().from('agent_settings').update(parsed.data).eq('id', 1);
  revalidatePath('/agents', 'layout');
  return { status: 'success', message: parsed.data.simulate ? 'Saqlandi. Sinov rejimi: Instagram’ga hech narsa yuborilmaydi.' : 'Saqlandi. Haqiqiy nashr yoqilgan.' };
}

/** Bitta tugma: barcha avtomatik nashrlarni to'xtatish / yoqish. */
export async function toggleAgentPublishing(on: boolean): Promise<AgentResult> {
  await requireAgents();
  await db().from('agent_settings').update({ publishing_enabled: on }).eq('id', 1);
  revalidatePath('/agents', 'layout');
  return { ok: true, message: on ? 'Avtomatik nashrlar yoqildi.' : 'Barcha avtomatik nashrlar to‘xtatildi (tayyorlash davom etadi).' };
}
