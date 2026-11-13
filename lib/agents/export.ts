import 'server-only';

import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { exportName, isDownloadable, KIND_LABEL, type AgentKind, type Frame } from './core';
import { SIZES } from './layout';
import type { QaReport } from './qa';
import { db, download, hashFor, notify, type AgentItem, type AgentProfile, type AgentVersion } from './server';
import { createZip, readZip } from './zip';

/**
 * Approval and export. An approval binds to one version and its content hash; every file is checked (exact size,
 * byte hash) before the approval is recorded and again before it is served. Downloads serve the stored PNG masters
 * byte for byte — the export never re-encodes or changes an approved image.
 */

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function verifyFrames(kind: string, frames: Frame[]): Promise<string | null> {
  const { w, h } = SIZES[kind === 'story' ? 'story' : 'carousel'];
  for (let i = 0; i < frames.length; i++) {
    const buf = await download(frames[i].path);
    if (!buf) return `${i + 1}-fayl topilmadi`;
    const meta = await sharp(buf).metadata().catch(() => null);
    if (!meta || meta.format !== 'png') return `${i + 1}-fayl PNG emas yoki buzilgan`;
    if (meta.width !== w || meta.height !== h) return `${i + 1}-fayl o‘lchami ${meta.width}×${meta.height} (kerak ${w}×${h})`;
    if (frames[i].sha256 && sha(buf) !== frames[i].sha256) return `${i + 1}-fayl o‘zgargan (xesh mos emas)`;
  }
  return null;
}

export async function approveItem(itemId: string, by: string): Promise<{ ok: boolean; message: string }> {
  const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!item?.current_version_id) return { ok: false, message: 'Tasdiqlanadigan versiya yo‘q.' };
  if (!['pending_approval', 'needs_fix', 'approved', 'export_ready', 'exported'].includes(item.status)) return { ok: false, message: 'Bu holatda tasdiqlab bo‘lmaydi.' };
  const [{ data: profile }, { data: v }] = await Promise.all([
    db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle(),
    db().from('agent_versions').select('*').eq('id', item.current_version_id).maybeSingle(),
  ]);
  if (!profile || !v) return { ok: false, message: 'Topilmadi.' };
  const qa = v.qa as unknown as QaReport;
  if (qa && qa.passed === false) return { ok: false, message: 'Bu versiya sifat tekshiruvidan o‘tmagan — tahrirlang yoki qayta yarating.' };
  const frames = v.frames as unknown as Frame[];
  if (frames.some((f) => !f.path.startsWith(`${profile.id}/`))) return { ok: false, message: 'Boshqa mijozning fayli aniqlandi — tasdiqlanmadi.' };
  const bad = await verifyFrames(item.kind, frames);
  if (bad) return { ok: false, message: `Fayl tekshiruvi: ${bad}` };
  const hash = hashFor(profile, item, { caption: v.caption, hashtags: v.hashtags, frames });
  await db().from('agent_approvals').insert({ item_id: item.id, version_id: v.id, content_hash: hash, decision: 'approved', channel: 'panel', decided_by: by });
  await db().from('agent_items').update({ status: 'export_ready', approved_version_id: v.id, last_error: null }).eq('id', item.id);
  return { ok: true, message: `Tasdiqlandi (${v.version_no}-versiya). Fayllarni yuklab olish mumkin.` };
}

/** The approved, current version — or why there is none to download. */
export async function approvedVersion(item: AgentItem, profile: AgentProfile): Promise<{ ok: true; version: AgentVersion; frames: Frame[] } | { ok: false; message: string }> {
  if (!isDownloadable(item.status) || !item.approved_version_id || item.approved_version_id !== item.current_version_id) return { ok: false, message: 'Faqat tasdiqlangan joriy versiyani yuklab olish mumkin.' };
  const { data: v } = await db().from('agent_versions').select('*').eq('id', item.approved_version_id).maybeSingle();
  if (!v) return { ok: false, message: 'Versiya topilmadi.' };
  const { data: appr } = await db().from('agent_approvals').select('decision, content_hash').eq('item_id', item.id).eq('version_id', v.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const frames = v.frames as unknown as Frame[];
  if (appr?.decision !== 'approved' || appr.content_hash !== hashFor(profile, item, { caption: v.caption, hashtags: v.hashtags, frames })) return { ok: false, message: 'Tasdiq bu versiyaga mos emas — qayta tasdiqlang.' };
  return { ok: true, version: v, frames };
}

export function fileName(profile: AgentProfile, item: AgentItem, index: number): string {
  return exportName({ client: profile.name, date: item.target_date, kind: item.kind as AgentKind, index, slot: item.slot });
}

/** One approved frame, byte for byte. */
export async function exportFile(item: AgentItem, profile: AgentProfile, index: number, by: string): Promise<{ ok: true; name: string; data: Buffer } | { ok: false; message: string }> {
  const a = await approvedVersion(item, profile);
  if (!a.ok) return a;
  const f = a.frames[index];
  if (!f) return { ok: false, message: 'Bunday kadr yo‘q.' };
  const bad = await verifyFrames(item.kind, [f]);
  if (bad) return { ok: false, message: bad };
  const data = (await download(f.path))!;
  const name = fileName(profile, item, index);
  await recordExport(item, a.version.id, 'file', name, data, by);
  return { ok: true, name, data };
}

/** The carousel package: ordered slides, the approved caption and short publishing notes. Verified after writing. */
export async function exportZip(item: AgentItem, profile: AgentProfile, by: string): Promise<{ ok: true; name: string; data: Buffer } | { ok: false; message: string }> {
  const a = await approvedVersion(item, profile);
  if (!a.ok) return a;
  const bad = await verifyFrames(item.kind, a.frames);
  if (bad) return { ok: false, message: bad };
  const files: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < a.frames.length; i++) files.push({ name: fileName(profile, item, i), data: (await download(a.frames[i].path))! });
  const plan = (item.plan ?? {}) as Record<string, unknown>;
  const caption = [a.version.caption, '', a.version.hashtags].join('\n').trim();
  files.push({ name: 'caption.txt', data: Buffer.from(`${caption}\n${a.version.caption_alt ? `\n--- Muqobil caption ---\n${a.version.caption_alt}\n` : ''}`, 'utf8') });
  const { w, h } = SIZES[item.kind === 'story' ? 'story' : 'carousel'];
  files.push({
    name: 'joylash.txt',
    data: Buffer.from(
      [
        `Mijoz: ${profile.name}${profile.instagram_username ? ` (@${profile.instagram_username})` : ''}`,
        `Material: ${KIND_LABEL[item.kind as AgentKind]} · ${item.target_date} · ${a.version.version_no}-versiya (tasdiqlangan)`,
        `O‘lcham: ${w}×${h} PNG, ${a.frames.length} ta fayl — fayl nomidagi tartib bilan joylang.`,
        plan.objective ? `Maqsad: ${String(plan.objective)}` : '',
        plan.concept ? `G‘oya: ${String(plan.concept)}` : '',
        '',
        'Joylash: Instagram ilovasida to‘g‘ri profilga kiring → + → Post → fayllarni tartib bilan tanlang → caption.txt matnini qo‘ying → Ulashish.',
        'Joylagandan so‘ng panelda “Qo‘lda joylandi” tugmasini bosing.',
      ]
        .filter(Boolean)
        .join('\n'),
      'utf8',
    ),
  });
  const zip = createZip(files);
  const check = readZip(zip);
  if (check.length !== files.length || check.some((x, i) => !x.crcOk || x.name !== files[i].name)) return { ok: false, message: 'ZIP paketi tekshiruvdan o‘tmadi.' };
  const name = exportName({ client: profile.name, date: item.target_date, kind: item.kind as AgentKind, zip: true });
  await recordExport(item, a.version.id, 'zip', name, zip, by);
  return { ok: true, name, data: zip };
}

async function recordExport(item: AgentItem, versionId: string, kind: 'file' | 'zip', name: string, data: Buffer, by: string) {
  await db().from('agent_exports').insert({ item_id: item.id, version_id: versionId, kind, file_name: name, bytes: data.length, sha256: sha(data), downloaded_by: by });
  if (item.status === 'export_ready' || item.status === 'approved') await db().from('agent_items').update({ status: 'exported', exported_at: new Date().toISOString() }).eq('id', item.id);
}

export async function notifyApproved(item: AgentItem, profile: AgentProfile) {
  await notify('approved', 'Kontent tasdiqlandi — yuklab olishga tayyor', `${profile.name} · ${KIND_LABEL[item.kind as AgentKind]} · ${item.target_date}`, `/agents/kontent/${item.id}`, item.id, 'low');
}
