import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { smmOwnerIds } from '@/lib/neosmm/server';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  authorizeUrl,
  exchangeCode,
  exchangeLongLived,
  linkDecision,
  nextSyncDelaySec,
  readProfile,
  refreshLongLived,
  type IgError,
  type IgProfile,
} from './api';

/**
 * Profile cards ↔ Instagram professional accounts (Instagram Login). Server only: the app secret and the tokens stay
 * here and in Supabase Vault. Every entry point is called after the configured-owner check (actions / callback), or
 * by the worker (which has its own one-time token door).
 *
 * Settings (Vercel, server-only): INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (the *Instagram* app id / secret shown under
 * "API setup with Instagram login" — not the Facebook app's), optional INSTAGRAM_REDIRECT_URI, INSTAGRAM_GRAPH_VERSION.
 */

export const DEFAULT_REDIRECT = 'https://sunmediagroup.uz/api/smm/instagram/callback';
const STATE_TTL_MS = 10 * 60_000;
const REFRESH_AFTER_MS = 7 * 86_400_000;

export function igConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim() ?? '';
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim() ?? '';
  return {
    configured: /^\d{5,30}$/.test(appId) && appSecret.length >= 16,
    appId,
    appSecret,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI?.trim() || DEFAULT_REDIRECT,
    version: process.env.INSTAGRAM_GRAPH_VERSION?.trim() || undefined,
  };
}

const hash = (v: string) => createHash('sha256').update(v).digest('hex');

export type ConnStatus = 'none' | 'connected' | 'reauth' | 'error' | 'disconnected';

/** "Instagram’ni ulash": a one-time state for this owner and card, and the official consent URL. */
export async function startConnect(owner: string, profileId: string, forceReauth: boolean): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const cfg = igConfig();
  if (!cfg.configured) return { ok: false, message: 'Instagram ilovasi hali sozlanmagan (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).' };
  const db = createAdminClient();
  const { data: profile } = await db.from('neosmm_profiles').select('id').eq('id', profileId).maybeSingle();
  if (!profile) return { ok: false, message: 'Profil topilmadi.' };
  const state = randomBytes(32).toString('hex');
  const { error } = await db.from('neosmm_ig_oauth_states').insert({ state_hash: hash(state), owner_id: owner, profile_id: profileId, expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString() });
  if (error) return { ok: false, message: 'Ulanishni boshlab bo‘lmadi.' };
  await db.rpc('neosmm_ig_states_sweep');
  return { ok: true, url: authorizeUrl({ appId: cfg.appId, redirectUri: cfg.redirectUri, state, forceReauth }) };
}

export type ConnectResult =
  | { code: 'connected'; profileId: string; missing: string[] }
  | { code: 'mismatch'; profileId: string; got: string | null; expected: string }
  | { code: 'taken'; profileId: string; got: string | null }
  | { code: 'not_professional'; profileId: string; got: string | null }
  | { code: 'denied' | 'failed'; profileId: string | null; message?: string }
  | { code: 'state' };

/**
 * The callback: the state is used once, by the owner who started it; then code → short → long-lived token → /me.
 * The account is linked only when it IS this card's account (same stable id, or — first time — the card's username);
 * another account is refused and nothing of it is stored.
 */
export async function completeConnect(owner: string, q: { state: string; code: string | null; error: string | null }): Promise<ConnectResult> {
  const cfg = igConfig();
  const db = createAdminClient();
  if (!/^[0-9a-f]{64}$/.test(q.state)) return { code: 'state' };
  const { data: profileId } = await db.rpc('neosmm_ig_state_consume', { p_hash: hash(q.state), p_owner: owner });
  if (!profileId) return { code: 'state' };
  if (q.error || !q.code) return { code: 'denied', profileId };
  if (!cfg.configured) return { code: 'failed', profileId, message: 'Instagram ilovasi sozlanmagan.' };

  const short = await exchangeCode(fetch, { appId: cfg.appId, appSecret: cfg.appSecret, redirectUri: cfg.redirectUri, code: q.code });
  if (!short.ok) return { code: 'failed', profileId, message: short.message };
  if (short.value.permissions.length && !short.value.permissions.includes('instagram_business_basic'))
    return { code: 'failed', profileId, message: 'Profilni o‘qish ruxsati (instagram_business_basic) berilmadi.' };
  const long = await exchangeLongLived(fetch, { appSecret: cfg.appSecret, token: short.value.token });
  if (!long.ok) return { code: 'failed', profileId, message: long.message };
  const me = await readProfile(fetch, { token: long.value.token, version: cfg.version });
  if (!me.ok) return { code: 'failed', profileId, message: me.message };
  const p = me.value;

  const { data: card } = await db.from('neosmm_profiles').select('id, username, ig_user_id').eq('id', profileId).maybeSingle();
  if (!card) return { code: 'failed', profileId, message: 'Profil topilmadi.' };
  const [{ data: elsewhere }, { data: otherCard }, { data: existing }] = await Promise.all([
    db.from('neosmm_ig_connections').select('profile_id').eq('ig_user_id', p.userId).maybeSingle(),
    db.from('neosmm_profiles').select('id').eq('ig_user_id', p.userId).maybeSingle(),
    db.from('neosmm_ig_connections').select('id, ig_user_id').eq('profile_id', profileId).maybeSingle(),
  ]);
  const decision = linkDecision(card, p, { connectionOfAccount: elsewhere?.profile_id ?? null, cardOfAccount: otherCard?.id ?? null, connectionUserOfCard: existing?.ig_user_id ?? null });
  // Another account than the card's: nothing of it (token, profile data) is stored.
  if (decision === 'not_professional') return { code: 'not_professional', profileId, got: p.username };
  if (decision === 'mismatch') return { code: 'mismatch', profileId, got: p.username, expected: card.username };
  if (decision === 'taken') return { code: 'taken', profileId, got: p.username };

  const now = new Date();
  const expires = long.value.expiresIn ? new Date(now.getTime() + long.value.expiresIn * 1000).toISOString() : null;
  const row = {
    profile_id: profileId,
    ig_user_id: p.userId,
    app_scoped_id: p.appScopedId,
    username: p.username,
    account_type: p.accountType,
    permissions: short.value.permissions,
    status: 'connected',
    token_obtained_at: now.toISOString(),
    token_refreshed_at: now.toISOString(),
    token_expires_at: expires,
    last_error: null,
    last_error_at: null,
    failures: 0,
    connected_by: owner,
    connected_at: now.toISOString(),
    disconnected_at: null,
  };
  const saved = existing
    ? await db.from('neosmm_ig_connections').update(row).eq('id', existing.id).select('id').maybeSingle()
    : await db.from('neosmm_ig_connections').insert(row).select('id').maybeSingle();
  if (!saved.data) return { code: 'failed', profileId, message: 'Ulanishni saqlab bo‘lmadi.' };
  const { error: tokenError } = await db.rpc('neosmm_ig_token_save', { p_connection: saved.data.id, p_token: long.value.token });
  if (tokenError) {
    await db.from('neosmm_ig_connections').update({ status: 'reauth', last_error: 'Tokenni xavfsiz saqlab bo‘lmadi.', last_error_at: now.toISOString() }).eq('id', saved.data.id);
    return { code: 'failed', profileId, message: 'Tokenni xavfsiz saqlab bo‘lmadi.' };
  }
  if (!card.ig_user_id) await db.from('neosmm_profiles').update({ ig_user_id: p.userId }).eq('id', profileId);
  await recordReading(saved.data.id, profileId, card.username, p);
  return { code: 'connected', profileId, missing: p.missing };
}

/** A successful reading: one observation (only what the API returned), the card's name / photo / username. */
async function recordReading(connectionId: string, profileId: string, currentUsername: string, p: IgProfile) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  if (p.followers !== null || p.follows !== null || p.media !== null || p.name) {
    await db.from('neosmm_profile_observations').insert({
      profile_id: profileId,
      observed_at: now,
      followers: p.followers,
      following: p.follows,
      media_count: p.media,
      display_name: p.name,
      source: 'instagram_api',
      origin: 'Instagram API (Instagram Login) · /me',
      note: p.missing.length ? `API qaytarmadi: ${p.missing.join(', ')}` : null,
    });
  }
  const patch: { display_name?: string; display_name_source?: string; avatar_url?: string; username?: string } = {};
  if (p.name) {
    patch.display_name = p.name;
    patch.display_name_source = 'instagram_api';
  }
  if (p.pictureUrl) patch.avatar_url = p.pictureUrl;
  // A changed username follows the stable id — unless another card already holds it (never merged silently).
  if (p.username && p.username !== currentUsername) {
    const { data: holder } = await db.from('neosmm_profiles').select('id').eq('platform', 'instagram').eq('username', p.username).maybeSingle();
    if (!holder) patch.username = p.username;
  }
  if (Object.keys(patch).length) await db.from('neosmm_profiles').update(patch).eq('id', profileId);
  await db
    .from('neosmm_ig_connections')
    .update({ status: 'connected', username: p.username, account_type: p.accountType, last_attempt_at: now, last_success_at: now, last_error: null, last_error_at: null, failures: 0, next_sync_at: new Date(Date.now() + 3600_000).toISOString() })
    .eq('id', connectionId);
}

type Conn = { id: string; profile_id: string; status: string; failures: number; token_refreshed_at: string | null; token_expires_at: string | null; last_attempt_at: string | null };

async function fail(conn: Conn, err: IgError) {
  const failures = conn.failures + 1;
  const delay = nextSyncDelaySec(err, failures);
  const now = new Date();
  await createAdminClient()
    .from('neosmm_ig_connections')
    .update({
      status: delay === null ? 'reauth' : 'error',
      last_attempt_at: now.toISOString(),
      last_error: err.message.slice(0, 500),
      last_error_at: now.toISOString(),
      failures,
      next_sync_at: delay === null ? null : new Date(now.getTime() + delay * 1000).toISOString(),
    })
    .eq('id', conn.id);
}

/** One reading of one connection (token refreshed first when it is a week old). The last good value is kept on failure. */
export async function syncConnection(conn: Conn): Promise<{ ok: boolean; message: string }> {
  const cfg = igConfig();
  const db = createAdminClient();
  if (conn.status === 'disconnected' || conn.status === 'reauth') return { ok: false, message: 'Ulanish faol emas.' };
  const { data: card } = await db.from('neosmm_profiles').select('username, ig_user_id').eq('id', conn.profile_id).maybeSingle();
  const { data: token } = await db.rpc('neosmm_ig_token_read', { p_connection: conn.id });
  if (!card || !token) {
    await fail(conn, { ok: false, kind: 'auth', code: null, retryAfterSec: null, message: 'Token topilmadi — qayta ulash kerak.' });
    return { ok: false, message: 'Token topilmadi — qayta ulash kerak.' };
  }
  let current = token as string;
  if (conn.token_expires_at && Date.parse(conn.token_expires_at) <= Date.now()) {
    await fail(conn, { ok: false, kind: 'auth', code: null, retryAfterSec: null, message: 'Token muddati tugagan — qayta ulash kerak.' });
    return { ok: false, message: 'Token muddati tugagan — qayta ulash kerak.' };
  }
  if (!conn.token_refreshed_at || Date.now() - Date.parse(conn.token_refreshed_at) >= REFRESH_AFTER_MS) {
    const r = await refreshLongLived(fetch, current);
    if (r.ok) {
      current = r.value.token;
      await db.rpc('neosmm_ig_token_save', { p_connection: conn.id, p_token: current });
      await db
        .from('neosmm_ig_connections')
        .update({ token_refreshed_at: new Date().toISOString(), token_expires_at: r.value.expiresIn ? new Date(Date.now() + r.value.expiresIn * 1000).toISOString() : conn.token_expires_at })
        .eq('id', conn.id);
    } else if (r.kind === 'auth' || r.kind === 'permission') {
      await fail(conn, r);
      return { ok: false, message: r.message };
    }
    // A passing refresh error: the current token is still valid — read with it, refresh next time.
  }
  const me = await readProfile(fetch, { token: current, version: cfg.version });
  if (!me.ok) {
    await fail(conn, me);
    return { ok: false, message: me.message };
  }
  // The token now belongs to another account than the card: stop, never record it on this card.
  if (card.ig_user_id && me.value.userId !== card.ig_user_id) {
    await fail(conn, { ok: false, kind: 'auth', code: null, retryAfterSec: null, message: 'Token boshqa Instagram akkauntiga tegishli — qayta ulash kerak.' });
    return { ok: false, message: 'Token boshqa akkauntga tegishli.' };
  }
  await recordReading(conn.id, conn.profile_id, card.username, me.value);
  return { ok: true, message: me.value.missing.length ? `Yangilandi. API qaytarmagan maydonlar: ${me.value.missing.join(', ')}.` : 'Yangilandi.' };
}

const CONN_COLUMNS = 'id, profile_id, status, failures, token_refreshed_at, token_expires_at, last_attempt_at';

/** The worker's step: connections due for their hourly reading (a few per run, spread over time). */
export async function syncDue(limit = 5): Promise<number> {
  if (!igConfig().configured || !smmOwnerIds().length) return 0;
  const { data } = await createAdminClient()
    .from('neosmm_ig_connections')
    .select(CONN_COLUMNS)
    .in('status', ['connected', 'error'])
    .lte('next_sync_at', new Date().toISOString())
    .order('next_sync_at')
    .limit(limit);
  let n = 0;
  for (const c of (data ?? []) as Conn[]) {
    await syncConnection(c);
    n++;
  }
  return n;
}

/** "Hozir yangilash" — at most once a minute per account. */
export async function syncNow(profileId: string): Promise<{ ok: boolean; message: string }> {
  if (!igConfig().configured) return { ok: false, message: 'Instagram ilovasi sozlanmagan.' };
  const { data } = await createAdminClient().from('neosmm_ig_connections').select(CONN_COLUMNS).eq('profile_id', profileId).maybeSingle();
  const c = data as Conn | null;
  if (!c || c.status === 'disconnected') return { ok: false, message: 'Instagram ulanmagan.' };
  if (c.status === 'reauth') return { ok: false, message: 'Qayta ulash kerak.' };
  if (c.last_attempt_at && Date.now() - Date.parse(c.last_attempt_at) < 60_000) return { ok: false, message: 'Hozirgina yangilangan — bir daqiqadan keyin urinib ko‘ring.' };
  return syncConnection(c);
}

/** "Ulanishni uzish": the token is deleted, readings stop; the card, its orders and observations stay. */
export async function disconnect(profileId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from('neosmm_ig_connections').select('id').eq('profile_id', profileId).maybeSingle();
  if (!data) return false;
  await db.rpc('neosmm_ig_token_drop', { p_connection: data.id });
  const { error } = await db.from('neosmm_ig_connections').update({ status: 'disconnected', disconnected_at: new Date().toISOString(), next_sync_at: null }).eq('id', data.id);
  return !error;
}

/** Meta's deauthorize / data-deletion callbacks, by the account's id: the token goes, readings stop. */
export async function revokeByInstagramUser(userId: string, deleteApiData: boolean): Promise<boolean> {
  if (!/^\d{1,40}$/.test(userId)) return false;
  const db = createAdminClient();
  const { data } = await db.from('neosmm_ig_connections').select('id, profile_id').or(`ig_user_id.eq.${userId},app_scoped_id.eq.${userId}`).maybeSingle();
  if (!data) return false;
  await db.rpc('neosmm_ig_token_drop', { p_connection: data.id });
  await db
    .from('neosmm_ig_connections')
    .update({ status: deleteApiData ? 'disconnected' : 'reauth', disconnected_at: deleteApiData ? new Date().toISOString() : null, next_sync_at: null, last_error: 'Ruxsat Instagram tomonidan bekor qilindi.', last_error_at: new Date().toISOString() })
    .eq('id', data.id);
  if (deleteApiData) {
    await db.from('neosmm_profile_observations').delete().eq('profile_id', data.profile_id).eq('source', 'instagram_api');
    await db.from('neosmm_profiles').update({ avatar_url: null }).eq('id', data.profile_id);
  }
  return true;
}
