/**
 * Instagram API with Instagram Login — Agents uchun nashr va natijalar (sof, fetch tashqaridan beriladi; testlanadi).
 * Rasmiy hujjat (tekshirildi 2026-11-12): developers.facebook.com/docs/instagram-platform/content-publishing
 *
 *   konteyner   POST graph.instagram.com/<v>/<IG_ID>/media   image_url (ochiq JPEG), caption | media_type=STORIES
 *   holat       GET  <CONTAINER_ID>?fields=status_code       IN_PROGRESS | FINISHED | PUBLISHED | ERROR | EXPIRED
 *   nashr       POST <IG_ID>/media_publish  creation_id
 *   natija      GET  <MEDIA_ID>/insights?metric=…            (instagram_business_manage_insights)
 * Cheklovlar: faqat JPEG, 8 MB; feed 4:5 … 1.91:1; story'da stikerlar (havola, so'rovnoma) API orqali qo'yilmaydi;
 * 24 soatda 100 ta nashr.
 */
import { call, DEFAULT_GRAPH_VERSION, type IgResult } from '@/lib/instagram/api';

export const AGENT_IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'] as const;
export const PUBLISH_SCOPE = 'instagram_business_content_publish';

type Fetch = typeof fetch;
const v = (version?: string) => (/^v\d{1,3}\.\d$/.test(version ?? '') ? version! : DEFAULT_GRAPH_VERSION);

export function agentAuthorizeUrl(a: { appId: string; redirectUri: string; state: string; forceReauth?: boolean }): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: a.appId,
    redirect_uri: a.redirectUri,
    response_type: 'code',
    scope: AGENT_IG_SCOPES.join(','),
    state: a.state,
    enable_fb_login: '0',
    ...(a.forceReauth ? { force_reauth: 'true' } : {}),
  }).toString();
  return url.toString();
}

export async function createContainer(f: Fetch, a: { token: string; igUserId: string; version?: string; imageUrl: string; caption: string | null; story: boolean }): Promise<IgResult<string>> {
  const body = new URLSearchParams({ image_url: a.imageUrl, access_token: a.token });
  if (a.story) body.set('media_type', 'STORIES');
  else if (a.caption) body.set('caption', a.caption);
  const r = await call(f, `https://graph.instagram.com/${v(a.version)}/${a.igUserId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) return r;
  const id = String(r.value.id ?? '');
  return /^\d{1,40}$/.test(id) ? { ok: true, value: id } : { ok: false, kind: 'bad_request', code: null, retryAfterSec: null, message: 'Instagram konteyner ID qaytarmadi.' };
}

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'PUBLISHED' | 'ERROR' | 'EXPIRED' | 'UNKNOWN';

export async function containerStatus(f: Fetch, a: { token: string; containerId: string; version?: string }): Promise<IgResult<ContainerStatus>> {
  const r = await call(f, `https://graph.instagram.com/${v(a.version)}/${a.containerId}?${new URLSearchParams({ fields: 'status_code', access_token: a.token })}`);
  if (!r.ok) return r;
  const s = String(r.value.status_code ?? 'UNKNOWN').toUpperCase();
  return { ok: true, value: (['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(s) ? s : 'UNKNOWN') as ContainerStatus };
}

export async function publishContainer(f: Fetch, a: { token: string; igUserId: string; containerId: string; version?: string }): Promise<IgResult<string>> {
  const r = await call(f, `https://graph.instagram.com/${v(a.version)}/${a.igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: a.containerId, access_token: a.token }).toString(),
  });
  if (!r.ok) return r;
  const id = String(r.value.id ?? '');
  return id ? { ok: true, value: id } : { ok: false, kind: 'transient', code: null, retryAfterSec: null, message: 'Instagram nashr ID qaytarmadi — holat qayta tekshiriladi.' };
}

export const STORY_METRICS = ['reach', 'views', 'replies', 'shares', 'navigation', 'total_interactions'];
export const POST_METRICS = ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions'];

/** Mavjud ko'rsatkichlar. Instagram bermagan ko'rsatkich yozilmaydi (0 deb to'ldirilmaydi). */
export async function mediaInsights(f: Fetch, a: { token: string; mediaId: string; story: boolean; version?: string }): Promise<IgResult<Record<string, number>>> {
  const metric = (a.story ? STORY_METRICS : POST_METRICS).join(',');
  const r = await call(f, `https://graph.instagram.com/${v(a.version)}/${a.mediaId}/insights?${new URLSearchParams({ metric, access_token: a.token })}`);
  if (!r.ok) return r;
  const out: Record<string, number> = {};
  for (const row of (Array.isArray(r.value.data) ? r.value.data : []) as Record<string, unknown>[]) {
    const name = String(row.name ?? '');
    const values = Array.isArray(row.values) ? (row.values as { value?: unknown }[]) : [];
    const total = (row.total_value as { value?: unknown } | undefined)?.value;
    const val = values.length ? values[0]?.value : total;
    if (name && typeof val === 'number' && Number.isFinite(val)) out[name] = val;
  }
  return { ok: true, value: out };
}

/** Qaysi xatoda to'xtash kerak: token/ruxsat — ha (qayta ulash); limit/vaqtinchalik — cheklangan qayta urinish. */
export const MAX_ATTEMPTS = 3;
export const shouldStop = (kind: string) => kind === 'auth' || kind === 'permission' || kind === 'bad_request';
export const retryDelayMin = (attempts: number) => Math.min(60, 5 * 2 ** Math.max(0, attempts - 1));
