'use server';

import { createHash, randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { z } from 'zod';

import { modelsStatus } from '@/lib/agents/ai';
import { parseDna } from '@/lib/agents/brand';
import { isEditable, normalizeColor, normalizeUsername, type Frame } from '@/lib/agents/core';
import { approveItem, notifyApproved } from '@/lib/agents/export';
import { manualTextVersion, newVersionFrom } from '@/lib/agents/pipeline';
import { addMemory, db, requireAgents, upload } from '@/lib/agents/server';
import { agencyDateKey, isDateKey } from '@/lib/time';
import type { Json } from '@/types/database';

import { fieldErrorsFrom, type ActionState } from './state';

/**
 * Agents — the manager's actions. Every one checks agents.manage first; every id is checked to belong where it says
 * (an asset to its client, a version to its item). Generation and edits only create jobs (the worker does the paid
 * work); nothing here publishes anywhere.
 */

export type AgentResult = { ok: boolean; message: string };
const isUuid = (v: string) => z.uuid().safeParse(v).success;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Ko‘pi bilan ${max} belgi`)
    .transform((v) => v || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt HH:MM ko‘rinishida');

async function kick() {
  await db()
    .rpc('agents_kick')
    .then(
      () => undefined,
      () => undefined,
    );
}

// ---------------------------------------------------------------------------------------------------------------
// Client profile (business brief + cadence)
// ---------------------------------------------------------------------------------------------------------------
const profileSchema = z.object({
  name: z.string().trim().min(1, 'Mijoz (brend) nomini yozing').max(120),
  client_id: z.string().transform((v) => (isUuid(v) ? v : null)),
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
  industry: text(80),
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
  stories_per_day: z.coerce.number().int().min(1, '1–10').max(10, '1–10'),
  carousel_enabled: z.boolean(),
  /** Each Story's own time, "09:00, 13:00, 19:00" (empty: stories_per_day from story_time, 3 hours apart). */
  story_times: z
    .string()
    .transform((v) => [...new Set(v.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean))])
    .pipe(z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt HH:MM ko‘rinishida bo‘lsin (masalan 09:00, 13:00)')).max(10, 'Ko‘pi bilan 10 ta vaqt'))
    .transform((a) => a.sort()),
  carousel_slides: z.coerce.number().int().min(2, '2–10').max(10, '2–10'),
  carousel_every_days: z.coerce.number().int().min(1, '1–14').max(14, '1–14'),
  active_weekdays: z.array(z.number().int().min(1).max(7)).min(1, 'Kamida bitta kun'),
  story_time: time,
  post_time: time,
  post_start_date: z.string().refine(isDateKey, 'Sana noto‘g‘ri'),
  research_enabled: z.boolean(),
  monthly_image_limit: z.coerce.number().int().min(0).max(10000),
  monthly_budget_usd: z.string().transform((v) => (v.trim() === '' ? null : Number(v.replace(',', '.')))).pipe(z.number().min(0).max(100000).nullable()),
  image_quality: z.enum(['low', 'medium', 'high']),
  image_tier: z.enum(['premium', 'fast']),
  cost_mode: z.enum(['economy', 'balanced', 'premium']),
  colors: z.record(z.string(), z.string()),
  brief_session_id: z.string().transform((v) => (isUuid(v) ? v : null)),
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
    client_id: s('client_id'),
    instagram_username: s('instagram'),
    industry: s('industry'),
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
    stories_per_day: s('stories_per_day') || 1,
    carousel_enabled: fd.get('carousel_enabled') === 'on',
    story_times: s('story_times'),
    carousel_slides: s('carousel_slides') || 4,
    carousel_every_days: s('carousel_every_days') || 2,
    active_weekdays: fd.getAll('weekday').map((x) => Number(x)).filter((n) => n >= 1 && n <= 7),
    story_time: s('story_time') || '10:00',
    post_time: s('post_time') || '18:00',
    post_start_date: s('post_start_date') || agencyDateKey(),
    research_enabled: fd.get('research_enabled') === 'on',
    monthly_image_limit: s('monthly_image_limit') || 120,
    monthly_budget_usd: s('monthly_budget_usd'),
    image_quality: (['low', 'medium', 'high'].includes(s('image_quality')) ? s('image_quality') : 'medium') as 'low' | 'medium' | 'high',
    image_tier: s('image_tier') === 'fast' ? 'fast' : 'premium',
    cost_mode: (['economy', 'balanced', 'premium'].includes(s('cost_mode')) ? s('cost_mode') : 'balanced') as 'economy' | 'balanced' | 'premium',
    colors,
    brief_session_id: s('brief_session_id'),
  });
}

export async function createAgentProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAgents();
  const parsed = readProfileForm(fd);
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { data, error } = await db()
    .from('agent_profiles')
    .insert({ ...parsed.data, ...(parsed.data.story_times.length ? { stories_per_day: parsed.data.story_times.length } : {}), colors: parsed.data.colors as Json, created_by: me.userId })
    .select('id')
    .single();
  if (error) return { status: 'error', message: error.code === '23505' ? 'Bu Instagram profili allaqachon qo‘shilgan.' : 'Saqlab bo‘lmadi.' };
  revalidatePath('/agents');
  redirect(`/agents/profillar/${data.id}?tab=dna`);
}

export async function updateAgentProfile(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  if (!isUuid(id)) return { status: 'error', message: 'Profil topilmadi.' };
  const parsed = readProfileForm(fd);
  if (!parsed.success) return { status: 'error', message: 'Formadagi xatolarni tuzating.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  // Story times set → the number of times is the number of Stories a day.
  const data = { ...parsed.data, ...(parsed.data.story_times.length ? { stories_per_day: parsed.data.story_times.length } : {}) };
  const { error } = await db().from('agent_profiles').update({ ...data, colors: parsed.data.colors as Json }).eq('id', id);
  if (error) return { status: 'error', message: error.code === '23505' ? 'Bu Instagram profili boshqa mijozda bor.' : 'Saqlab bo‘lmadi.' };
  // Story only: carousels planned earlier and not started are removed (generated ones stay).
  if (!parsed.data.carousel_enabled) await db().rpc('agents_drop_unstarted_carousels', { p_profile: id });
  await db().rpc('agents_plan', { p_profile: id, p_days: 3 });
  revalidatePath(`/agents/profillar/${id}`);
  return { status: 'success', message: 'Saqlandi.' };
}

export async function setAgentProfileStatus(id: string, action: 'pause' | 'resume' | 'archive' | 'stop' | 'unstop'): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(id)) return { ok: false, message: 'Topilmadi.' };
  if (action === 'pause') await db().from('agent_profiles').update({ status: 'paused', paused_at: new Date().toISOString() }).eq('id', id).eq('status', 'active');
  if (action === 'archive') await db().from('agent_profiles').update({ status: 'archived' }).eq('id', id);
  if (action === 'resume') await db().rpc('agents_resume', { p_profile: id });
  if (action === 'stop' || action === 'unstop') {
    await db().from('agent_profiles').update({ emergency_pause: action === 'stop' }).eq('id', id);
    if (action === 'stop') await db().from('agent_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString(), error: 'Favqulodda to‘xtatildi' }).eq('profile_id', id).eq('status', 'queued');
  }
  revalidatePath(`/agents/profillar/${id}`);
  revalidatePath('/agents');
  const msg = { pause: 'Pauza qilindi.', resume: 'Davom ettirildi.', archive: 'Arxivlandi.', stop: 'Favqulodda to‘xtatildi: yangi generatsiya boshlanmaydi.', unstop: 'To‘xtatish olib tashlandi.' };
  return { ok: true, message: msg[action] };
}

/** "Mijoz tahlili" → a proposed profile: only what the completed interview recorded, for the admin to confirm. */
export async function briefPrefill(sessionId: string): Promise<{ ok: true; fields: Record<string, string> } | { ok: false; message: string }> {
  await requireAgents();
  if (!isUuid(sessionId)) return { ok: false, message: 'Topilmadi.' };
  const { data: s } = await db().from('brief_sessions').select('id, status, company_hint, industry, prospect:prospects(name)').eq('id', sessionId).maybeSingle();
  if (!s || s.status !== 'completed') return { ok: false, message: 'Faqat yakunlangan tahlildan to‘ldirish mumkin.' };
  const { data: report } = await db().from('brief_reports').select('facts').eq('session_id', sessionId).order('version', { ascending: false }).limit(1).maybeSingle();
  const facts = (report?.facts ?? {}) as { profile?: Record<string, string | null>; goals?: { text: string }[]; problems?: { text: string }[]; marketing?: { text: string }[]; operations?: { text: string }[] };
  const pr = facts.profile ?? {};
  const join = (xs: { text: string }[] | undefined, n = 6) => (xs ?? []).slice(0, n).map((x) => `• ${x.text}`).join('\n');
  return {
    ok: true,
    fields: {
      name: pr.company ?? (s.prospect as { name?: string } | null)?.name ?? s.company_hint ?? '',
      industry: [pr.industry, pr.sub_industry].filter(Boolean).join(' → '),
      business: pr.offer ?? pr.description ?? '',
      audience: pr.customers ?? '',
      region: pr.geography ?? '',
      goal: join(facts.goals, 4),
      advantages: join((facts.operations ?? []).filter((o) => /tanlaydi|farq|afzal/i.test(o.text)), 3),
      instructions: [join(facts.problems, 4) && `Mijoz aytgan muammolar:\n${join(facts.problems, 4)}`, join(facts.marketing, 4) && `Marketing holati:\n${join(facts.marketing, 4)}`].filter(Boolean).join('\n\n'),
      brief_session_id: s.id,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Brand DNA
// ---------------------------------------------------------------------------------------------------------------
export async function saveBrandDna(profileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  if (!isUuid(profileId)) return { status: 'error', message: 'Topilmadi.' };
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const lines = (k: string, max: number) =>
    s(k)
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max);
  const hex = (k: string) => lines(k, 10).map((c) => normalizeColor(c)).filter((c): c is string => !!c);
  const fontId = (k: string) => (isUuid(s(k)) ? s(k) : null);
  // Font assets must be this client's own.
  const ids = [fontId('heading_font_asset'), fontId('body_font_asset')].filter((x): x is string => !!x);
  if (ids.length) {
    const { data } = await db().from('agent_assets').select('id').eq('profile_id', profileId).eq('kind', 'font').in('id', ids);
    if ((data ?? []).length !== ids.length) return { status: 'error', message: 'Shrift fayli bu mijozniki emas.' };
  }
  const dna = parseDna({
    typography: { heading: s('heading_font'), body: s('body_font'), heading_font_asset: fontId('heading_font_asset'), body_font_asset: fontId('body_font_asset') },
    accents: hex('accents'),
    gradients: lines('gradients', 6),
    forbidden_colors: hex('forbidden_colors'),
    color_tolerance: Number(s('color_tolerance')) || 12,
    style: s('style'),
    positioning: s('positioning'),
    slogans: lines('slogans', 12),
    copy_rules: s('copy_rules'),
    cta_rules: s('cta_rules'),
    disclaimers: s('disclaimers'),
    forbidden_words: lines('forbidden_words', 60),
    forbidden_design: s('forbidden_design'),
    hashtags: lines('hashtags', 30).map((t) => t.replace(/^#/, '')),
    contacts: { phones: lines('phones', 4), telegram: s('dna_telegram').replace(/^@/, ''), instagram: s('dna_instagram').replace(/^@/, ''), website: s('dna_website'), address: s('dna_address'), hours: s('hours') },
    show_contacts: s('show_contacts'),
    logo_position: s('logo_position'),
  });
  const colors: Record<string, string> = {};
  for (const k of ['primary', 'secondary', 'bg', 'text']) {
    const c = normalizeColor(s(`color_${k}`));
    if (c) colors[k] = c;
  }
  const { error } = await db()
    .from('agent_profiles')
    .update({ brand_dna: dna as unknown as Json, colors: colors as Json, tone: s('tone') || null })
    .eq('id', profileId);
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath(`/agents/profillar/${profileId}`);
  return { status: 'success', message: 'Brand DNA saqlandi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Asset library — originals are never overwritten (a replacement archives the old row)
// ---------------------------------------------------------------------------------------------------------------
const ASSET_KINDS = ['logo', 'logo_light', 'logo_dark', 'product', 'packaging', 'service', 'venue', 'people', 'illustration', 'previous_design', 'reference', 'campaign', 'typography', 'style', 'font'] as const;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** An SVG is accepted only without scripts, external references or foreign objects; it is stored as a PNG rendering. */
function safeSvg(svg: string): boolean {
  return !/<script|on\w+\s*=|<foreignObject|xlink:href\s*=\s*["']?(?!#)|href\s*=\s*["']?(?:https?:|data:|javascript:)|<!ENTITY|<iframe/i.test(svg);
}

export async function uploadAgentAsset(profileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  if (!isUuid(profileId)) return { status: 'error', message: 'Topilmadi.' };
  const { data: profile } = await db().from('agent_profiles').select('id').eq('id', profileId).maybeSingle();
  if (!profile) return { status: 'error', message: 'Mijoz topilmadi.' };
  const kind = String(fd.get('kind') ?? '');
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) return { status: 'error', message: 'Fayl turini tanlang.' };
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) return { status: 'error', message: 'Faylni tanlang.' };
  if (file.size > 2.8 * 1024 * 1024) return { status: 'error', message: 'Fayl 2,8 MB dan katta — kichraytirib yuklang.' };
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type;
  let ext = '';
  let width = 0;
  let height = 0;
  let hasAlpha: boolean | null = null;
  const lower = file.name.toLowerCase();
  if (kind === 'font') {
    const head = buf.subarray(0, 4).toString('hex');
    // TrueType (00010000 / 'true') or OpenType ('OTTO'); WOFF is not supported by the renderer.
    if (!['00010000', '74727565', '4f54544f'].includes(head)) return { status: 'error', message: 'Faqat TTF yoki OTF shrift.' };
    mime = head === '4f54544f' ? 'font/otf' : 'font/ttf';
    ext = mime === 'font/otf' ? 'otf' : 'ttf';
  } else {
    if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
      const svg = buf.toString('utf8');
      if (!safeSvg(svg)) return { status: 'error', message: 'SVG faylda xavfli element bor (skript yoki tashqi havola) — PNG yuklang.' };
      try {
        buf = await sharp(Buffer.from(svg), { density: 300 }).png().toBuffer();
      } catch {
        return { status: 'error', message: 'SVG o‘qilmadi — PNG yuklang.' };
      }
      mime = 'image/png';
    }
    if (!IMAGE_TYPES.has(mime)) return { status: 'error', message: 'Faqat PNG, JPEG, WebP yoki xavfsiz SVG.' };
    try {
      const meta = await sharp(buf, { failOn: 'error' }).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      hasAlpha = !!meta.hasAlpha;
    } catch {
      return { status: 'error', message: 'Rasm o‘qilmadi yoki buzilgan.' };
    }
    if (width < 64 || height < 64) return { status: 'error', message: 'Rasm juda kichik.' };
    ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  }
  const replaces = String(fd.get('replaces') ?? '');
  let version = 1;
  if (isUuid(replaces)) {
    const { data: old } = await db().from('agent_assets').select('id, version, profile_id').eq('id', replaces).maybeSingle();
    if (!old || old.profile_id !== profileId) return { status: 'error', message: 'Almashtiriladigan fayl bu mijozniki emas.' };
    version = old.version + 1;
  }
  const path = `${profileId}/assets/${kind}-${randomBytes(6).toString('hex')}.${ext}`;
  await upload(path, buf, mime);
  const str = (k: string, n: number) => String(fd.get(k) ?? '').trim().slice(0, n) || null;
  const { data: row, error } = await db()
    .from('agent_assets')
    .insert({
      profile_id: profileId,
      kind,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime,
      width,
      height,
      has_alpha: hasAlpha,
      title: str('title', 160),
      product_name: str('product_name', 160),
      note: str('note', 300),
      source: str('source', 300),
      version,
      tags: String(fd.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
      sha256: createHash('sha256').update(buf).digest('hex'),
    })
    .select('id')
    .single();
  if (error || !row) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  if (isUuid(replaces)) await db().from('agent_assets').update({ archived_at: new Date().toISOString(), replaced_by: row.id }).eq('id', replaces).eq('profile_id', profileId);
  revalidatePath(`/agents/profillar/${profileId}`);
  return { status: 'success', message: kind === 'logo' && hasAlpha === false ? 'Yuklandi. Eslatma: logoda shaffof fon yo‘q — iloji bo‘lsa shaffof PNG yuklang.' : 'Yuklandi.' };
}

export async function archiveAgentAsset(assetId: string, restore = false): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(assetId)) return { ok: false, message: 'Topilmadi.' };
  await db().from('agent_assets').update({ archived_at: restore ? null : new Date().toISOString() }).eq('id', assetId);
  revalidatePath('/agents/profillar', 'layout');
  return { ok: true, message: restore ? 'Qaytarildi.' : 'Arxivlandi (fayl o‘chirilmadi).' };
}

// ---------------------------------------------------------------------------------------------------------------
// Campaigns, memory
// ---------------------------------------------------------------------------------------------------------------
export async function saveCampaign(profileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAgents();
  if (!isUuid(profileId)) return { status: 'error', message: 'Topilmadi.' };
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const title = s('title').slice(0, 160);
  if (!title) return { status: 'error', message: 'Kampaniya nomini yozing.' };
  const starts = isDateKey(s('starts_on')) ? s('starts_on') : null;
  const ends = isDateKey(s('ends_on')) ? s('ends_on') : null;
  if (starts && ends && ends < starts) return { status: 'error', message: 'Tugash sanasi boshlanishidan oldin.' };
  const { error } = await db().from('agent_campaigns').insert({ profile_id: profileId, title, terms: s('terms').slice(0, 3000) || null, starts_on: starts, ends_on: ends, priority: Math.min(10, Math.max(0, Number(s('priority')) || 0)), created_by: me.userId });
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath(`/agents/profillar/${profileId}`);
  return { status: 'success', message: 'Kampaniya qo‘shildi.' };
}

export async function toggleCampaign(id: string, active: boolean): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(id)) return { ok: false, message: 'Topilmadi.' };
  await db().from('agent_campaigns').update({ active }).eq('id', id);
  revalidatePath('/agents/profillar', 'layout');
  return { ok: true, message: active ? 'Yoqildi.' : 'O‘chirildi.' };
}

export async function addAgentMemory(profileId: string, kind: string, content: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(profileId) || !['brand_rule', 'preference', 'fact', 'plan'].includes(kind) || !content.trim()) return { ok: false, message: 'Matnni yozing.' };
  await addMemory(profileId, kind, content, {}, me.userId);
  revalidatePath(`/agents/profillar/${profileId}`);
  return { ok: true, message: 'Saqlandi.' };
}

export async function deactivateAgentMemory(id: string): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(id)) return { ok: false, message: 'Topilmadi.' };
  await db().from('agent_memory').update({ active: false }).eq('id', id);
  revalidatePath('/agents/profillar', 'layout');
  return { ok: true, message: 'O‘chirildi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Content: run now, regenerate, edit, approve, reject, versions
// ---------------------------------------------------------------------------------------------------------------
async function activeJob(itemId: string) {
  const { data } = await db().from('agent_jobs').select('id').eq('item_id', itemId).in('status', ['queued', 'running']).limit(1).maybeSingle();
  return !!data;
}

/** "Hozir yaratish": a new slot for today (the next free one) and a job at the front of the queue. */
export async function generateAgentNow(profileId: string, kind: 'story' | 'carousel'): Promise<AgentResult & { itemId?: string }> {
  const me = await requireAgents();
  if (!isUuid(profileId) || !['story', 'carousel'].includes(kind)) return { ok: false, message: 'Topilmadi.' };
  const { data: p } = await db().from('agent_profiles').select('id, status, emergency_pause, carousel_enabled').eq('id', profileId).maybeSingle();
  if (!p || p.status === 'archived') return { ok: false, message: 'Mijoz topilmadi.' };
  if (kind === 'carousel' && !p.carousel_enabled) return { ok: false, message: 'Bu mijoz uchun faqat Story (karusel sozlamada o‘chirilgan).' };
  if (p.emergency_pause) return { ok: false, message: 'Bu mijoz uchun favqulodda to‘xtatish yoqilgan.' };
  const today = agencyDateKey();
  const { data: rows } = await db().from('agent_items').select('slot').eq('profile_id', profileId).eq('kind', kind).eq('target_date', today);
  const slot = Math.max(0, ...(rows ?? []).map((r) => r.slot)) + 1;
  if (slot > 10) return { ok: false, message: 'Bugun uchun slotlar tugadi.' };
  const at = new Date(Date.now() + 2 * 3600_000).toISOString();
  const { data: item, error } = await db().from('agent_items').insert({ profile_id: profileId, kind, target_date: today, slot, scheduled_at: at, prepare_at: new Date().toISOString(), status: 'generating' }).select('id').single();
  if (error || !item) return { ok: false, message: 'Yaratib bo‘lmadi.' };
  await db().from('agent_jobs').insert({ item_id: item.id, profile_id: profileId, kind: 'generate', priority: 5, idempotency_key: `generate:${item.id}:0`, created_by: me.userId });
  await kick();
  revalidatePath('/agents');
  return { ok: true, message: 'Navbatga qo‘yildi — 2–5 daqiqada tayyor bo‘ladi.', itemId: item.id };
}

export async function regenerateAgentItem(itemId: string, instruction = ''): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('id, profile_id, status, regen_count').eq('id', itemId).maybeSingle();
  if (!item || !isEditable(item.status)) return { ok: false, message: 'Bu holatda qayta yaratib bo‘lmaydi.' };
  if (await activeJob(itemId)) return { ok: false, message: 'Bu material ustida ish allaqachon navbatda.' };
  const s = await db().from('agent_settings').select('revision_warn').eq('id', 1).maybeSingle();
  const { error } = await db()
    .from('agent_jobs')
    .insert({ item_id: itemId, profile_id: item.profile_id, kind: 'regenerate', priority: 4, payload: { instruction: instruction.trim().slice(0, 1500) } as Json, idempotency_key: `regenerate:${itemId}:${item.regen_count + 1}:${randomBytes(3).toString('hex')}`, created_by: me.userId });
  if (error) return { ok: false, message: 'Navbatga qo‘yib bo‘lmadi.' };
  await db().from('agent_items').update({ status: 'regenerating' }).eq('id', itemId);
  await kick();
  revalidatePath(`/agents/kontent/${itemId}`);
  const warn = item.regen_count + 1 >= (s.data?.revision_warn ?? 5) ? ` Diqqat: bu ${item.regen_count + 1}-qayta yaratish.` : '';
  return { ok: true, message: `Yangi variant yaratilmoqda.${warn}` };
}

/** A natural-language edit (optionally limited to chosen slides). The current version stays until the new one exists. */
export async function editAgentItem(itemId: string, instruction: string, slides: number[]): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const ins = instruction.trim().slice(0, 1500);
  if (ins.length < 3) return { ok: false, message: 'Nimani o‘zgartirish kerakligini yozing.' };
  const { data: item } = await db().from('agent_items').select('id, profile_id, status, current_version_id').eq('id', itemId).maybeSingle();
  if (!item?.current_version_id || !isEditable(item.status)) return { ok: false, message: 'Tahrirlanadigan versiya yo‘q.' };
  if (await activeJob(itemId)) return { ok: false, message: 'Bu material ustida ish allaqachon navbatda.' };
  const { error } = await db()
    .from('agent_jobs')
    .insert({ item_id: itemId, profile_id: item.profile_id, kind: 'edit', priority: 6, payload: { instruction: ins, slides: slides.filter((n) => Number.isInteger(n) && n >= 0 && n < 10) } as Json, idempotency_key: `edit:${itemId}:${randomBytes(6).toString('hex')}`, created_by: me.userId });
  if (error) return { ok: false, message: 'Navbatga qo‘yib bo‘lmadi.' };
  await db().from('agent_items').update({ status: 'needs_fix' }).eq('id', itemId);
  await db().from('agent_review_comments').insert({ item_id: itemId, version_id: item.current_version_id, body: `Tahrir: ${ins}`, author: me.userId });
  await kick();
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Tahrir navbatga qo‘yildi — yangi versiya tayyor bo‘lgach qayta tasdiqlanadi.' };
}

export async function approveAgentItem(itemId: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const r = await approveItem(itemId, me.userId);
  if (r.ok) {
    const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
    const { data: profile } = item ? await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle() : { data: null };
    if (item && profile) await notifyApproved(item, profile);
  }
  revalidatePath(`/agents/kontent/${itemId}`);
  revalidatePath('/agents');
  return r;
}

export async function rejectAgentItem(itemId: string, reason: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('id, profile_id, current_version_id, status').eq('id', itemId).maybeSingle();
  if (!item || !isEditable(item.status)) return { ok: false, message: 'Bu holatda rad etib bo‘lmaydi.' };
  await db().from('agent_approvals').insert({ item_id: itemId, version_id: item.current_version_id, decision: 'rejected', comment: reason.slice(0, 2000) || null, channel: 'panel', decided_by: me.userId });
  await db().from('agent_items').update({ status: 'rejected' }).eq('id', itemId);
  if (reason.trim() && item.current_version_id) {
    const { data: v } = await db().from('agent_versions').select('idea').eq('id', item.current_version_id).maybeSingle();
    await addMemory(item.profile_id, 'rejected_idea', `${String((v?.idea as { title?: string })?.title ?? '')} — sabab: ${reason}`.slice(0, 600), { item_id: itemId }, me.userId);
  }
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Rad etildi (g‘oya xotiraga yozildi — takrorlanmaydi).' };
}

export async function restoreAgentVersion(itemId: string, versionId: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId) || !isUuid(versionId)) return { ok: false, message: 'Topilmadi.' };
  const { data: v } = await db().from('agent_versions').select('*').eq('id', versionId).eq('item_id', itemId).maybeSingle();
  if (!v) return { ok: false, message: 'Versiya topilmadi.' };
  if (await activeJob(itemId)) return { ok: false, message: 'Avval navbatdagi ish tugasin.' };
  const r = await newVersionFrom(itemId, { from: v, frames: v.frames as unknown as Frame[], change: 'restore', instruction: `${v.version_no}-versiya qaytarildi`, by: me.userId });
  revalidatePath(`/agents/kontent/${itemId}`);
  return r;
}

export async function reorderAgentSlides(itemId: string, order: number[]): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('id, kind, current_version_id, status').eq('id', itemId).maybeSingle();
  if (!item?.current_version_id || item.kind === 'story' || !isEditable(item.status)) return { ok: false, message: 'Tartibni o‘zgartirib bo‘lmaydi.' };
  const { data: v } = await db().from('agent_versions').select('*').eq('id', item.current_version_id).maybeSingle();
  const frames = (v?.frames ?? []) as unknown as Frame[];
  if (!v || order.length !== frames.length || [...order].sort((a, b) => a - b).some((x, i) => x !== i)) return { ok: false, message: 'Tartib noto‘g‘ri.' };
  if (order.every((x, i) => x === i)) return { ok: false, message: 'Tartib o‘zgarmadi.' };
  // CTA stays on the last slide.
  const next = order.map((i) => ({ ...frames[i] }));
  const r = await newVersionFrom(itemId, { from: v, frames: next, change: 'reorder', instruction: `Slaydlar tartibi: ${order.map((i) => i + 1).join(', ')}`, by: me.userId });
  revalidatePath(`/agents/kontent/${itemId}`);
  return r;
}

const manualSchema = z.object({
  frames: z.array(z.object({ headline: z.string().trim().min(1).max(90), body: z.string().trim().max(260), cta: z.string().trim().max(48) })).max(10),
  caption: z.string().trim().max(2200),
  hashtags: z.string().trim().max(600),
});

export async function manualAgentText(itemId: string, raw: unknown): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const parsed = manualSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Matnlarni tekshiring (sarlavha bo‘sh bo‘lmasin).' };
  if (await activeJob(itemId)) return { ok: false, message: 'Avval navbatdagi ish tugasin.' };
  const r = await manualTextVersion(itemId, parsed.data, me.userId);
  revalidatePath(`/agents/kontent/${itemId}`);
  return r;
}

export async function commentAgentItem(itemId: string, body: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId) || !body.trim()) return { ok: false, message: 'Izoh yozing.' };
  const { data: item } = await db().from('agent_items').select('current_version_id').eq('id', itemId).maybeSingle();
  await db().from('agent_review_comments').insert({ item_id: itemId, version_id: item?.current_version_id ?? null, body: body.trim().slice(0, 2000), author: me.userId });
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Izoh saqlandi.' };
}

export async function markPublishedManually(itemId: string, note: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('status, approved_version_id, current_version_id').eq('id', itemId).maybeSingle();
  if (!item || !['export_ready', 'exported', 'approved'].includes(item.status) || item.approved_version_id !== item.current_version_id) return { ok: false, message: 'Faqat tasdiqlangan materialni joylangan deb belgilash mumkin.' };
  await db().from('agent_items').update({ status: 'published_manual', published_manually_at: new Date().toISOString(), published_by: me.userId, publish_note: note.trim().slice(0, 600) || null }).eq('id', itemId);
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Qo‘lda joylangan deb belgilandi.' };
}

export async function rescheduleAgentItem(itemId: string, dateKey: string, hhmm: string): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(itemId) || !isDateKey(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return { ok: false, message: 'Sana yoki vaqt noto‘g‘ri.' };
  const at = new Date(`${dateKey}T${hhmm}:00+05:00`);
  if (at.getTime() < Date.now()) return { ok: false, message: 'O‘tgan vaqtga qo‘yib bo‘lmaydi.' };
  const { data: item } = await db().from('agent_items').select('status, current_version_id').eq('id', itemId).maybeSingle();
  if (!item || !isEditable(item.status)) return { ok: false, message: 'Bu holatda o‘zgartirib bo‘lmaydi.' };
  await db()
    .from('agent_items')
    .update({ scheduled_at: at.toISOString(), status: item.status === 'needs_reschedule' ? (item.current_version_id ? 'pending_approval' : 'queued') : item.status })
    .eq('id', itemId);
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Vaqt o‘zgartirildi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------------------------
export async function retryAgentJob(jobId: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(jobId)) return { ok: false, message: 'Topilmadi.' };
  const { data: j } = await db().from('agent_jobs').select('*').eq('id', jobId).maybeSingle();
  if (!j || !['failed', 'cancelled'].includes(j.status)) return { ok: false, message: 'Faqat xato yoki bekor qilingan ishni qayta boshlash mumkin.' };
  if (j.item_id && (await activeJob(j.item_id))) return { ok: false, message: 'Bu material ustida boshqa ish bor.' };
  // A new job (the old one stays in the history); finished backgrounds in its payload are reused.
  const payload = { ...((j.payload ?? {}) as Record<string, unknown>), failures: 0 };
  await db().from('agent_jobs').insert({ item_id: j.item_id, profile_id: j.profile_id, kind: j.kind, priority: 5, payload: payload as Json, idempotency_key: `${j.kind}:retry:${j.id}:${randomBytes(3).toString('hex')}`, created_by: me.userId });
  if (j.item_id) await db().from('agent_items').update({ status: 'generating', last_error: null }).eq('id', j.item_id).in('status', ['failed', 'limit_reached', 'queued']);
  await kick();
  revalidatePath('/agents/generatsiya');
  return { ok: true, message: 'Qayta navbatga qo‘yildi.' };
}

/**
 * The admin's explicit "make it anyway" for ONE post that a per-post or per-job cost limit stopped (the estimate was
 * shown in its error). Covers the next run only (the pipeline clears it); monthly and daily money caps still apply.
 */
export async function allowAgentOverBudget(itemId: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { ok: false, message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('id, status, last_error, current_version_id').eq('id', itemId).maybeSingle();
  if (!item || item.status !== 'limit_reached') return { ok: false, message: 'Bu material limit sababli to‘xtamagan.' };
  if (await activeJob(itemId)) return { ok: false, message: 'Bu material ustida ish allaqachon bor.' };
  const { data: j } = await db().from('agent_jobs').select('*').eq('item_id', itemId).in('status', ['failed', 'cancelled']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!j) return { ok: false, message: 'Qayta boshlanadigan ish topilmadi.' };
  await db().from('agent_items').update({ allow_over_budget: true, status: 'generating', last_error: null }).eq('id', itemId);
  const payload = { ...((j.payload ?? {}) as Record<string, unknown>), failures: 0 };
  await db().from('agent_jobs').insert({ item_id: j.item_id, profile_id: j.profile_id, kind: j.kind, priority: 6, payload: payload as Json, idempotency_key: `${j.kind}:over:${j.id}:${randomBytes(3).toString('hex')}`, created_by: me.userId });
  await db().from('agent_review_comments').insert({ item_id: itemId, version_id: item.current_version_id, body: `Limitdan oshishga ruxsat berildi (${(item.last_error ?? '').slice(0, 300)})`, author: me.userId });
  await kick();
  revalidatePath(`/agents/kontent/${itemId}`);
  return { ok: true, message: 'Ruxsat berildi — bitta ish uchun navbatga qo‘yildi.' };
}

export async function cancelAgentJob(jobId: string): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(jobId)) return { ok: false, message: 'Topilmadi.' };
  const { data } = await db().from('agent_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString(), error: 'Admin bekor qildi' }).eq('id', jobId).eq('status', 'queued').select('item_id').maybeSingle();
  if (!data) return { ok: false, message: 'Faqat navbatdagi (boshlanmagan) ishni bekor qilish mumkin.' };
  if (data.item_id) {
    const { data: it } = await db().from('agent_items').select('current_version_id').eq('id', data.item_id).maybeSingle();
    await db().from('agent_items').update({ status: it?.current_version_id ? 'pending_approval' : 'skipped' }).eq('id', data.item_id).in('status', ['generating', 'regenerating', 'needs_fix', 'queued']);
  }
  revalidatePath('/agents/generatsiya');
  return { ok: true, message: 'Bekor qilindi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------------------------------------------
export async function runAgentResearch(profileId: string): Promise<AgentResult> {
  const me = await requireAgents();
  if (!isUuid(profileId)) return { ok: false, message: 'Topilmadi.' };
  const { error } = await db().from('agent_jobs').insert({ profile_id: profileId, kind: 'research', priority: 3, max_attempts: 3, idempotency_key: `research:${profileId}:manual:${randomBytes(4).toString('hex')}`, created_by: me.userId });
  if (error) return { ok: false, message: 'Navbatga qo‘yib bo‘lmadi.' };
  await kick();
  return { ok: true, message: 'Trend tadqiqoti navbatga qo‘yildi (bir necha daqiqa).' };
}

export async function addAgentTrend(profileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAgents();
  if (!isUuid(profileId)) return { status: 'error', message: 'Topilmadi.' };
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const url = s('url');
  let host: string | null = null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    host = u.hostname.replace(/^www\./, '');
  } catch {
    return { status: 'error', message: 'Havola noto‘g‘ri (https://…).' };
  }
  const title = s('title').slice(0, 200);
  if (!title) return { status: 'error', message: 'Qisqa sarlavha yozing.' };
  const { error } = await db()
    .from('agent_trends')
    .insert({ profile_id: profileId, title, source_url: url.slice(0, 1000), source_platform: host, adaptation: s('adaptation').slice(0, 1000) || null, why: s('why').slice(0, 1000) || null, freshness: 'unknown', origin: 'admin', verified: false, created_by: me.userId });
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath('/agents/trendlar');
  return { status: 'success', message: 'Trend qo‘shildi (admin manbasi).' };
}

export async function dismissAgentTrend(id: string): Promise<AgentResult> {
  await requireAgents();
  if (!isUuid(id)) return { ok: false, message: 'Topilmadi.' };
  await db().from('agent_trends').update({ status: 'dismissed' }).eq('id', id);
  revalidatePath('/agents/trendlar');
  return { ok: true, message: 'Chetga olindi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Performance (manual, verified numbers only)
// ---------------------------------------------------------------------------------------------------------------
const metric = z.string().transform((v) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '')))).pipe(z.number().int().min(0).max(1_000_000_000).nullable());

export async function addAgentMetrics(itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAgents();
  if (!isUuid(itemId)) return { status: 'error', message: 'Topilmadi.' };
  const { data: item } = await db().from('agent_items').select('id, profile_id').eq('id', itemId).maybeSingle();
  if (!item) return { status: 'error', message: 'Topilmadi.' };
  const s = (k: string) => String(fd.get(k) ?? '');
  const parsed = z
    .object({ reach: metric, impressions: metric, views: metric, likes: metric, comments: metric, shares: metric, saves: metric, profile_visits: metric, website_clicks: metric, leads: metric, sales: metric })
    .safeParse(Object.fromEntries(['reach', 'impressions', 'views', 'likes', 'comments', 'shares', 'saves', 'profile_visits', 'website_clicks', 'leads', 'sales'].map((k) => [k, s(k)])));
  if (!parsed.success) return { status: 'error', message: 'Faqat butun sonlar (bo‘sh qoldirish mumkin).' };
  if (Object.values(parsed.data).every((v) => v === null)) return { status: 'error', message: 'Kamida bitta ko‘rsatkich kiriting.' };
  const source = ['instagram_insights', 'meta_business', 'crm', 'manual_other'].includes(s('source')) ? s('source') : 'instagram_insights';
  await db()
    .from('agent_metrics')
    .insert({ item_id: itemId, profile_id: item.profile_id, ...parsed.data, source, period_start: isDateKey(s('period_start')) ? s('period_start') : null, period_end: isDateKey(s('period_end')) ? s('period_end') : null, note: s('note').slice(0, 600) || null, entered_by: me.userId });
  revalidatePath(`/agents/kontent/${itemId}`);
  revalidatePath('/agents/tahlil');
  return { status: 'success', message: 'Natija saqlandi.' };
}

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------
export async function saveAgentSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAgents();
  const n = (k: string, lo: number, hi: number, def: number) => Math.min(hi, Math.max(lo, Number(fd.get(k) ?? def) || def));
  const budget = String(fd.get('monthly_budget_usd') ?? '').trim();
  const money = (k: string) => {
    const v = String(fd.get(k) ?? '').trim();
    return v === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0);
  };
  const { error } = await db()
    .from('agent_settings')
    .update({
      automation_enabled: fd.get('automation_enabled') === 'on',
      prepare_lead_hours: n('prepare_lead_hours', 1, 72, 20),
      late_grace_minutes: n('late_grace_minutes', 5, 1440, 90),
      daily_ai_limit: n('daily_ai_limit', 0, 5000, 150),
      daily_image_limit: n('daily_image_limit', 0, 10000, 80),
      monthly_image_limit: n('monthly_image_limit', 0, 100000, 600),
      monthly_budget_usd: budget === '' ? null : Math.max(0, Number(budget.replace(',', '.')) || 0),
      revision_warn: n('revision_warn', 1, 100, 5),
      research_weekday: n('research_weekday', 1, 7, 1),
      story_safe_top: n('story_safe_top', 0, 600, 250),
      story_safe_bottom: n('story_safe_bottom', 0, 700, 340),
      max_images_per_item: n('max_images_per_item', 1, 100, 8),
      max_job_cost_usd: money('max_job_cost_usd'),
      daily_budget_usd: money('daily_budget_usd'),
    })
    .eq('id', 1);
  if (error) return { status: 'error', message: 'Saqlab bo‘lmadi.' };
  revalidatePath('/agents', 'layout');
  return { status: 'success', message: 'Sozlamalar saqlandi.' };
}

export async function checkAgentModels() {
  await requireAgents();
  return modelsStatus();
}
