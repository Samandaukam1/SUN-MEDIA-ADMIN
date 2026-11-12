import 'server-only';

import { refreshLongLived } from '@/lib/instagram/api';
import { igConfig } from '@/lib/instagram/server';
import type { Json } from '@/types/database';

import type { Frame } from './core';
import { containerStatus, createContainer, mediaInsights, MAX_ATTEMPTS, publishContainer, retryDelayMin, shouldStop } from './instagram';
import { currentVersion, db, hashFor, isApproved, loadSettings, signed, type AgentConnection, type AgentItem, type AgentProfile, type AgentSettings } from './server';

/**
 * Nashr va tahlil agenti.
 *  - Faqat joriy versiya joriy holatda tasdiqlangan bo'lsa chiqaradi (tasdiqsiz hech narsa chiqmaydi).
 *  - Har kadr alohida urinish yozuvi, kaliti "<versiya>:<kadr>": qayta urinishda chiqqan kadr qayta yuborilmaydi.
 *  - Natijasi noma'lum so'rovdan keyin avval konteyner holati tekshiriladi (PUBLISHED bo'lsa qayta yuborilmaydi).
 *  - Token/ruxsat xatosida to'xtaydi (qayta ulash kerak); vaqtinchalik xatoda ko'pi bilan 3 marta, oraliq bilan.
 *  - Sinov rejimida (agent_settings.simulate) Instagram'ga hech narsa yuborilmaydi — holat "Sinov nashri".
 */

export type Readiness = { ok: boolean; reason: string; simulate: boolean };

export async function connectionOf(profileId: string): Promise<AgentConnection | null> {
  const { data } = await db().from('agent_ig_connections').select('*').eq('profile_id', profileId).maybeSingle();
  return data;
}

export async function readiness(item: AgentItem, profile: AgentProfile, settings?: AgentSettings): Promise<Readiness> {
  const s = settings ?? (await loadSettings());
  if (!(await isApproved(item, profile))) return { ok: false, reason: 'Joriy versiya tasdiqlanmagan (yoki tasdiqdan keyin o‘zgargan).', simulate: s.simulate };
  if (profile.status !== 'active') return { ok: false, reason: 'Profil faol emas (pauza yoki arxiv).', simulate: s.simulate };
  if (s.simulate) return { ok: true, reason: 'Sinov rejimi: Instagram’ga yuborilmaydi.', simulate: true };
  const conn = await connectionOf(profile.id);
  if (!conn || conn.status === 'disconnected') return { ok: false, reason: 'Instagram ulanmagan — rasm va matnni yuklab olib qo‘lda joylang.', simulate: false };
  if (conn.status === 'reauth') return { ok: false, reason: 'Instagram ruxsati bekor qilingan yoki muddati tugagan — qayta ulang.', simulate: false };
  if (!conn.permissions.includes('instagram_business_content_publish')) return { ok: false, reason: 'Nashr ruxsati (instagram_business_content_publish) berilmagan — qayta ulang.', simulate: false };
  if (profile.instagram_username && conn.username && conn.username !== profile.instagram_username)
    return { ok: false, reason: `Ulangan hisob @${conn.username}, profil esa @${profile.instagram_username} — mos emas.`, simulate: false };
  return { ok: true, reason: '', simulate: false };
}

async function tokenOf(connectionId: string): Promise<string | null> {
  const { data } = await db().rpc('agent_ig_token_read', { p_connection: connectionId });
  return typeof data === 'string' && data ? data : null;
}

/** Bitta materialni chiqarish. `manual` — "Hozir joylash" tugmasi (avto-nashr o'chiq bo'lsa ham, tasdiq baribir shart). */
export async function publishItem(itemId: string, opts: { manual?: boolean } = {}): Promise<{ ok: boolean; status: string; message: string }> {
  const settings = await loadSettings();
  const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!item) return { ok: false, status: 'missing', message: 'Material topilmadi.' };
  const { data: profile } = await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle();
  if (!profile) return { ok: false, status: item.status, message: 'Profil topilmadi.' };
  if (!opts.manual && !settings.publishing_enabled) return { ok: false, status: item.status, message: 'Avtomatik nashrlar to‘xtatilgan.' };
  const ready = await readiness(item, profile, settings);
  if (!ready.ok) {
    await db().from('agent_items').update({ last_error: ready.reason.slice(0, 600) }).eq('id', item.id);
    return { ok: false, status: item.status, message: ready.reason };
  }
  // Lease: bir vaqtda ikki jarayon bir materialni chiqarmasin.
  const { data: leased } = await db()
    .from('agent_items')
    .update({ status: 'publishing', lease_until: new Date(Date.now() + 4 * 60_000).toISOString() })
    .eq('id', item.id)
    .in('status', ['approved', 'partially_published', 'publishing'])
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .select('*')
    .maybeSingle();
  if (!leased) return { ok: false, status: item.status, message: 'Material hozir boshqa jarayonda.' };

  const version = (await currentVersion(leased))!;
  const frames = (version.frames as unknown as Frame[]).slice(0, item.kind === 'post' ? 1 : 10);
  const conn = ready.simulate ? null : await connectionOf(profile.id);
  const token = conn ? await tokenOf(conn.id) : null;
  if (!ready.simulate && (!conn || !token)) {
    await db().from('agent_items').update({ status: 'failed', lease_until: null, last_error: 'Instagram tokeni topilmadi — qayta ulang.' }).eq('id', item.id);
    return { ok: false, status: 'failed', message: 'Instagram tokeni topilmadi — qayta ulang.' };
  }
  const version_ = igConfig().version;
  const urls = ready.simulate ? {} : await signed(frames.map((f) => f.path), 3600);
  const caption = item.kind === 'post' ? [version.caption, version.hashtags].filter(Boolean).join('\n\n').slice(0, 2200) : null;

  let done = 0;
  let stopped: string | null = null;
  let waiting = false;
  for (let i = 0; i < frames.length; i++) {
    const key = `${version.id}:${i}`;
    let { data: att } = await db().from('agent_publish_attempts').select('*').eq('idempotency_key', key).maybeSingle();
    if (!att) {
      const ins = await db()
        .from('agent_publish_attempts')
        .insert({ item_id: item.id, version_id: version.id, profile_id: profile.id, frame_index: i, idempotency_key: key, ig_user_id: conn?.ig_user_id ?? null })
        .select('*')
        .single();
      att = ins.data;
    }
    if (!att) continue;
    if (att.status === 'published' || att.status === 'simulated') {
      done++;
      continue;
    }
    if (stopped) break;
    if (att.error_kind && att.attempts >= MAX_ATTEMPTS) {
      stopped = att.error ?? 'Urinishlar tugadi.';
      break;
    }
    if (ready.simulate) {
      await db().from('agent_publish_attempts').update({ status: 'simulated', media_id: `SIM-${att.id.slice(0, 8)}`, error: null, error_kind: null }).eq('id', att.id);
      done++;
      continue;
    }
    const fail = async (kind: string, message: string) => {
      await db().from('agent_publish_attempts').update({ status: shouldStop(kind) ? 'failed' : att!.status === 'unknown' ? 'unknown' : att!.container_id ? 'container_created' : 'pending', error: message.slice(0, 600), error_kind: kind as never, attempts: att!.attempts + 1 }).eq('id', att!.id);
      if (kind === 'auth' || kind === 'permission') await db().from('agent_ig_connections').update({ status: 'reauth', last_error: message.slice(0, 500), last_error_at: new Date().toISOString() }).eq('id', conn!.id);
      if (shouldStop(kind) || att!.attempts + 1 >= MAX_ATTEMPTS) stopped = message;
      else waiting = true;
    };

    // Avvalgi urinishning natijasi noma'lum bo'lsa — avval konteyner holati.
    let containerId = att.container_id;
    if (containerId) {
      const st = await containerStatus(fetch, { token: token!, containerId, version: version_ });
      if (!st.ok) {
        await fail(st.kind, st.message);
        break;
      }
      if (st.value === 'PUBLISHED') {
        await db().from('agent_publish_attempts').update({ status: 'published', error: null, error_kind: null }).eq('id', att.id);
        done++;
        continue;
      }
      if (st.value === 'ERROR' || st.value === 'EXPIRED') containerId = null;
    }
    if (!containerId) {
      const url = urls[frames[i].path];
      if (!url) {
        await fail('transient', 'Rasm havolasini yaratib bo‘lmadi.');
        break;
      }
      const c = await createContainer(fetch, { token: token!, igUserId: conn!.ig_user_id, version: version_, imageUrl: url, caption, story: item.kind === 'story' });
      if (!c.ok) {
        await fail(c.kind, c.message);
        break;
      }
      containerId = c.value;
      await db().from('agent_publish_attempts').update({ status: 'container_created', container_id: containerId }).eq('id', att.id);
    }
    // Rasm konteyneri odatda darhol tayyor; bo'lmasa keyingi siklda davom etadi.
    let ready_ = false;
    for (let k = 0; k < 6; k++) {
      const st = await containerStatus(fetch, { token: token!, containerId, version: version_ });
      if (st.ok && (st.value === 'FINISHED' || st.value === 'PUBLISHED')) {
        ready_ = true;
        break;
      }
      if (st.ok && (st.value === 'ERROR' || st.value === 'EXPIRED')) {
        await db().from('agent_publish_attempts').update({ container_id: null }).eq('id', att.id);
        await fail('transient', `Instagram rasmni qabul qilmadi (${st.value}).`);
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (!ready_) {
      waiting = true;
      break;
    }
    await db().from('agent_publish_attempts').update({ status: 'unknown', container_id: containerId }).eq('id', att.id);
    const p = await publishContainer(fetch, { token: token!, igUserId: conn!.ig_user_id, containerId, version: version_ });
    if (!p.ok) {
      await fail(p.kind, p.message);
      break;
    }
    await db().from('agent_publish_attempts').update({ status: 'published', media_id: p.value, error: null, error_kind: null }).eq('id', att.id);
    done++;
  }

  const all = done === frames.length;
  const status = all ? (ready.simulate ? 'simulated' : 'published') : stopped ? (done ? 'partially_published' : 'failed') : done ? 'partially_published' : 'approved';
  const message = all ? (ready.simulate ? 'Sinov nashri bajarildi (Instagram’ga yuborilmadi).' : 'Instagram’ga joylandi.') : (stopped ?? (waiting ? 'Vaqtinchalik kutish — keyingi siklda davom etadi.' : 'Davom etadi.'));
  await db()
    .from('agent_items')
    .update({ status, lease_until: null, published_at: all ? new Date().toISOString() : null, last_error: all ? null : message.slice(0, 600) })
    .eq('id', item.id);
  return { ok: all, status, message };
}

/** Vaqti kelgan, tasdiqlangan, avto-nashri yoqilgan materiallar. Kech qolgani avtomatik chiqmaydi. */
export async function duePublish(limit = 3): Promise<string[]> {
  const settings = await loadSettings();
  if (!settings.publishing_enabled) return [];
  const now = Date.now();
  const { data } = await db()
    .from('agent_items')
    .select('id, status, scheduled_at, profile:agent_profiles!inner(status, auto_publish)')
    .in('status', ['approved', 'partially_published'])
    .lte('scheduled_at', new Date(now).toISOString())
    .order('scheduled_at')
    .limit(20);
  const out: string[] = [];
  for (const r of data ?? []) {
    const p = r.profile as unknown as { status: string; auto_publish: boolean };
    if (p.status !== 'active' || !p.auto_publish) continue;
    if (r.status === 'approved' && Date.parse(r.scheduled_at) < now - settings.late_grace_minutes * 60_000) {
      await db().from('agent_items').update({ status: 'needs_reschedule', last_error: 'Nashr vaqti o‘tib ketdi — nomaqbul vaqtda chiqarilmadi. Qayta rejalashtiring.' }).eq('id', r.id);
      continue;
    }
    const { data: last } = await db().from('agent_publish_attempts').select('updated_at, attempts, error_kind').eq('item_id', r.id).not('error_kind', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (last && Date.parse(last.updated_at) > now - retryDelayMin(last.attempts) * 60_000) continue;
    out.push(r.id);
    if (out.length >= limit) break;
  }
  return out;
}

/** Natijalar: story ~20 soatdan keyin (24 soatda yo'qoladi), post 24 va 72 soatdan keyin. */
export async function collectInsights(limit = 5): Promise<number> {
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data: items } = await db().from('agent_items').select('id, kind, profile_id, published_at').eq('status', 'published').gte('published_at', since).limit(50);
  let n = 0;
  for (const it of items ?? []) {
    if (n >= limit || !it.published_at) break;
    const age = Date.now() - Date.parse(it.published_at);
    const { count } = await db().from('agent_insights').select('id', { count: 'exact', head: true }).eq('item_id', it.id);
    const story = it.kind === 'story';
    const want = story ? age > 20 * 3600_000 && !count : (age > 24 * 3600_000 && !count) || (age > 72 * 3600_000 && (count ?? 0) === 1);
    if (!want) continue;
    const conn = await connectionOf(it.profile_id);
    const token = conn ? await tokenOf(conn.id) : null;
    const { data: atts } = await db().from('agent_publish_attempts').select('media_id').eq('item_id', it.id).eq('status', 'published');
    for (const a of atts ?? []) {
      if (!a.media_id) continue;
      const r = token ? await mediaInsights(fetch, { token, mediaId: a.media_id, story, version: igConfig().version }) : null;
      const metrics = r?.ok ? r.value : { _mavjud_emas: r ? r.message : 'Instagram ulanmagan' };
      await db().from('agent_insights').insert({ item_id: it.id, media_id: a.media_id, metrics: metrics as unknown as Json });
      n++;
    }
  }
  return n;
}

/** Uzoq muddatli tokenlar (≈60 kun): 7 kundan eski bo'lsa yangilanadi. */
export async function refreshTokens(limit = 3): Promise<number> {
  const old = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db().from('agent_ig_connections').select('id').eq('status', 'connected').lt('token_refreshed_at', old).limit(limit);
  let n = 0;
  for (const c of data ?? []) {
    const token = await tokenOf(c.id);
    if (!token) continue;
    const r = await refreshLongLived(fetch, token);
    if (!r.ok) {
      await db()
        .from('agent_ig_connections')
        .update({ status: r.kind === 'auth' || r.kind === 'permission' ? 'reauth' : 'connected', last_error: r.message, last_error_at: new Date().toISOString() })
        .eq('id', c.id);
      continue;
    }
    await db().rpc('agent_ig_token_save', { p_connection: c.id, p_token: r.value.token });
    await db()
      .from('agent_ig_connections')
      .update({ token_refreshed_at: new Date().toISOString(), token_expires_at: r.value.expiresIn ? new Date(Date.now() + r.value.expiresIn * 1000).toISOString() : null, last_error: null })
      .eq('id', c.id);
    n++;
  }
  return n;
}

/** Tasdiqlash: joriy versiya va joriy hash bilan. Sifatdan o'tmagan versiya tasdiqlanmaydi. */
export async function approveItem(item: AgentItem, profile: AgentProfile, by: string): Promise<{ ok: boolean; message: string }> {
  if (['publishing', 'published', 'simulated'].includes(item.status)) return { ok: false, message: 'Bu material allaqachon chiqarilgan yoki chiqarilmoqda.' };
  const v = await currentVersion(item);
  if (!v) return { ok: false, message: 'Avval material tayyorlanishi kerak.' };
  if (!(v.qa as { passed?: boolean }).passed) return { ok: false, message: 'Sifat tekshiruvidan o‘tmagan versiyani tasdiqlab bo‘lmaydi — tuzating yoki qayta yarating.' };
  const content_hash = hashFor(profile, item, { caption: v.caption, hashtags: v.hashtags, frames: v.frames as unknown as Frame[] });
  await db().from('agent_approvals').insert({ item_id: item.id, version_id: v.id, content_hash, decision: 'approved', channel: 'panel', decided_by: by });
  const late = Date.parse(item.scheduled_at) < Date.now();
  await db().from('agent_items').update({ status: 'approved', last_error: late ? 'Nashr vaqti o‘tgan — qayta rejalashtiring yoki “Hozir joylash”ni bosing.' : null }).eq('id', item.id);
  return { ok: true, message: late ? 'Tasdiqlandi. Vaqti o‘tgani uchun avtomatik chiqmaydi — qayta rejalashtiring yoki qo‘lda joylang.' : 'Tasdiqlandi.' };
}
