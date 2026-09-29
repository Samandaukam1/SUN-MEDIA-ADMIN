// Meta Graph API helpers shared by meta-connect, meta-webhook and meta-sync. Pure functions (no Deno APIs) so they
// run under `node --test` as well; network calls take `fetch` so tests can replace it.

export const GRAPH_VERSION_DEFAULT = 'v23.0';

// Facebook Login scopes: pages + lead ads, Instagram insights, ad accounts and the business.
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'instagram_basic',
  'instagram_manage_insights',
  'ads_read',
  'business_management',
];

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(data));
}

/** Constant-time comparison of two strings of hex / base64url characters. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(app secret, raw body)). */
export async function verifyWebhookSignature(appSecret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = toHex(await hmac(appSecret, rawBody));
  return safeEqual(header.slice('sha256='.length).toLowerCase(), expected);
}

/** Server-to-server Graph calls carry appsecret_proof = hex(HMAC-SHA256(app secret, access token)). */
export async function appSecretProof(appSecret: string, accessToken: string): Promise<string> {
  return toHex(await hmac(appSecret, accessToken));
}

export type OAuthState = { uid: string; client_id: string; return_to: string; exp: number; nonce: string };

/** OAuth `state`: payload + HMAC, so the callback knows who started the flow and where to return. */
export async function signState(state: OAuthState, secret: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(state)));
  const sig = base64url(new Uint8Array(await hmac(secret, body)));
  return `${body}.${sig}`;
}

export async function verifyState(token: string, secret: string, now = Date.now()): Promise<OAuthState | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig || !secret) return null;
  const expected = base64url(new Uint8Array(await hmac(secret, body)));
  if (!safeEqual(sig, expected)) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as OAuthState;
    if (typeof state.exp !== 'number' || state.exp < now) return null;
    return state;
  } catch {
    return null;
  }
}

/** Only return to an admin origin we know (never an arbitrary URL from the request). */
export function allowedReturn(returnTo: string, allowedOrigins: string[]): string | null {
  try {
    const url = new URL(returnTo);
    return allowedOrigins.some((o) => o && new URL(o).origin === url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

export type LeadgenEvent = {
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  created_time: string | null;
};

const ID = /^[0-9]{1,40}$/;

/** Webhook body (object "page", field "leadgen") → one event per lead; anything malformed is skipped. */
export function parseLeadgenEvents(body: unknown): LeadgenEvent[] {
  const events: LeadgenEvent[] = [];
  const b = body as { object?: string; entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return events;
  for (const entry of b.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen' || !change.value) continue;
      const v = change.value;
      const leadgen = String(v.leadgen_id ?? '');
      const page = String(v.page_id ?? entry.id ?? '');
      if (!ID.test(leadgen) || !ID.test(page)) continue;
      const opt = (x: unknown) => (x !== undefined && x !== null && ID.test(String(x)) ? String(x) : null);
      const created = typeof v.created_time === 'number' ? new Date(v.created_time * 1000).toISOString() : null;
      events.push({ leadgen_id: leadgen, page_id: page, form_id: opt(v.form_id), ad_id: opt(v.ad_id), adgroup_id: opt(v.adgroup_id), created_time: created });
    }
  }
  return events;
}

/** Agency calendar day [start, end) in UTC for a Tashkent-style fixed offset (UTC+5, no DST). */
export function agencyDay(date: string, offsetHours = 5): { since: number; until: number } {
  const start = Date.parse(`${date}T00:00:00Z`) - offsetHours * 3_600_000;
  return { since: Math.floor(start / 1000), until: Math.floor((start + 86_400_000) / 1000) };
}

/** Agency date (YYYY-MM-DD) `daysAgo` days before `now`. */
export function agencyDate(now: Date, daysAgo = 0, offsetHours = 5): string {
  const local = new Date(now.getTime() + offsetHours * 3_600_000 - daysAgo * 86_400_000);
  return local.toISOString().slice(0, 10);
}

type InsightRow = { name?: string; total_value?: { value?: number }; values?: { value?: number }[] };

/** Graph insights response → { metric: number }. Metrics Meta did not return are simply absent. */
export function insightTotals(response: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (response as { data?: InsightRow[] })?.data;
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (!row.name) continue;
    const value = row.total_value?.value ?? row.values?.[row.values.length - 1]?.value;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[row.name] = value;
  }
  return out;
}

/** Account insights → snapshot fields (API names → our columns). */
export function snapshotFromInsights(totals: Record<string, number>): Record<string, number> {
  const map: Record<string, string> = {
    views: 'views',
    reach: 'reach',
    total_interactions: 'interactions',
    likes: 'likes',
    comments: 'comments',
    shares: 'shares',
    saves: 'saves',
    profile_links_taps: 'profile_links_taps',
    accounts_engaged: 'accounts_engaged',
  };
  const out: Record<string, number> = {};
  for (const [api, column] of Object.entries(map)) if (api in totals) out[column] = totals[api];
  return out;
}

export type MediaNode = {
  id: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  caption?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

/** A post + its insights → the row ig_save_media stores. */
export function mediaRow(node: MediaNode, totals: Record<string, number>) {
  const image = node.media_type === 'IMAGE' || node.media_type === 'CAROUSEL_ALBUM' ? node.media_url : undefined;
  return {
    id: node.id,
    media_type: node.media_type ?? null,
    media_product_type: node.media_product_type ?? null,
    permalink: node.permalink ?? null,
    thumbnail_url: node.thumbnail_url ?? image ?? null,
    caption: node.caption ? node.caption.slice(0, 500) : null,
    timestamp: node.timestamp ?? null,
    views: totals.views ?? null,
    reach: totals.reach ?? null,
    likes: totals.likes ?? node.like_count ?? null,
    comments: totals.comments ?? node.comments_count ?? null,
    shares: totals.shares ?? null,
    saves: totals.saved ?? totals.saves ?? null,
    interactions: totals.total_interactions ?? null,
  };
}

export class GraphError extends Error {
  code?: number;
  status?: number;
  constructor(message: string, code?: number, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
  /** Token expired / revoked / missing permission: the admin must reconnect. */
  get needsReconnect(): boolean {
    return this.code === 190 || this.code === 102 || this.code === 10 || this.code === 200;
  }
}

export type Graph = <T = unknown>(path: string, params?: Record<string, string>, init?: { method?: 'GET' | 'POST' | 'DELETE'; token?: string }) => Promise<T>;

/** Graph client bound to one app; every call sends appsecret_proof with the token. */
export function graphClient(opts: { appSecret: string; version?: string; fetch?: typeof fetch }): Graph {
  const version = opts.version || GRAPH_VERSION_DEFAULT;
  const doFetch = opts.fetch ?? fetch;
  return async function graph<T>(path: string, params: Record<string, string> = {}, init: { method?: 'GET' | 'POST' | 'DELETE'; token?: string } = {}) {
    const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`);
    const query = new URLSearchParams(params);
    if (init.token) {
      query.set('access_token', init.token);
      query.set('appsecret_proof', await appSecretProof(opts.appSecret, init.token));
    }
    const method = init.method ?? 'GET';
    let response: Response;
    if (method === 'GET' || method === 'DELETE') {
      url.search = query.toString();
      response = await doFetch(url, { method });
    } else {
      response = await doFetch(url, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: query.toString() });
    }
    const json = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    if (!response.ok || json.error) {
      throw new GraphError(json.error?.message ?? `Graph HTTP ${response.status}`, json.error?.code, response.status);
    }
    return json as T;
  };
}

/** Follows Graph `paging.next` links up to `max` items (pagination keeps the same access token). */
export async function collect<T>(graph: Graph, path: string, params: Record<string, string>, token: string, max = 500): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  do {
    const page = await graph<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { ...params, ...(after ? { after } : {}) }, { token });
    items.push(...(page.data ?? []));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after && items.length < max);
  return items.slice(0, max);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Human-readable Uzbek message for the admin panel (Graph errors are English and technical). */
export function adminMessage(error: unknown): string {
  if (error instanceof GraphError && error.needsReconnect) return 'Meta ruxsati tugagan yoki bekor qilingan. Meta ulanishini qayta ulang.';
  if (error instanceof GraphError) return `Meta xatosi: ${error.message}`;
  return error instanceof Error ? error.message : 'Noma’lum xato';
}
