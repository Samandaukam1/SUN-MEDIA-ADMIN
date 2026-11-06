/**
 * NeoSMM catalogues and orders, pure (no network, no database; unit-tested): what the provider sends, made safe to
 * show and to validate. Names and categories are provider text — shown as text, never as markup.
 */

import { decCmp, decText, estimate, parseDec } from './decimal';

export type Kind = 'smm' | 'gift' | 'donat';

export type Service = {
  id: number;
  name: string;
  type: string;
  category: string;
  /** The provider's tariff, exactly as sent ("1500.00"). */
  rate: string;
  min: number | null;
  max: number | null;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
};
export type Gift = { id: number; name: string; price: string; stars: number | null };
export type DonatProduct = { id: number; name: string; game: string; type: string; price: string; currency: string; requires: string[] };

/** true / 1 / "1" / "true" / "yes" only — the string "false" is false, so is anything unknown. */
export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return ['1', 'true', 'yes'].includes(v.trim().toLowerCase());
  return false;
}

export function toInt(v: unknown): number | null {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,15}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

const text = (v: unknown, max = 500) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').trim().slice(0, max);
const price = (v: unknown) => {
  const d = parseDec(v);
  return d && d.n >= 0n ? decText(d) : null;
};
const rows = (data: unknown): Record<string, unknown>[] =>
  (Array.isArray(data) ? data : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r));

/** Every service the provider returned; a row without an id or a readable tariff is counted, not hidden silently. */
export function normalizeServices(data: unknown): { items: Service[]; skipped: number } {
  const all = rows(data);
  const items: Service[] = [];
  for (const r of all) {
    const id = toInt(r.service);
    const rate = price(r.rate);
    if (id === null || rate === null) continue;
    items.push({
      id,
      name: text(r.name) || `Xizmat #${id}`,
      type: text(r.type, 80) || 'Default',
      category: text(r.category, 200) || 'Boshqa',
      rate,
      min: toInt(r.min),
      max: toInt(r.max),
      refill: toBool(r.refill),
      cancel: toBool(r.cancel),
      dripfeed: toBool(r.dripfeed),
    });
  }
  return { items, skipped: (Array.isArray(data) ? data.length : 0) - items.length };
}

export function normalizeGifts(data: unknown): { items: Gift[]; skipped: number } {
  const items: Gift[] = [];
  for (const r of rows(data)) {
    const id = toInt(r.gift);
    const p = price(r.price);
    if (id === null || p === null) continue;
    items.push({ id, name: text(r.name) || `Sovg‘a #${id}`, price: p, stars: toInt(r.stars) });
  }
  return { items, skipped: (Array.isArray(data) ? data.length : 0) - items.length };
}

export function normalizeDonat(data: unknown): { items: DonatProduct[]; skipped: number } {
  const items: DonatProduct[] = [];
  for (const r of rows(data)) {
    const id = toInt(r.product);
    const p = price(r.price);
    if (id === null || p === null) continue;
    const requires = (Array.isArray(r.requires) ? r.requires : []).map((x) => text(x, 40)).filter((x) => /^[a-z_]{1,40}$/.test(x));
    items.push({
      id,
      name: text(r.name) || `Mahsulot #${id}`,
      game: text(r.game, 120) || 'Boshqa',
      type: text(r.type, 40) || 'topup',
      price: p,
      currency: text(r.currency, 8).toUpperCase() || 'UZS',
      requires,
    });
  }
  return { items, skipped: (Array.isArray(data) ? data.length : 0) - items.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Platforms (filters only — the provider's category stays as it is)
// ---------------------------------------------------------------------------------------------------------------
const PLATFORMS: [string, RegExp][] = [
  ['Instagram', /instagram|\binsta\b|\big\b/i],
  ['Telegram', /telegram|\btg\b/i],
  ['TikTok', /tik\s?tok/i],
  ['YouTube', /you\s?tube/i],
  ['Facebook', /facebook|\bfb\b/i],
  ['X / Twitter', /twitter|\bx\.com\b/i],
  ['Threads', /threads/i],
  ['Spotify', /spotify/i],
];

/** The platform of a service by its category, then its name; "Boshqa" when neither says. */
export function platformOf(s: Pick<Service, 'category' | 'name'>): string {
  for (const [name, re] of PLATFORMS) if (re.test(s.category)) return name;
  for (const [name, re] of PLATFORMS) if (re.test(s.name)) return name;
  return 'Boshqa';
}

// ---------------------------------------------------------------------------------------------------------------
// Order types (the documented ones; anything else is shown but not sent)
// ---------------------------------------------------------------------------------------------------------------
export type Adapter = 'default' | 'comments' | 'usernames' | 'hashtag' | 'subscription' | 'poll';

const ADAPTERS: Record<string, Adapter> = {
  default: 'default',
  customcomments: 'comments',
  mentionscustomlist: 'usernames',
  customlist: 'usernames',
  hashtagmentions: 'hashtag',
  mentionshashtag: 'hashtag',
  subscription: 'subscription',
  subscriptions: 'subscription',
  poll: 'poll',
};

/** The documented order type behind a provider "type", or null (then: visible, explained, never sent as Default). */
export function adapterOf(type: string): Adapter | null {
  return ADAPTERS[type.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

export const UNSUPPORTED_TYPE = (type: string) =>
  `“${type}” turi API hujjatida yo‘q — bu xizmatni bu yerdan berib bo‘lmaydi (noto‘g‘ri parametr bilan pul yechilmasligi uchun). Bot orqali bering.`;
export const SUBSCRIPTION_COST =
  'Obuna (Subscription) narxi qanday hisoblanishi hujjatda ko‘rsatilmagan — taxminiy narxni ko‘rsatib bo‘lmaydi, shuning uchun bu yerdan berilmaydi.';

// ---------------------------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------------------------
const HOSTS: Record<string, RegExp> = {
  Instagram: /(^|\.)instagram\.com$|(^|\.)instagr\.am$/,
  Telegram: /(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/,
  TikTok: /(^|\.)tiktok\.com$/,
  YouTube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
  Facebook: /(^|\.)facebook\.com$|(^|\.)fb\.(com|watch)$/,
  'X / Twitter': /(^|\.)(twitter|x)\.com$/,
  Threads: /(^|\.)threads\.(net|com)$/,
  Spotify: /(^|\.)spotify\.com$/,
};
const HANDLE = /^@?[A-Za-z0-9._]{2,64}$/;

/** A link (or, where the platform takes one, a @username) that fits the service's platform. */
export function checkTarget(target: string, platform: string): string | null {
  const t = target.trim();
  if (!t) return 'Havola (yoki foydalanuvchi nomi) kiritilmagan.';
  if (t.length > 500 || /\s/.test(t)) return 'Havolada bo‘sh joy bo‘lmasin (500 belgigacha).';
  if (/^https?:\/\//i.test(t)) {
    let url: URL;
    try {
      url = new URL(t);
    } catch {
      return 'Havola noto‘g‘ri.';
    }
    const host = url.hostname.toLowerCase();
    const want = HOSTS[platform];
    if (want && !want.test(host)) return `Bu ${platform} xizmati: ${platform} havolasini kiriting.`;
    return null;
  }
  if (HANDLE.test(t)) return null;
  return 'Havola https:// bilan boshlansin yoki @foydalanuvchi_nomi bo‘lsin.';
}

export const lines = (v: string) =>
  v
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------
// SMM order: validation, provider parameters, estimate
// ---------------------------------------------------------------------------------------------------------------
export type SmmInput = {
  link?: string;
  quantity?: number;
  comments?: string;
  usernames?: string;
  hashtag?: string;
  answerNumber?: number;
  username?: string;
  min?: number;
  max?: number;
  posts?: number;
  delay?: number;
  expiry?: string;
  runs?: number;
  interval?: number;
};

export type SmmPlan = { params: Record<string, string>; quantity: number; target: string; billed: number };

const inRange = (n: number | undefined, lo: number, hi: number) => n !== undefined && Number.isInteger(n) && n >= lo && n <= hi;

/** Validates the form for this service and returns what goes to the provider, or the Uzbek reason it cannot. */
export function planSmm(service: Service, input: SmmInput): { ok: true; plan: SmmPlan } | { ok: false; error: string } {
  const adapter = adapterOf(service.type);
  if (!adapter) return { ok: false, error: UNSUPPORTED_TYPE(service.type) };
  if (adapter === 'subscription') return { ok: false, error: SUBSCRIPTION_COST };
  const min = service.min ?? 1;
  const max = service.max ?? 10_000_000;
  const platform = platformOf(service);
  const base = { service: String(service.id) };

  const linkError = checkTarget(input.link ?? '', platform);
  if (linkError) return { ok: false, error: linkError };
  const link = (input.link ?? '').trim();

  const range = (q: number) =>
    q < min ? `Miqdor kamida ${min.toLocaleString('ru-RU')} bo‘lsin.` : q > max ? `Miqdor ko‘pi bilan ${max.toLocaleString('ru-RU')}.` : null;

  if (adapter === 'comments' || adapter === 'usernames') {
    const list = lines(adapter === 'comments' ? (input.comments ?? '') : (input.usernames ?? ''));
    if (!list.length) return { ok: false, error: adapter === 'comments' ? 'Izohlarni yozing — har qatorda bittadan.' : 'Foydalanuvchi nomlarini yozing — har qatorda bittadan.' };
    if (list.some((x) => x.length > 500)) return { ok: false, error: 'Bitta qator 500 belgidan oshmasin.' };
    const err = range(list.length);
    if (err) return { ok: false, error: `${err} (har qator — bitta)` };
    const field = adapter === 'comments' ? 'comments' : 'usernames';
    return { ok: true, plan: { params: { ...base, link, [field]: list.join('\n') }, quantity: list.length, target: link, billed: list.length } };
  }

  const quantity = input.quantity;
  if (!inRange(quantity, 1, 100_000_000)) return { ok: false, error: 'Miqdorni butun son bilan kiriting.' };
  const err = range(quantity!);
  if (err) return { ok: false, error: err };
  const params: Record<string, string> = { ...base, link, quantity: String(quantity) };

  if (adapter === 'hashtag') {
    const tag = (input.hashtag ?? '').trim();
    if (!/^#?[\p{L}\p{N}_]{1,100}$/u.test(tag)) return { ok: false, error: 'Hashtagni #teg ko‘rinishida yozing.' };
    params.hashtag = tag.startsWith('#') ? tag : `#${tag}`;
  }
  if (adapter === 'poll') {
    if (!inRange(input.answerNumber, 1, 100)) return { ok: false, error: 'Ovoz beriladigan javob raqamini kiriting (1, 2, 3…).' };
    params.answer_number = String(input.answerNumber);
  }
  let billed = quantity!;
  if (adapter === 'default' && (input.runs !== undefined || input.interval !== undefined)) {
    if (!service.dripfeed) return { ok: false, error: 'Bu xizmatda drip-feed yo‘q.' };
    if (!inRange(input.runs, 2, 1000) || !inRange(input.interval, 1, 10_080)) return { ok: false, error: 'Drip-feed: necha marta (2+) va oraliq (daqiqa) kiriting.' };
    params.runs = String(input.runs);
    params.interval = String(input.interval);
    billed = quantity! * input.runs!;
  }
  return { ok: true, plan: { params, quantity: quantity!, target: link, billed } };
}

/** The estimate of an SMM order — only with a verified quantity basis of the tariff; otherwise null. */
export function smmEstimate(service: Service, billed: number, unit: number | null): string | null {
  const rate = parseDec(service.rate);
  if (!rate || !unit || unit <= 0) return null;
  return decText(estimate(rate, BigInt(billed), BigInt(unit)));
}

/** Same tariff as reviewed (exactly, no float compare). */
export function samePrice(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parseDec(a);
  const y = parseDec(b);
  return !!x && !!y && decCmp(x, y) === 0;
}

export const enoughBalance = (balance: string | null, cost: string | null) => {
  const b = parseDec(balance);
  const c = parseDec(cost);
  return !b || !c ? null : decCmp(b, c) >= 0;
};

// ---------------------------------------------------------------------------------------------------------------
// Gifts and donat
// ---------------------------------------------------------------------------------------------------------------
export function checkTelegramUsername(v: string): string | null {
  return /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v.trim()) ? null : 'Telegram foydalanuvchi nomini @username ko‘rinishida kiriting.';
}

export function checkDonatFields(product: DonatProduct, fields: Record<string, string>): string | null {
  for (const f of product.requires) {
    const v = (fields[f] ?? '').trim();
    if (!v) return f === 'server_id' ? 'Server ID kiritilmagan.' : 'O‘yinchi ID kiritilmagan.';
    if (!/^[A-Za-z0-9_.:#-]{1,64}$/.test(v)) return `${f === 'server_id' ? 'Server ID' : 'O‘yinchi ID'} faqat harf, raqam va - _ . : # dan iborat bo‘lsin.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Statuses and errors in Uzbek (the provider's own word is kept beside it)
// ---------------------------------------------------------------------------------------------------------------
const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'Kutilmoqda', tone: 'neutral' },
  inprogress: { label: 'Bajarilmoqda', tone: 'info' },
  processing: { label: 'Bajarilmoqda', tone: 'info' },
  completed: { label: 'Bajarildi', tone: 'success' },
  partial: { label: 'Qisman bajarildi', tone: 'warning' },
  canceled: { label: 'Bekor qilindi', tone: 'danger' },
  cancelled: { label: 'Bekor qilindi', tone: 'danger' },
  refunded: { label: 'Mablag‘ qaytarildi', tone: 'warning' },
  failed: { label: 'Bajarilmadi — mablag‘ qaytarilgan', tone: 'danger' },
};
const FINAL = new Set(['completed', 'partial', 'canceled', 'cancelled', 'refunded', 'failed']);
const key = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function statusLabel(raw: string | null | undefined) {
  if (!raw) return { label: 'Holati hali olinmagan', tone: 'neutral' as const };
  return STATUS[key(raw)] ?? { label: raw, tone: 'neutral' as const };
}
export const isFinal = (raw: string | null | undefined) => FINAL.has(key(raw));
export const isCompleted = (raw: string | null | undefined) => key(raw) === 'completed';

export const MISSING_KEY = 'NeoSMM API kaliti sozlanmagan. Vercel’da server sirlariga NEOSMM_API_KEY qo‘shing.';

/** The provider's error in Uzbek; an unknown one is shown as it came (as text). */
export const UPSTREAM_SERVICE_ERROR =
  'NeoSMM’ning ta’minotchisi bu xizmatni qabul qilmadi (“Incorrect service ID”): xizmat ro‘yxatda ko‘rinsa ham, hozir NeoSMM tomonida ishlamayapti. Buyurtma qabul qilinmadi. Boshqa xizmatni tanlang yoki @neosmmbot ga yozing.';

export function translateError(message: string, retryAfter?: number | null): string {
  const raw = message.trim();
  // "Provider error: …" — NeoSMM passed the request on and its own supplier refused it (NeoSMM's own errors have no prefix).
  const upstream = /^provider error:\s*/i.test(raw);
  const m = raw.replace(/^provider error:\s*/i, '');
  if (upstream && /incorrect service|invalid service|service (is )?(disabled|not found|not active)/i.test(m)) return UPSTREAM_SERVICE_ERROR;
  if (retryAfter) return `Provayderda texnik ishlar: ${Math.max(1, Math.ceil(retryAfter / 60))} daqiqadan keyin qayta urinib ko‘ring.`;
  if (/invalid api key/i.test(m)) return 'NeoSMM API kaliti noto‘g‘ri yoki eskirgan.';
  if (/api access is disabled/i.test(m)) return 'NeoSMM hisobingiz uchun API o‘chirilgan.';
  if (/invalid service/i.test(m)) return 'Xizmat topilmadi yoki hozir faol emas.';
  if (/order failed, balance refunded/i.test(m)) return 'Buyurtma bajarilmadi, mablag‘ qaytarildi.';
  if (/insufficient (balance|funds)|not enough (funds|balance)/i.test(m)) return 'Balansda mablag‘ yetarli emas. Bot orqali to‘ldiring.';
  const min = /min(?:imum)? quantity is (\d+)/i.exec(m);
  if (min) return `Miqdor kamida ${min[1]} bo‘lishi kerak.`;
  const max = /max(?:imum)? quantity is (\d+)/i.exec(m);
  if (max) return `Miqdor ko‘pi bilan ${max[1]} bo‘lishi mumkin.`;
  if (/order not found|incorrect order/i.test(m)) return 'Buyurtma provayderda topilmadi.';
  if (/active order|already (have|has) (an? )?(active )?order|wait until .*order/i.test(m))
    return 'Shu havola uchun bu xizmatda tugamagan buyurtma bor (masalan bot orqali berilgan) — oldingisi tugashini kuting.';
  if (/link|url/i.test(m)) return `Havola provayder tomonidan qabul qilinmadi (“${m.slice(0, 160)}”).`;
  if (/invalid action/i.test(m)) return 'Provayder bu amalni tanimadi.';
  if (/donat service is temporarily unavailable/i.test(m)) return 'Donat vaqtincha yopiq. Keyinroq urinib ko‘ring.';
  return `${upstream ? 'NeoSMM ta’minotchisi' : 'Provayder'} javobi: ${m.slice(0, 300)}`;
}
