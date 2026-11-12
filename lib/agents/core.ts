/**
 * Agents — sof mantiq (server va testlar uchun): jadval, holatlar, hash, matn o'xshashligi, formatlar.
 * Bu faylda tarmoq yoki baza yo'q (node --test bilan tekshiriladi).
 */
import { createHash } from 'node:crypto';

export type AgentKind = 'story' | 'post';
export type ItemStatus =
  | 'queued'
  | 'generating'
  | 'qa_failed'
  | 'pending_approval'
  | 'approved'
  | 'needs_fix'
  | 'rejected'
  | 'publishing'
  | 'published'
  | 'simulated'
  | 'partially_published'
  | 'failed'
  | 'needs_reschedule'
  | 'limit_reached'
  | 'skipped';

export const STATUS_LABEL: Record<ItemStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet' }> = {
  queued: { label: 'Navbatda', tone: 'neutral' },
  generating: { label: 'Tayyorlanmoqda', tone: 'info' },
  qa_failed: { label: 'Sifat xatosi', tone: 'danger' },
  pending_approval: { label: 'Tasdiq kutmoqda', tone: 'warning' },
  approved: { label: 'Tasdiqlangan', tone: 'success' },
  needs_fix: { label: 'Tuzatilmoqda', tone: 'warning' },
  rejected: { label: 'Rad etilgan', tone: 'neutral' },
  publishing: { label: 'Joylanmoqda', tone: 'info' },
  published: { label: 'Joylandi', tone: 'success' },
  simulated: { label: 'Sinov nashri', tone: 'violet' },
  partially_published: { label: 'Qisman joylandi', tone: 'warning' },
  failed: { label: 'Xatolik', tone: 'danger' },
  needs_reschedule: { label: 'Qayta rejalashtiring', tone: 'danger' },
  limit_reached: { label: 'Limit tugadi', tone: 'danger' },
  skipped: { label: 'O‘tkazib yuborildi', tone: 'neutral' },
};

export const KIND_LABEL: Record<AgentKind, string> = { story: 'Story', post: 'Rasmli post' };

/** Materialni hali o'zgartirish mumkinmi (chiqib ketgan yoki chiqayotganini emas). */
export const EDITABLE: ItemStatus[] = ['queued', 'qa_failed', 'pending_approval', 'approved', 'needs_fix', 'rejected', 'failed', 'needs_reschedule', 'limit_reached', 'skipped'];
export const isEditable = (s: string) => (EDITABLE as string[]).includes(s);

/** Kunora post: boshlanish sanasidan har 2 kunda bir. Kalendar kunlari bilan hisoblanadi — oy chegarasi ta'sir qilmaydi. */
export function isPostDay(dateKey: string, startKey: string): boolean {
  const d = Date.parse(`${dateKey}T00:00:00Z`);
  const s = Date.parse(`${startKey}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(s) || d < s) return false;
  return Math.round((d - s) / 86_400_000) % 2 === 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Tasdiq hash'i: rasm, matn, profil yoki vaqt o'zgarsa — hash o'zgaradi va eski tasdiq amal qilmaydi.
// ---------------------------------------------------------------------------------------------------------------
export type FrameText = { role: string; headline: string; body: string; cta: string };
export type Frame = FrameText & { template: string; path: string; warnings: string[] };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

export function contentHash(input: { profileId: string; igUsername: string | null; kind: string; scheduledAt: string; caption: string; hashtags: string; frames: Pick<Frame, 'headline' | 'body' | 'cta' | 'path'>[] }): string {
  const payload = {
    p: input.profileId,
    u: input.igUsername ?? '',
    k: input.kind,
    t: new Date(input.scheduledAt).toISOString(),
    c: input.caption,
    h: input.hashtags,
    f: input.frames.map((f) => ({ h: f.headline, b: f.body, c: f.cta, p: f.path })),
  };
  return createHash('sha256').update(stable(payload)).digest('hex');
}

// ---------------------------------------------------------------------------------------------------------------
// Takrorlanish: so'zlar bo'yicha o'xshashlik (o'zbekcha apostroflar bir xil ko'rinishga keltiriladi).
// ---------------------------------------------------------------------------------------------------------------
export function words(s: string): Set<string> {
  const norm = (s ?? '')
    .toLowerCase()
    .replace(/[ʻʼ‘’`']/g, "'")
    .replace(/[^a-z0-9а-яёўқғҳ' ]+/gi, ' ');
  return new Set(norm.split(/\s+/).filter((w) => w.length > 2));
}

export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** "@brend", "instagram.com/brend/", "https://www.instagram.com/brend?igsh=…" → "brend" (yoki null). */
export function normalizeUsername(input: string | null | undefined): string | null {
  const v = (input ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(v) ? v : null;
}

export function normalizeColor(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s))
    return `#${s
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toUpperCase();
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Narx (taxminiy): Anthropic'ning e'lon qilingan stavkalari, $ / 1M token. Gemini bepul tarifda — taxmin yo'q (null).
// ---------------------------------------------------------------------------------------------------------------
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
export const WEB_SEARCH_USD = 0.01;

export function estimateCost(model: string, input: number, output: number, searches = 0): number | null {
  const p = PRICES[model];
  if (!p) return searches ? searches * WEB_SEARCH_USD : null;
  return Math.round(((input / 1e6) * p[0] + (output / 1e6) * p[1] + searches * WEB_SEARCH_USD) * 1e6) / 1e6;
}
