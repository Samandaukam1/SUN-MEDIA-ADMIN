/**
 * Agents — pure logic (server and tests): statuses, hashes, text similarity, Uzbek text hygiene, file names, cadence.
 * No network or database here (checked with node --test).
 */
import { createHash } from 'node:crypto';

/** "post" is the previous step's single image; 1.0 plans carousels. */
export type AgentKind = 'story' | 'carousel' | 'post';
export type ItemStatus =
  | 'queued'
  | 'generating'
  | 'regenerating'
  | 'qa_failed'
  | 'pending_approval'
  | 'needs_fix'
  | 'approved'
  | 'export_ready'
  | 'exported'
  | 'published_manual'
  | 'rejected'
  | 'failed'
  | 'needs_reschedule'
  | 'limit_reached'
  | 'skipped'
  | 'archived'
  | 'publishing'
  | 'published'
  | 'simulated'
  | 'partially_published';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
export const STATUS_LABEL: Record<ItemStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Rejada', tone: 'neutral' },
  generating: { label: 'Yaratilmoqda', tone: 'info' },
  regenerating: { label: 'Qayta yaratilmoqda', tone: 'info' },
  qa_failed: { label: 'Sifat tekshiruvidan o‘tmadi', tone: 'danger' },
  pending_approval: { label: 'Tasdiq kutmoqda', tone: 'warning' },
  needs_fix: { label: 'Tahrir so‘ralgan', tone: 'warning' },
  approved: { label: 'Tasdiqlangan', tone: 'success' },
  export_ready: { label: 'Yuklab olishga tayyor', tone: 'success' },
  exported: { label: 'Yuklab olingan', tone: 'accent' },
  published_manual: { label: 'Joylandi (qo‘lda)', tone: 'accent' },
  rejected: { label: 'Rad etilgan', tone: 'neutral' },
  failed: { label: 'Xatolik', tone: 'danger' },
  needs_reschedule: { label: 'Qayta rejalashtiring', tone: 'danger' },
  limit_reached: { label: 'Budjet / limit tugadi', tone: 'danger' },
  skipped: { label: 'O‘tkazib yuborildi', tone: 'neutral' },
  archived: { label: 'Arxivda', tone: 'neutral' },
  publishing: { label: 'Joylanmoqda (eski)', tone: 'neutral' },
  published: { label: 'Joylandi (eski)', tone: 'neutral' },
  simulated: { label: 'Sinov nashri (eski)', tone: 'neutral' },
  partially_published: { label: 'Qisman joylandi (eski)', tone: 'neutral' },
};

export const KIND_LABEL: Record<AgentKind, string> = { story: 'Story', carousel: 'Karusel', post: 'Rasmli post' };

/** Statuses in which the content may still be edited, regenerated or approved. */
export const EDITABLE: ItemStatus[] = ['queued', 'qa_failed', 'pending_approval', 'needs_fix', 'approved', 'export_ready', 'exported', 'rejected', 'failed', 'needs_reschedule', 'limit_reached', 'skipped'];
export const isEditable = (s: string) => (EDITABLE as string[]).includes(s);
/** Approved and the files may be downloaded. */
export const DOWNLOADABLE = ['approved', 'export_ready', 'exported', 'published_manual'];
export const isDownloadable = (s: string) => DOWNLOADABLE.includes(s);

/** Carousel day: every `every` calendar days from the start date (month boundaries do not matter). */
export function isCarouselDay(dateKey: string, startKey: string, every = 2): boolean {
  const d = Date.parse(`${dateKey}T00:00:00Z`);
  const s = Date.parse(`${startKey}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(s) || d < s || every < 1) return false;
  return Math.round((d - s) / 86_400_000) % every === 0;
}
/** @deprecated the previous step's name */
export const isPostDay = (dateKey: string, startKey: string) => isCarouselDay(dateKey, startKey, 2);

// ---------------------------------------------------------------------------------------------------------------
// Frames: one Story = one frame; a carousel = its slides in order. Each frame is its own file (and its own AI
// background); a version is an immutable set of frames, so slides of different versions are never mixed.
// ---------------------------------------------------------------------------------------------------------------
export type FrameText = { role: string; headline: string; body: string; cta: string };
export type FrameLayout = {
  /** Where the text block sits. */
  textPos: 'top' | 'middle' | 'bottom';
  /** Multipliers (deterministic edits; 1 = as designed). */
  headlineScale: number;
  logoScale: number;
  productScale: number;
  /** Background brightness (1 = as generated). */
  bgBrightness: number;
  logoPos: 'top-left' | 'top-right' | 'top-center' | 'bottom-right';
  contactPos: 'top' | 'bottom' | 'hidden';
};
export const DEFAULT_LAYOUT: FrameLayout = { textPos: 'bottom', headlineScale: 1, logoScale: 1, productScale: 1, bgBrightness: 1, logoPos: 'top-left', contactPos: 'bottom' };

export type Frame = FrameText & {
  template: string;
  /** Final PNG (exact size) and a small JPEG for galleries. */
  path: string;
  thumb?: string;
  width?: number;
  height?: number;
  sha256?: string;
  /** The AI background this frame was composed on (reused by layout and text edits — no new image cost). */
  bg_path?: string | null;
  bg_prompt?: string | null;
  bg_model?: string | null;
  product_asset_id?: string | null;
  logo_asset_id?: string | null;
  layout?: Partial<FrameLayout>;
  warnings: string[];
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** What an approval is bound to: the client, the slot, the texts and every file. Any change → a new hash. */
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
// Similarity (Uzbek apostrophes normalised).
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

/**
 * Uzbek Latin text as it should be printed: o‘ / g‘ with U+2018 (present in every bundled font, unlike U+02BB), the
 * tutuq belgisi as U+2019, no doubled spaces. Applied to every text placed on an image.
 */
export function uzText(s: string): string {
  return (s ?? '')
    .replace(/([OoGg])[ʻʼ'`’‘]/g, '$1‘')
    .replace(/([A-Za-z])[ʼ'`ʻ](?=[A-Za-z])/g, '$1’')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/** "@brend", "instagram.com/brend/", "https://www.instagram.com/brend?igsh=…" → "brend" (or null). */
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
// Export file names: CLIENT_YYYY-MM-DD_STORY_01.png, CLIENT_YYYY-MM-DD_CAROUSEL_02.png, CLIENT_YYYY-MM-DD_CAROUSEL.zip
// ---------------------------------------------------------------------------------------------------------------
export function clientSlug(name: string): string {
  const s = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʻʼ'`]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s || 'CLIENT';
}

export function exportName(a: { client: string; date: string; kind: AgentKind; index?: number; slot?: number; zip?: boolean }): string {
  const base = `${clientSlug(a.client)}_${a.date}_${a.kind === 'story' ? 'STORY' : 'CAROUSEL'}`;
  if (a.zip) return `${base}.zip`;
  const n = a.kind === 'story' ? (a.slot ?? 1) : (a.index ?? 0) + 1;
  return `${base}_${String(n).padStart(2, '0')}.png`;
}
