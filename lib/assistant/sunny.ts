/**
 * Sunny 2.0 decisions that need no AI and no network (pure, unit-tested): the model settings, which model answers a
 * question, how much of the conversation goes to the model, and the greetings Sunny answers on its own.
 *
 * Settings come from the server's environment (SUNNY_*) and may be overridden by the system owner in Sozlamalar →
 * Sunny AI (app_settings 'assistant.config'). Nothing here ever holds or sees the API key.
 */

export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high';
export type SunnyConfig = {
  /** AI answers on/off (exact commands and greetings keep working when off). */
  enabled: boolean;
  /** Everyday model and the one for genuinely complex requests. */
  primary: string;
  complex: string;
  /** Whether complex requests may go to the advanced model at all. */
  escalation: boolean;
  effort: Effort;
  /** Output cap for a conversational reply, and for an answer built from the system's data (lists of people, tasks). */
  maxOutput: number;
  maxOutputData: number;
  /** How many recent messages go to the model; older questions travel as a one-line summary each. */
  maxHistory: number;
  /** Rough cap on what one request sends (instructions + tools + conversation), in tokens. */
  maxInputTokens: number;
};

export const SUNNY_DEFAULTS: SunnyConfig = {
  enabled: true,
  primary: 'gpt-6-luna',
  complex: 'gpt-6.1-terra',
  escalation: true,
  effort: 'none',
  maxOutput: 240,
  maxOutputData: 700,
  maxHistory: 10,
  maxInputTokens: 16000,
};

const EFFORTS: Effort[] = ['none', 'minimal', 'low', 'medium', 'high'];
const MODEL = /^[\w.:-]{2,80}$/;
const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : null);
const model = (v: unknown): string | null => (typeof v === 'string' && MODEL.test(v.trim()) ? v.trim() : null);

/** Environment first (the deployment's defaults), then the owner's saved settings on top; invalid values are ignored. */
export function sunnyConfig(env: Record<string, string | undefined>, stored: unknown): SunnyConfig {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const pick = <T>(saved: T | null, fromEnv: T | null, fallback: T): T => saved ?? fromEnv ?? fallback;
  const effort = (v: unknown) => (typeof v === 'string' && EFFORTS.includes(v as Effort) ? (v as Effort) : null);
  return {
    enabled: pick(bool(s.enabled), bool(env.SUNNY_AI_ENABLED), SUNNY_DEFAULTS.enabled),
    primary: pick(model(s.primary), model(env.SUNNY_PRIMARY_MODEL), SUNNY_DEFAULTS.primary),
    complex: pick(model(s.complex), model(env.SUNNY_COMPLEX_MODEL), SUNNY_DEFAULTS.complex),
    escalation: pick(bool(s.escalation), bool(env.SUNNY_ESCALATION), SUNNY_DEFAULTS.escalation),
    effort: pick(effort(s.effort), effort(env.SUNNY_REASONING_EFFORT), SUNNY_DEFAULTS.effort),
    maxOutput: pick(int(s.max_output, 64, 4000), int(env.SUNNY_MAX_OUTPUT_TOKENS, 64, 4000), SUNNY_DEFAULTS.maxOutput),
    maxOutputData: pick(int(s.max_output_data, 64, 4000), int(env.SUNNY_MAX_OUTPUT_TOKENS_DATA, 64, 4000), SUNNY_DEFAULTS.maxOutputData),
    maxHistory: pick(int(s.max_history, 2, 40), int(env.SUNNY_MAX_HISTORY, 2, 40), SUNNY_DEFAULTS.maxHistory),
    maxInputTokens: pick(int(s.max_input_tokens, 2000, 200000), int(env.SUNNY_MAX_INPUT_TOKENS, 2000, 200000), SUNNY_DEFAULTS.maxInputTokens),
  };
}

const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ʻʼ’‘`']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Deeper reasoning is worth its price only for real analysis: comparing reports, multi-step planning, explaining causes,
 * long documents. Greetings, lookups and short commands always stay on the everyday model. No extra AI call decides
 * this — a local rule does, so the first word is not delayed.
 */
const COMPLEX = [
  /\b(tahlil qil|tahlil qilib ber|chuqur tahlil|batafsil tahlil|tahlilini (ber|qil))/,
  /\b(solishtir|taqqosla|qiyosla)/,
  /\b(strategiya(si|sini)? (tuz|ishlab chiq|yoz)|marketing rejasi(ni)? tuz|kontent strategiya)/,
  /\b(reja(sini)? tuz|bosqichma-bosqich|qadam-baqadam|yo‘l xarita|yol xarita)/,
  /\b(nima uchun|nega) .{0,60}(pasay|tush|kamay|oshdi|osh|ko‘pay|kopay|yomonlash)/,
  /\b(sabab(ini|larini)) .{0,30}(top|tahlil|tushuntir)/,
  /\b(prognoz|bashorat qil)/,
  /\b(byudjet(ni)? (taqsimla|hisobla|reja))/,
  // (\b is ASCII-only in JavaScript: Cyrillic words are matched without it.)
  /(проанализ|анализ|стратеги|сравни)/,
  /\b(analy[sz]e|compare|strategy|step[- ]by[- ]step)\b/,
];

export type ModelRoute = { tier: 'primary' | 'complex'; model: string; reason: string };

export function routeModel(text: string, audience: 'public' | 'staff' | 'client', cfg: SunnyConfig): ModelRoute {
  const primary = { tier: 'primary' as const, model: cfg.primary };
  // Site visitors get the fast sales conversation; the advanced model is for the team's (and partners') real analysis.
  if (audience === 'public' || !cfg.escalation || cfg.complex === cfg.primary) return { ...primary, reason: audience === 'public' ? 'public' : 'off' };
  const t = fold(text);
  if (t.length < 40) return { ...primary, reason: 'short' };
  const hit = COMPLEX.find((re) => re.test(t));
  if (hit) return { tier: 'complex', model: cfg.complex, reason: 'analysis' };
  // A long, multi-part request (several questions or a pasted document) also deserves the deeper model.
  const questions = (text.match(/\?/g) ?? []).length;
  if (t.length > 700 || (t.length > 280 && questions >= 3)) return { tier: 'complex', model: cfg.complex, reason: 'long' };
  return { ...primary, reason: 'everyday' };
}

export type Turn = { role: 'user' | 'assistant'; text: string };

/**
 * What of the conversation goes to the model: the last `maxHistory` messages (older Sunny replies shortened — the
 * person's own words are kept), within `budget` characters. Questions that no longer fit travel as `earlier` (one line
 * each), so the thread is kept without resending thousands of tokens. The conversation still starts with the person.
 */
export function compactHistory(history: Turn[], maxHistory: number, budget: number): { history: Turn[]; dropped: string[] } {
  let kept = history.slice(-maxHistory);
  const dropped = history.slice(0, history.length - kept.length).filter((m) => m.role === 'user').map((m) => m.text);
  kept = kept.map((m, i) => (m.role === 'assistant' && i < kept.length - 3 && m.text.length > 500 ? { ...m, text: `${m.text.slice(0, 480).trimEnd()} …` } : m));
  const size = () => kept.reduce((n, m) => n + m.text.length, 0);
  while (kept.length > 1 && size() > budget) {
    const gone = kept.shift()!;
    if (gone.role === 'user') dropped.push(gone.text);
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();
  // The latest question alone may still be too long for the budget: it is cut, never dropped.
  if (kept.length === 1 && kept[0].text.length > budget) kept[0] = { ...kept[0], text: kept[0].text.slice(0, budget) };
  return { history: kept, dropped: dropped.map((d) => d.slice(0, 300)) };
}

/** Rough token count of text (Latin Uzbek/English ≈ 3.6 characters per token; good enough for a cap, not for billing). */
export const roughTokens = (chars: number) => Math.ceil(chars / 3.6);

/**
 * A bare greeting or wake word is answered at once, without the AI (instant, free). Anything with a question or a
 * request in it goes to the AI as before. The reply follows the person's language.
 */
const GREET_UZ = /^(hey |salom |assalomu alaykum |assalom )?(sunny|sani|sanni|sunni)[!.,]*$|^(salom|assalomu alaykum|assalom|assalomu aleykum|salom alaykum|hayrli tong|xayrli tong|hayrli kun|xayrli kun|hayrli kech|xayrli kech)( sunny| sani| sunni)?[!.,]*$|^(sunny|sani|sunni),? (salom|assalomu alaykum)[!.,]*$/;
const HOW_UZ = /^((sunny|sani),? )?(qalaysan|qalaysiz|yaxshimisan|yaxshimisiz|ishlar qalay|nima gap|qanday ahvol(ing|ingiz)?)[?!.,]*$/;
const GREET_RU = /^(привет|здравствуй(те)?|добрый (день|вечер)|доброе утро)( sunny| санни)?[!.,]*$/;
const GREET_EN = /^(hi|hello|hey)( sunny)?[!.,]*$/;

export function greetingReply(text: string, audience: 'public' | 'staff' | 'client', seed = Date.now()): string | null {
  const t = fold(text);
  if (!t || t.length > 40) return null;
  const pick = (list: string[]) => list[Math.abs(Math.floor(seed / 1000)) % list.length];
  if (GREET_RU.test(t)) return audience === 'public' ? 'Здравствуйте! Я Sunny из SUN MEDIA. Чем помочь вашему бизнесу?' : 'Привет! Слушаю.';
  if (GREET_EN.test(t)) return audience === 'public' ? 'Hi! I’m Sunny from SUN MEDIA. How can we help your business?' : 'Hi! I’m listening.';
  if (HOW_UZ.test(t)) return pick(['Yaxshi, rahmat! Sizda nima gap — nima yordam kerak?', 'Zo‘r, rahmat! Qanday yordam beray?']);
  if (GREET_UZ.test(t)) {
    if (audience === 'public') return pick(['Salom! Men Sunny — SUN MEDIA yordamchisi. Biznesingiz haqida aytib bering, mos yechimni topamiz.', 'Assalomu alaykum! Sunny eshitadi. Biznesingiz uchun SMM, reklama yoki sayt kerakmi?']);
    return pick(['Salom! Eshitaman.', 'Salom! Nima yordam kerak?', 'Assalomu alaykum! Eshitaman.']);
  }
  return null;
}
