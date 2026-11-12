import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { exchangeCode, exchangeLongLived, readProfile } from '@/lib/instagram/api';
import { igConfig } from '@/lib/instagram/server';

import { agentAuthorizeUrl, PUBLISH_SCOPE } from './instagram';
import { db } from './server';

/**
 * Agents profili ↔ Instagram professional hisob (Instagram Login, nashr ruxsati bilan). Parol so'ralmaydi:
 * foydalanuvchi Instagram'ning o'z oynasida ruxsat beradi. Ilova: Smm Api bilan bir xil Meta ilovasi
 * (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET), qaytish manzili alohida — AGENTS_INSTAGRAM_REDIRECT_URI
 * (sukut: https://sunmediagroup.uz/api/agents/instagram/callback; Meta ilovasida ro'yxatga qo'shilishi kerak).
 * Hisob faqat profilning o'z username'i bo'lsa ulanadi — boshqa hisobning hech narsasi saqlanmaydi.
 */

export const AGENTS_REDIRECT = 'https://sunmediagroup.uz/api/agents/instagram/callback';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

export function agentIgConfig() {
  const base = igConfig();
  return { ...base, redirectUri: process.env.AGENTS_INSTAGRAM_REDIRECT_URI?.trim() || AGENTS_REDIRECT };
}

export async function startAgentConnect(owner: string, profileId: string, forceReauth: boolean): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const cfg = agentIgConfig();
  if (!cfg.configured) return { ok: false, message: 'Instagram ilovasi serverda sozlanmagan (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).' };
  const { data: p } = await db().from('agent_profiles').select('id').eq('id', profileId).maybeSingle();
  if (!p) return { ok: false, message: 'Profil topilmadi.' };
  const state = randomBytes(32).toString('hex');
  const { error } = await db().from('agent_ig_oauth_states').insert({ state_hash: hash(state), owner_id: owner, profile_id: profileId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) return { ok: false, message: 'Ulanishni boshlab bo‘lmadi.' };
  await db().from('agent_ig_oauth_states').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());
  return { ok: true, url: agentAuthorizeUrl({ appId: cfg.appId, redirectUri: cfg.redirectUri, state, forceReauth }) };
}

export type AgentConnectResult = { profileId: string | null; code: 'connected' | 'mismatch' | 'taken' | 'not_professional' | 'no_publish' | 'denied' | 'failed' | 'state'; user?: string | null; message?: string };

export async function completeAgentConnect(owner: string, q: { state: string; code: string | null; error: string | null }): Promise<AgentConnectResult> {
  const cfg = agentIgConfig();
  if (!/^[0-9a-f]{64}$/.test(q.state)) return { profileId: null, code: 'state' };
  const { data: profileId } = await db().rpc('agent_ig_state_consume', { p_hash: hash(q.state), p_owner: owner });
  if (!profileId) return { profileId: null, code: 'state' };
  if (q.error || !q.code) return { profileId, code: 'denied' };
  if (!cfg.configured) return { profileId, code: 'failed', message: 'Instagram ilovasi sozlanmagan.' };

  const short = await exchangeCode(fetch, { appId: cfg.appId, appSecret: cfg.appSecret, redirectUri: cfg.redirectUri, code: q.code });
  if (!short.ok) return { profileId, code: 'failed', message: short.message };
  const long = await exchangeLongLived(fetch, { appSecret: cfg.appSecret, token: short.value.token });
  if (!long.ok) return { profileId, code: 'failed', message: long.message };
  const me = await readProfile(fetch, { token: long.value.token, version: cfg.version });
  if (!me.ok) return { profileId, code: 'failed', message: me.message };
  const p = me.value;
  if (p.accountType && !/^(business|media_creator|creator)$/i.test(p.accountType)) return { profileId, code: 'not_professional', user: p.username };
  if (short.value.permissions.length && !short.value.permissions.includes(PUBLISH_SCOPE)) return { profileId, code: 'no_publish', user: p.username };

  const { data: profile } = await db().from('agent_profiles').select('id, instagram_username').eq('id', profileId).maybeSingle();
  if (!profile) return { profileId, code: 'failed', message: 'Profil topilmadi.' };
  if (profile.instagram_username && p.username !== profile.instagram_username) return { profileId, code: 'mismatch', user: p.username };
  const { data: elsewhere } = await db().from('agent_ig_connections').select('profile_id').eq('ig_user_id', p.userId).maybeSingle();
  if (elsewhere && elsewhere.profile_id !== profileId) return { profileId, code: 'taken', user: p.username };

  const now = new Date().toISOString();
  const row = {
    profile_id: profileId,
    ig_user_id: p.userId,
    username: p.username,
    account_type: p.accountType,
    permissions: short.value.permissions,
    status: 'connected',
    token_refreshed_at: now,
    token_expires_at: long.value.expiresIn ? new Date(Date.now() + long.value.expiresIn * 1000).toISOString() : null,
    last_error: null,
    last_error_at: null,
    connected_by: owner,
    connected_at: now,
  };
  const saved = await db().from('agent_ig_connections').upsert(row, { onConflict: 'profile_id' }).select('id').single();
  if (!saved.data) return { profileId, code: 'failed', message: 'Ulanishni saqlab bo‘lmadi.' };
  const { error } = await db().rpc('agent_ig_token_save', { p_connection: saved.data.id, p_token: long.value.token });
  if (error) {
    await db().from('agent_ig_connections').update({ status: 'reauth', last_error: 'Tokenni xavfsiz saqlab bo‘lmadi.' }).eq('id', saved.data.id);
    return { profileId, code: 'failed', message: 'Tokenni xavfsiz saqlab bo‘lmadi.' };
  }
  if (!profile.instagram_username && p.username) await db().from('agent_profiles').update({ instagram_username: p.username }).eq('id', profileId);
  return { profileId, code: 'connected', user: p.username };
}

export async function disconnectAgent(profileId: string) {
  const { data: c } = await db().from('agent_ig_connections').select('id').eq('profile_id', profileId).maybeSingle();
  if (!c) return;
  await db().rpc('agent_ig_token_drop', { p_connection: c.id });
  await db().from('agent_ig_connections').update({ status: 'disconnected' }).eq('id', c.id);
  await db().from('agent_profiles').update({ auto_publish: false }).eq('id', profileId);
}
