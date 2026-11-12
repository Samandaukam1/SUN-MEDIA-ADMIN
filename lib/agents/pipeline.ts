import 'server-only';

import { randomBytes } from 'node:crypto';

import type { Json } from '@/types/database';

import { AgentAiError, AgentAiOffline, AgentLimitError, agentJson } from './ai';
import type { Frame, FrameText } from './core';
import {
  COPY_JSON_SCHEMA,
  copyPrompt,
  copySchema,
  freshFormats,
  FORMATS,
  IDEA_JSON_SCHEMA,
  ideaPrompt,
  ideaSchema,
  localCopy,
  localIdeas,
  LIMITS,
  rankIdeas,
  SYSTEM_RULES,
  briefText,
  type CopyOut,
  type Idea,
} from './creative';
import { checkContent, FIXABLE, type QaReport } from './qa';
import { renderFrame } from './render';
import { addMemory, briefOf, currentVersion, db, download, hashFor, loadSettings, memoryOf, recentOf, upload, type AgentItem, type AgentProfile } from './server';

/**
 * Koordinator: bitta material (story ketma-ketligi yoki post) uchun bosqichlarni boshqaradi.
 *   strateg  — arzon model bilan 8 ta turli formatdagi g'oya → tarix bilan solishtirib eng yaxshisi;
 *   kopirayter — sifatli model bilan kadrlar, caption, CTA;
 *   vizual    — logo, haqiqiy mahsulot fotosi, brend ranglari bilan JPEG;
 *   sifat     — faktlar, taqiqlar, boshqa profil, takrorlanish, rasmdagi matn; tuzatiladigan xatoda bir marta qayta yozadi.
 * Natija — yangi versiya. Avto-tasdiq rejimi faqat sifatdan o'tgan versiyani tasdiqlaydi.
 */

export class PipelineError extends Error {}

type Gen = { correction?: string; by?: string | null; newIdea?: boolean };

async function lease(itemId: string): Promise<AgentItem | null> {
  const until = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data } = await db()
    .from('agent_items')
    .update({ status: 'generating', lease_until: until })
    .eq('id', itemId)
    .not('status', 'in', '(generating,publishing,published,simulated,partially_published)')
    .select('*')
    .maybeSingle();
  return data;
}

async function assetsOf(profileId: string) {
  const { data } = await db().from('agent_assets').select('id, kind, storage_path, note, created_at').eq('profile_id', profileId).order('created_at', { ascending: false });
  return data ?? [];
}

/** Mahsulot fotosi: izohi g'oyaga mos keladigani, aks holda navbat bilan (sarlavha bo'yicha barqaror). */
function pickPhoto(photos: { storage_path: string; note: string | null }[], idea: Idea): string | null {
  if (!photos.length) return null;
  const text = `${idea.title} ${idea.angle} ${idea.hook}`.toLowerCase();
  const hit = photos.find((p) => (p.note ?? '').toLowerCase().split(/[\s,]+/).some((w) => w.length > 3 && text.includes(w)));
  if (hit) return hit.storage_path;
  let h = 0;
  for (const c of idea.title) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return photos[h % photos.length].storage_path;
}

function normalizeFrames(kind: 'story' | 'post', out: CopyOut, expected: number, cta: string): FrameText[] {
  const clip = (s: string, n: number) => s.trim().replace(/\s+/g, ' ').slice(0, n);
  let frames: FrameText[] = out.frames.map((f) => ({ role: f.role, headline: clip(f.headline, 90), body: clip(f.body, 260), cta: clip(f.cta, 48) }));
  if (kind === 'post') return [{ ...(frames[0] ?? { headline: '', body: '', cta: '' }), role: 'post', cta: frames[0]?.cta || cta }];
  frames = frames.slice(0, expected);
  while (frames.length < expected) frames.splice(Math.max(1, frames.length - 1), 0, { role: 'extra', headline: frames[0]?.headline ?? '', body: '', cta: '' });
  frames.forEach((f, i) => (i < frames.length - 1 ? (f.cta = '') : null));
  if (!frames.at(-1)!.cta) frames.at(-1)!.cta = cta;
  return frames;
}

async function write(profile: AgentProfile, item: AgentItem, brief: string, idea: Idea, alternatives: Idea[], correction: string | undefined, previous: { frames: FrameText[]; caption: string } | undefined, online: boolean) {
  if (!online) return { out: localCopy(briefOf(profile), item.kind as 'story' | 'post', profile.stories_per_day, idea), provider: 'local', model: 'shablon' };
  const r = await agentJson({
    stage: 'write',
    profileId: profile.id,
    purpose: `copy_${item.kind}`,
    system: SYSTEM_RULES,
    user: copyPrompt({ brief, kind: item.kind as 'story' | 'post', frames: item.kind === 'story' ? profile.stories_per_day : 1, idea, alternatives, correction, previous }),
    schema: COPY_JSON_SCHEMA as unknown as Record<string, unknown>,
  });
  const parsed = copySchema.safeParse(r.data);
  if (!parsed.success) throw new AgentAiError('AI matni kutilgan tuzilmada kelmadi — qayta uriniladi.');
  return { out: parsed.data, provider: r.provider, model: r.model };
}

async function renderAll(profile: AgentProfile, item: AgentItem, versionNo: number, idea: Idea, frames: FrameText[], photoPath: string | null, logoPath: string | null) {
  const fmt = FORMATS.find((f) => f.key === idea.format);
  const template = photoPath ? 'product' : (fmt?.template ?? 'tip');
  const [logo, photo] = await Promise.all([logoPath ? download(logoPath) : null, photoPath ? download(photoPath) : null]);
  const out: Frame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const { jpeg, warnings } = await renderFrame({
      kind: item.kind as 'story' | 'post',
      template,
      label: i === 0 ? (fmt?.name ?? null) : null,
      headline: f.headline,
      body: f.body,
      cta: f.cta,
      colors: profile.colors as Record<string, unknown>,
      brand: { name: profile.name, phone: profile.phone, telegram: profile.telegram, instagram: profile.instagram_username },
      logo,
      // Fotosurat story'da birinchi kadrda, postda yagona kadrda.
      photo: i === 0 ? photo : null,
      counter: item.kind === 'story' && frames.length > 1 ? `${i + 1}/${frames.length}` : null,
    });
    const path = `${profile.id}/${item.id}/v${versionNo}-${i + 1}-${randomBytes(4).toString('hex')}.jpg`;
    await upload(path, jpeg, 'image/jpeg');
    out.push({ ...f, template, path, warnings });
  }
  return out;
}

async function others(profileId: string) {
  const { data } = await db().from('agent_profiles').select('name, instagram_username, phone').neq('id', profileId).neq('status', 'archived');
  return (data ?? []).map((o) => ({ name: o.name, username: o.instagram_username, phone: o.phone }));
}

function qa(profile: AgentProfile, item: AgentItem, idea: Idea, frames: Frame[], caption: string, hashtags: string, notes: string[], memoryFacts: string, recent: Awaited<ReturnType<typeof recentOf>>, othersList: Awaited<ReturnType<typeof others>>): QaReport {
  return checkContent({
    kind: item.kind as 'story' | 'post',
    language: profile.language,
    framesExpected: item.kind === 'story' ? profile.stories_per_day : 1,
    frames,
    caption,
    hashtags,
    title: idea.title,
    allowedText: [profile.facts, profile.price_source, profile.advantages, profile.products, profile.phone, profile.address, memoryFacts].filter(Boolean).join('\n'),
    forbidden: profile.forbidden ?? '',
    ownPhone: profile.phone,
    others: othersList,
    recent,
    notes,
  });
}

/** Material tayyorlash (yangi yoki tuzatish bilan). Xatoda materialning o'zi tushunarli sabab bilan belgilanadi. */
export async function generateItem(itemId: string, opts: Gen = {}): Promise<{ ok: boolean; status: string; message?: string }> {
  const settings = await loadSettings();
  const { data: current } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!current) return { ok: false, status: 'missing', message: 'Material topilmadi.' };
  if (current.regen_count >= settings.regen_limit) {
    await db().from('agent_items').update({ status: 'limit_reached', last_error: `Qayta yaratish limiti (${settings.regen_limit}) tugadi. Matnni qo‘lda tahrirlang yoki limitni oshiring.` }).eq('id', itemId);
    return { ok: false, status: 'limit_reached', message: 'Qayta yaratish limiti tugadi.' };
  }
  const { data: profile } = await db().from('agent_profiles').select('*').eq('id', current.profile_id).maybeSingle();
  if (!profile || profile.status !== 'active') return { ok: false, status: current.status, message: 'Profil faol emas.' };
  const item = await lease(itemId);
  if (!item) return { ok: false, status: current.status, message: 'Material hozir band (tayyorlanmoqda yoki joylanmoqda).' };

  try {
    const [memory, recent, assets, othersList, prev] = await Promise.all([memoryOf(profile.id), recentOf(profile.id, item.id), assetsOf(profile.id), others(profile.id), currentVersion(item)]);
    const photos = assets.filter((a) => a.kind === 'product');
    const logoPath = assets.find((a) => a.kind === 'logo')?.storage_path ?? null;
    const brief = briefText(briefOf(profile), memory, photos.length > 0);
    const kind = item.kind as 'story' | 'post';
    const memoryFacts = memory.filter((m) => m.kind === 'fact').map((m) => m.content).join('\n');
    let online = true;
    let provider = 'local';
    let model = 'shablon';

    // 1) G'oya: tuzatishda avvalgisi saqlanadi; aks holda strateg tanlaydi.
    let idea: Idea;
    let candidates: (Idea & { score: number; similar: number })[] = [];
    const keep = !!opts.correction && !opts.newIdea && prev?.idea && (prev.idea as Record<string, unknown>).title;
    if (keep) {
      idea = prev!.idea as unknown as Idea;
      candidates = ((prev!.idea as Record<string, unknown>).candidates as typeof candidates) ?? [];
    } else {
      const formats = freshFormats(kind, recent.map((r) => r.format), `${profile.id}:${item.target_date}:${item.regen_count}`, 6);
      const { data: dirs } = await db().from('agent_directions').select('title, description').eq('profile_id', profile.id).eq('active', true).order('position');
      let ideas: Idea[];
      try {
        const r = await agentJson({
          stage: 'idea',
          profileId: profile.id,
          purpose: `ideas_${kind}`,
          system: SYSTEM_RULES,
          user: ideaPrompt({ brief, kind, dateKey: item.target_date, formats, directions: (dirs ?? []).map((d) => `${d.title}${d.description ? ` — ${d.description}` : ''}`), recent, count: 8 }),
          schema: IDEA_JSON_SCHEMA as unknown as Record<string, unknown>,
        });
        const parsed = ideaSchema.safeParse(r.data);
        if (!parsed.success) throw new AgentAiError('AI g‘oyalari kutilgan tuzilmada kelmadi — qayta uriniladi.');
        ideas = parsed.data.ideas;
      } catch (e) {
        if (!(e instanceof AgentAiOffline)) throw e;
        online = false;
        ideas = localIdeas(briefOf(profile), kind, formats);
      }
      candidates = rankIdeas(ideas, recent);
      idea = candidates[0];
    }

    // 2) Matn
    const previous = prev ? { frames: (prev.frames as unknown as Frame[]).map(({ role, headline, body, cta }) => ({ role, headline, body, cta })), caption: prev.caption } : undefined;
    let w;
    try {
      w = await write(profile, item, brief, idea, candidates.slice(1, 3), opts.correction, opts.correction ? previous : undefined, online);
    } catch (e) {
      if (!(e instanceof AgentAiOffline)) throw e;
      online = false;
      w = await write(profile, item, brief, idea, [], undefined, undefined, false);
    }
    provider = w.provider;
    model = w.model;
    const cta = (profile.cta ?? 'Savolingiz bo‘lsa yozing').slice(0, LIMITS.cta);
    let texts = normalizeFrames(kind, w.out, profile.stories_per_day, cta);
    let caption = w.out.caption.trim();
    let hashtags = kind === 'post' ? w.out.hashtags.map((t) => `#${t.replace(/^#/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1).slice(0, 8).join(' ') : '';
    let manual = w.out.manual_notes.trim();

    const { data: last } = await db().from('agent_versions').select('version_no').eq('item_id', item.id).order('version_no', { ascending: false }).limit(1).maybeSingle();
    const versionNo = (last?.version_no ?? 0) + 1;
    const photoPath = idea.needs_product_photo || FORMATS.find((f) => f.key === idea.format)?.template === 'product' ? pickPhoto(photos, idea) : null;
    const notes: string[] = [];
    if ((idea.needs_product_photo || idea.format === 'product') && !photoPath) notes.push('product_photo_missing');
    if (!logoPath) notes.push('no_logo');

    // 3) Rasm + 4) Sifat
    let frames = await renderAll(profile, item, versionNo, idea, texts, photoPath, logoPath);
    let report = qa(profile, item, idea, frames, caption, hashtags, notes, memoryFacts, recent, othersList);
    const fails = report.issues.filter((i) => i.level === 'fail');
    if (online && fails.length && fails.every((i) => FIXABLE.has(i.code))) {
      const fix = `Sifat tekshiruvi xatolari (hammasini tuzat): ${fails.map((i) => i.msg).join('; ')}. Matnni qisqartir, brifda yo‘q raqam va da’volarni olib tashla.`;
      const again = await write(profile, item, brief, idea, [], [opts.correction, fix].filter(Boolean).join('\n'), { frames: texts, caption }, true);
      const texts2 = normalizeFrames(kind, again.out, profile.stories_per_day, cta);
      const caption2 = again.out.caption.trim();
      const hashtags2 = kind === 'post' ? again.out.hashtags.map((t) => `#${t.replace(/^#/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1).slice(0, 8).join(' ') : '';
      const frames2 = await renderAll(profile, item, versionNo, idea, texts2, photoPath, logoPath);
      const report2 = qa(profile, item, idea, frames2, caption2, hashtags2, notes, memoryFacts, recent, othersList);
      if (report2.issues.filter((i) => i.level === 'fail').length <= fails.length) {
        texts = texts2;
        caption = caption2;
        hashtags = hashtags2;
        manual = again.out.manual_notes.trim() || manual;
        frames = frames2;
        report = { ...report2, retried: true } as QaReport;
      }
    }

    // 5) Versiya
    const ideaJson = { ...idea, candidates: candidates.slice(0, 8), provider, model };
    const content_hash = hashFor(profile, item, { caption, hashtags, frames });
    const { data: version, error } = await db()
      .from('agent_versions')
      .insert({
        item_id: item.id,
        version_no: versionNo,
        idea: ideaJson as unknown as Json,
        caption: caption.slice(0, 2200),
        hashtags: hashtags.slice(0, 600),
        frames: frames as unknown as Json,
        manual_notes: manual.slice(0, 600) || null,
        qa: report as unknown as Json,
        content_hash,
        provider,
        model,
        note: opts.correction?.slice(0, 600) ?? null,
        created_by: opts.by ?? null,
      })
      .select('id')
      .single();
    if (error || !version) throw new PipelineError('Versiyani saqlab bo‘lmadi.');

    let status: string = report.passed ? 'pending_approval' : 'qa_failed';
    if (report.passed && profile.approval_mode === 'auto') {
      await db().from('agent_approvals').insert({ item_id: item.id, version_id: version.id, content_hash, decision: 'approved', channel: 'auto' });
      status = 'approved';
    }
    await db()
      .from('agent_items')
      .update({ status, current_version_id: version.id, regen_count: item.regen_count + 1, attempts: 0, lease_until: null, last_error: report.passed ? null : 'Sifat tekshiruvidan o‘tmadi — sabablari material sahifasida.' })
      .eq('id', item.id);
    return { ok: true, status };
  } catch (e) {
    const limit = e instanceof AgentLimitError;
    const message = e instanceof Error ? e.message.slice(0, 500) : 'Noma’lum xato';
    const attempts = item.attempts + 1;
    // Vaqtinchalik xato: navbatga qaytadi (10, 20 daqiqadan keyin), 3-urinishdan keyin to'xtaydi.
    const retry = !limit && attempts < 3 && e instanceof AgentAiError;
    await db()
      .from('agent_items')
      .update({
        status: limit ? 'limit_reached' : retry ? 'queued' : 'failed',
        attempts,
        lease_until: null,
        last_error: message,
        ...(retry ? { prepare_at: new Date(Date.now() + attempts * 10 * 60_000).toISOString() } : {}),
      })
      .eq('id', item.id);
    console.error('[agents] generate failed', item.id, message);
    return { ok: false, status: limit ? 'limit_reached' : retry ? 'queued' : 'failed', message };
  }
}

/** Foydalanuvchi matnni qo'lda tahrirladi: yangi versiya, qayta render, qayta sifat tekshiruvi, qayta tasdiq. */
export async function applyEdit(itemId: string, edit: { frames: FrameText[]; caption: string; hashtags: string }, by: string): Promise<{ ok: boolean; message?: string }> {
  const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!item) return { ok: false, message: 'Material topilmadi.' };
  const { data: profile } = await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle();
  const prev = await currentVersion(item);
  if (!profile || !prev) return { ok: false, message: 'Avval material tayyorlanishi kerak.' };
  const leased = await lease(itemId);
  if (!leased) return { ok: false, message: 'Material hozir band.' };
  try {
    const [assets, memory, recent, othersList] = await Promise.all([assetsOf(profile.id), memoryOf(profile.id), recentOf(profile.id, item.id), others(profile.id)]);
    const idea = prev.idea as unknown as Idea;
    const prevFrames = prev.frames as unknown as Frame[];
    const photoPath = prevFrames[0]?.template === 'product' ? (pickPhoto(assets.filter((a) => a.kind === 'product'), idea) ?? null) : null;
    const logoPath = assets.find((a) => a.kind === 'logo')?.storage_path ?? null;
    const texts = edit.frames.map((f) => ({ role: f.role, headline: f.headline.trim().slice(0, 90), body: f.body.trim().slice(0, 260), cta: f.cta.trim().slice(0, 48) }));
    const versionNo = prev.version_no + 1;
    const frames = await renderAll(profile, leased, versionNo, idea, texts, photoPath, logoPath);
    const notes = logoPath ? [] : ['no_logo'];
    const report = qa(profile, leased, idea, frames, edit.caption, edit.hashtags, notes, memory.filter((m) => m.kind === 'fact').map((m) => m.content).join('\n'), recent, othersList);
    const content_hash = hashFor(profile, leased, { caption: edit.caption, hashtags: edit.hashtags, frames });
    const { data: v } = await db()
      .from('agent_versions')
      .insert({ item_id: item.id, version_no: versionNo, idea: prev.idea, caption: edit.caption.slice(0, 2200), hashtags: edit.hashtags.slice(0, 600), frames: frames as unknown as Json, manual_notes: prev.manual_notes, qa: report as unknown as Json, content_hash, provider: 'user', model: null, note: 'qo‘lda tahrir', created_by: by })
      .select('id')
      .single();
    // Qo'lda tahrir avto-tasdiq rejimida ham inson tasdig'ini talab qiladi.
    await db().from('agent_items').update({ status: report.passed ? 'pending_approval' : 'qa_failed', current_version_id: v?.id ?? prev.id, lease_until: null, last_error: null }).eq('id', item.id);
    return { ok: true };
  } catch (e) {
    await db().from('agent_items').update({ status: item.status, lease_until: null }).eq('id', item.id);
    return { ok: false, message: e instanceof Error ? e.message : 'Saqlab bo‘lmadi.' };
  }
}

/** Rad etish: g'oya va sabab xotiraga — keyingi g'oyalarda qaytarilmaydi. */
export async function rejectItem(item: AgentItem, by: string, reason: string) {
  const v = await currentVersion(item);
  await db().from('agent_approvals').insert({ item_id: item.id, version_id: v?.id ?? null, content_hash: v?.content_hash ?? null, decision: 'rejected', comment: reason || null, decided_by: by });
  await db().from('agent_items').update({ status: 'rejected' }).eq('id', item.id);
  if (v) await addMemory(item.profile_id, 'rejected_idea', `${String((v.idea as Record<string, unknown>).title ?? '')} — sabab: ${reason || 'ko‘rsatilmagan'}`, { item_id: item.id }, by);
}
