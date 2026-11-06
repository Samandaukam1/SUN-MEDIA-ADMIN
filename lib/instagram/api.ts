/**
 * Instagram API with Instagram Login (Business Login for Instagram) — the calls the Smm Api profile cards need, and
 * nothing more: read the professional account's own profile. Scope: instagram_business_basic only. No Facebook Login.
 *
 *   authorize      https://www.instagram.com/oauth/authorize            (the official Instagram consent window)
 *   code → token   POST https://api.instagram.com/oauth/access_token   (short-lived; answer wrapped in data[])
 *   long-lived     GET  https://graph.instagram.com/access_token        grant_type=ig_exchange_token (≈60 days)
 *   refresh        GET  https://graph.instagram.com/refresh_access_token grant_type=ig_refresh_token (≥24 h old, not expired)
 *   profile        GET  https://graph.instagram.com/<v>/me?fields=…
 *
 * Tokens and the app secret never appear in a returned message. Pure apart from the injected fetch (unit-tested).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const IG_SCOPES = ['instagram_business_basic'] as const;
export const IG_PROFILE_FIELDS = ['user_id', 'id', 'username', 'name', 'account_type', 'profile_picture_url', 'followers_count', 'follows_count', 'media_count'] as const;
export const DEFAULT_GRAPH_VERSION = 'v24.0';

export type IgErrorKind = 'auth' | 'permission' | 'rate' | 'transient' | 'bad_request';
export type IgError = { ok: false; kind: IgErrorKind; message: string; code: number | null; retryAfterSec: number | null };
export type IgResult<T> = { ok: true; value: T } | IgError;

export function authorizeUrl({ appId, redirectUri, state, forceReauth = false }: { appId: string; redirectUri: string; state: string; forceReauth?: boolean }): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: IG_SCOPES.join(','),
    state,
    // Instagram professional account login only — not the Facebook Login option.
    enable_fb_login: '0',
    ...(forceReauth ? { force_reauth: 'true' } : {}),
  }).toString();
  return url.toString();
}

/** The code as Instagram returns it may end with "#_" — not part of the code. */
export const cleanCode = (code: string) => code.replace(/#_$/, '').trim();

const redact = (s: string) => s.replace(/(access_token|client_secret)=[^&\s]+/gi, '$1=[yashirin]').slice(0, 300);

/** Throttling (4, 17, 32, 613, 80002, HTTP 429): when access returns, from the usage headers when present. */
export function retryAfterFrom(headers: Headers): number | null {
  for (const name of ['x-business-use-case-usage', 'x-app-usage']) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const entries = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed ? Object.values(parsed as Record<string, unknown>).flat() : [];
      let minutes = 0;
      for (const e of entries as Record<string, unknown>[]) {
        const m = Number(e?.estimated_time_to_regain_access);
        if (Number.isFinite(m)) minutes = Math.max(minutes, m);
      }
      if (minutes > 0) return minutes * 60;
    } catch {
      /* unreadable header: no hint */
    }
  }
  const ra = Number(headers.get('retry-after'));
  return Number.isFinite(ra) && ra > 0 ? ra : null;
}

export function classify(status: number, body: unknown, headers: Headers): IgError {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const e = (b.error && typeof b.error === 'object' ? b.error : b) as Record<string, unknown>;
  const code = Number(e.code ?? b.code);
  const sub = Number(e.error_subcode);
  const text = redact(String(e.message ?? e.error_message ?? b.error_message ?? ''));
  const c = Number.isFinite(code) ? code : null;
  if (status === 429 || [4, 17, 32, 613, 80002].includes(code))
    return { ok: false, kind: 'rate', code: c, retryAfterSec: retryAfterFrom(headers), message: 'Meta so‘rovlar chegarasiga yetildi — keyinroq qayta uriniladi.' };
  if (code === 190 || [458, 459, 460, 463, 464, 467].includes(sub) || (/OAuthException/i.test(String(e.type ?? b.error_type)) && /token|session/i.test(text)))
    return { ok: false, kind: 'auth', code: c, retryAfterSec: null, message: 'Instagram ruxsati bekor qilingan yoki muddati tugagan — qayta ulash kerak.' };
  if (code === 10 || (code >= 200 && code <= 299))
    return { ok: false, kind: 'permission', code: c, retryAfterSec: null, message: 'Instagram kerakli ruxsatni bermadi (instagram_business_basic) — qayta ulash kerak.' };
  if (status >= 500 || code === 1 || code === 2 || code === -1)
    return { ok: false, kind: 'transient', code: c, retryAfterSec: null, message: 'Instagram serverida vaqtinchalik nosozlik — keyinroq qayta uriniladi.' };
  return { ok: false, kind: 'bad_request', code: c, retryAfterSec: null, message: `Instagram so‘rovni rad etdi${text ? `: ${text}` : ''}.` };
}

type Fetch = typeof fetch;

async function call(fetchImpl: Fetch, url: string, init?: RequestInit): Promise<IgResult<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, kind: 'transient', code: null, retryAfterSec: null, message: 'Instagram bilan aloqa bo‘lmadi — keyinroq qayta uriniladi.' };
  }
  let body: unknown;
  try {
    // Instagram account ids are ~17 digits — beyond exact JS numbers; keep them as text before parsing.
    body = JSON.parse((await res.text()).replace(/"(user_id|id)"\s*:\s*(\d{16,})/g, '"$1":"$2"'));
  } catch {
    body = undefined;
  }
  if (!res.ok || !body || typeof body !== 'object' || 'error' in body || 'error_type' in body) return classify(res.status, body, res.headers);
  return { ok: true, value: body as Record<string, unknown> };
}

export type ShortToken = { token: string; userId: string; permissions: string[] };

/** Code → short-lived token (server-side, with the app secret). The answer is wrapped in data[] (older form: flat). */
export async function exchangeCode(fetchImpl: Fetch, a: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<IgResult<ShortToken>> {
  const r = await call(fetchImpl, 'https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: a.appId, client_secret: a.appSecret, grant_type: 'authorization_code', redirect_uri: a.redirectUri, code: cleanCode(a.code) }).toString(),
  });
  if (!r.ok) return r;
  const row = (Array.isArray(r.value.data) ? r.value.data[0] : r.value) as Record<string, unknown> | undefined;
  const token = typeof row?.access_token === 'string' ? row.access_token : '';
  const userId = row?.user_id !== undefined ? String(row.user_id) : '';
  if (!token || !/^\d{1,40}$/.test(userId)) return { ok: false, kind: 'bad_request', code: null, retryAfterSec: null, message: 'Instagram token javobi tushunarsiz.' };
  const perms = Array.isArray(row?.permissions) ? row.permissions.map(String) : String(row?.permissions ?? '').split(',');
  return { ok: true, value: { token, userId, permissions: perms.map((p) => p.trim()).filter(Boolean) } };
}

export type LongToken = { token: string; expiresIn: number | null };

const longToken = (v: Record<string, unknown>): IgResult<LongToken> => {
  const token = typeof v.access_token === 'string' ? v.access_token : '';
  if (!token) return { ok: false, kind: 'bad_request', code: null, retryAfterSec: null, message: 'Instagram uzoq muddatli token bermadi.' };
  const exp = Number(v.expires_in);
  return { ok: true, value: { token, expiresIn: Number.isFinite(exp) && exp > 0 ? exp : null } };
};

export async function exchangeLongLived(fetchImpl: Fetch, a: { appSecret: string; token: string }): Promise<IgResult<LongToken>> {
  const url = `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: a.appSecret, access_token: a.token })}`;
  const r = await call(fetchImpl, url);
  return r.ok ? longToken(r.value) : r;
}

export async function refreshLongLived(fetchImpl: Fetch, token: string): Promise<IgResult<LongToken>> {
  const r = await call(fetchImpl, `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
  return r.ok ? longToken(r.value) : r;
}

export type IgProfile = {
  userId: string;
  appScopedId: string | null;
  username: string | null;
  name: string | null;
  accountType: string | null;
  pictureUrl: string | null;
  followers: number | null;
  follows: number | null;
  media: number | null;
  /** Fields the API did not return (shown as the reason, never filled in). */
  missing: string[];
};

const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : null);

export function normalizeProfile(v: Record<string, unknown>): IgProfile | null {
  const userId = v.user_id !== undefined ? String(v.user_id) : '';
  if (!/^\d{1,40}$/.test(userId)) return null;
  const str = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
  const pic = str(v.profile_picture_url, 2000);
  const p: IgProfile = {
    userId,
    appScopedId: v.id !== undefined && /^\d{1,40}$/.test(String(v.id)) ? String(v.id) : null,
    username: str(v.username, 64)?.toLowerCase() ?? null,
    name: str(v.name, 150),
    accountType: str(v.account_type, 40),
    pictureUrl: pic && /^https:\/\//.test(pic) ? pic : null,
    followers: count(v.followers_count),
    follows: count(v.follows_count),
    media: count(v.media_count),
    missing: [],
  };
  const labels: [keyof IgProfile, string][] = [
    ['username', 'username'],
    ['name', 'name'],
    ['pictureUrl', 'profile_picture_url'],
    ['followers', 'followers_count'],
    ['follows', 'follows_count'],
    ['media', 'media_count'],
  ];
  p.missing = labels.filter(([k]) => p[k] === null).map(([, f]) => f);
  return p;
}

export async function readProfile(fetchImpl: Fetch, a: { token: string; version?: string }): Promise<IgResult<IgProfile>> {
  const v = /^v\d{1,3}\.\d$/.test(a.version ?? '') ? a.version : DEFAULT_GRAPH_VERSION;
  const r = await call(fetchImpl, `https://graph.instagram.com/${v}/me?${new URLSearchParams({ fields: IG_PROFILE_FIELDS.join(','), access_token: a.token })}`);
  if (!r.ok) return r;
  const p = normalizeProfile(r.value);
  return p ? { ok: true, value: p } : { ok: false, kind: 'bad_request', code: null, retryAfterSec: null, message: 'Instagram profil javobida akkaunt ID si yo‘q.' };
}

/** Meta's signed_request (deauthorize / data deletion callbacks): base64url(sig).base64url(json), HMAC-SHA256 with the app secret. */
export function parseSignedRequest(signed: string, appSecret: string): Record<string, unknown> | null {
  const [sig, payload] = signed.split('.', 2);
  if (!sig || !payload || !appSecret) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>;
    return String(data.algorithm ?? '').toUpperCase() === 'HMAC-SHA256' ? data : null;
  } catch {
    return null;
  }
}

/** Next reading after an outcome: hourly when fine; Meta's own hint or a growing back-off otherwise. */
export function nextSyncDelaySec(outcome: { ok: true } | IgError, failures: number): number | null {
  if (outcome.ok) return 3600;
  if (outcome.kind === 'auth' || outcome.kind === 'permission') return null;
  if (outcome.kind === 'rate') return Math.max(outcome.retryAfterSec ?? 0, 3600);
  return Math.min(6 * 3600, 600 * 2 ** Math.min(failures, 6));
}

/**
 * May this Instagram account be linked to this card? Only when it is the card's account: the same stable id, or — for
 * a card never linked — the card's own username. Never re-pointed to another account, never a second card per account.
 */
export function linkDecision(
  card: { id: string; username: string; ig_user_id: string | null },
  me: Pick<IgProfile, 'userId' | 'username' | 'accountType'>,
  known: { connectionOfAccount: string | null; cardOfAccount: string | null; connectionUserOfCard: string | null },
): 'ok' | 'mismatch' | 'taken' | 'not_professional' {
  if (me.accountType && !/^(business|media_creator|creator)$/i.test(me.accountType)) return 'not_professional';
  const same = card.ig_user_id ? card.ig_user_id === me.userId : me.username === card.username;
  if (!same) return 'mismatch';
  if (known.connectionUserOfCard && known.connectionUserOfCard !== me.userId) return 'mismatch';
  if ((known.connectionOfAccount && known.connectionOfAccount !== card.id) || (known.cardOfAccount && known.cardOfAccount !== card.id)) return 'taken';
  return 'ok';
}
