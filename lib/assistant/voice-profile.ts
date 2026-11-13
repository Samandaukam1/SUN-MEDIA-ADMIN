/**
 * Sunny 3.0's voice (pure, unit-tested): one mood per reply turned into SSML the Azure Uzbek neural voices really
 * support — <prosody rate|pitch|volume> and <break> — never an "express-as" style (uz-UZ voices have none). Basic
 * prosody cannot act like a person; it gives a brighter, a slower or a firmer delivery, and pauses where they help.
 *
 * Also: the owner's voice settings (voice, fallback voice, rate, pitch, on/off, monthly free-quota cap), the fixed
 * phrases whose audio may be cached (never a dynamic answer), and the cache key that binds audio to the exact voice,
 * mood, settings and text.
 */

export const MOODS = ['neutral', 'happy', 'excited', 'surprised', 'thinking', 'sad', 'mock_angry', 'annoyed', 'mischievous', 'sarcastic', 'sleepy', 'proud'] as const;
export type Mood = (typeof MOODS)[number];
export const MOOD_LABEL: Record<Mood, string> = {
  neutral: 'Oddiy',
  happy: 'Xursand',
  excited: 'Hayajonli',
  surprised: 'Hayron',
  thinking: 'O‘ychan',
  sad: 'Xafa',
  mock_angry: 'Soxta jahl',
  annoyed: 'Zerikkan',
  mischievous: 'Qitmir',
  sarcastic: 'Kinoyali',
  sleepy: 'Uyqusiragan',
  proud: 'Faxrli',
};

/** Offsets on top of the owner's base rate / pitch (percent), a volume, and pauses after sentences and commas (ms). */
type Shape = { rate: number; pitch: number; volume: number; sentence: number; comma: number };
const SHAPE: Record<Mood, Shape> = {
  neutral: { rate: 0, pitch: 0, volume: 0, sentence: 0, comma: 0 },
  happy: { rate: 5, pitch: 4, volume: 0, sentence: 0, comma: 0 },
  excited: { rate: 9, pitch: 7, volume: 5, sentence: 0, comma: 0 },
  surprised: { rate: 2, pitch: 9, volume: 0, sentence: 220, comma: 0 },
  thinking: { rate: -8, pitch: -3, volume: -5, sentence: 380, comma: 160 },
  sad: { rate: -10, pitch: -7, volume: -10, sentence: 300, comma: 120 },
  mock_angry: { rate: 3, pitch: -4, volume: 10, sentence: 250, comma: 0 },
  annoyed: { rate: -3, pitch: -5, volume: 0, sentence: 260, comma: 0 },
  mischievous: { rate: 6, pitch: 5, volume: 0, sentence: 230, comma: 90 },
  sarcastic: { rate: -4, pitch: 2, volume: 0, sentence: 320, comma: 120 },
  sleepy: { rate: -16, pitch: -8, volume: -15, sentence: 420, comma: 180 },
  proud: { rate: 0, pitch: 3, volume: 6, sentence: 150, comma: 0 },
};

/** The older widget styles map onto moods (an older cached page keeps working). */
export function moodOf(v: unknown): Mood {
  if (typeof v === 'string' && (MOODS as readonly string[]).includes(v)) return v as Mood;
  return v === 'qitmir' ? 'mischievous' : v === 'bright' ? 'happy' : v === 'soft' ? 'sleepy' : 'neutral';
}

export type VoiceSettings = {
  enabled: boolean;
  provider: 'azure' | 'gemini' | 'off';
  voice: string;
  fallbackVoice: string;
  /** Base rate and pitch in percent (Sunny's youthful, slightly thin voice: higher pitch, a touch quicker). */
  rate: number;
  pitch: number;
  /** Characters a month the voice may use (Azure F0 neural: 500 000 free); over it Sunny answers in text only. */
  monthlyChars: number;
  /** Going over the free quota (a paid Azure tier) only when the owner says so. */
  paidAllowed: boolean;
};

const VOICE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/;
const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : null);

/** Environment defaults (SUNNY_TTS_*, ASSISTANT_*), then the owner's saved settings; invalid values are ignored. */
export function voiceSettings(env: Record<string, string | undefined>, stored: unknown): VoiceSettings {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const voice = (v: unknown) => (typeof v === 'string' && VOICE.test(v.trim()) ? v.trim() : null);
  const pct = (v: unknown) => num(typeof v === 'string' ? v.replace('%', '') : v, -50, 60);
  const provider = (v: unknown) => (v === 'azure' || v === 'gemini' || v === 'off' ? v : null);
  return {
    enabled: bool(s.enabled) ?? bool(env.SUNNY_VOICE_ENABLED) ?? true,
    provider: provider(s.provider) ?? provider(env.SUNNY_TTS_PROVIDER) ?? 'azure',
    voice: voice(s.voice) ?? voice(env.ASSISTANT_VOICE) ?? 'uz-UZ-SardorNeural',
    fallbackVoice: voice(s.fallback_voice) ?? voice(env.SUNNY_TTS_FALLBACK_VOICE) ?? 'uz-UZ-MadinaNeural',
    rate: pct(s.rate) ?? pct(env.ASSISTANT_RATE) ?? 4,
    pitch: pct(s.pitch) ?? pct(env.ASSISTANT_PITCH) ?? 25,
    monthlyChars: num(s.monthly_chars, 0, 100_000_000) ?? num(env.SUNNY_TTS_MONTHLY_CHARS, 0, 100_000_000) ?? 500_000,
    paidAllowed: bool(s.paid_allowed) ?? bool(env.SUNNY_TTS_PAID_ALLOWED) ?? false,
  };
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Qitmir intensity 1–3 scales how far a playful mood moves from the base voice. */
export function prosodyFor(mood: Mood, base: { rate: number; pitch: number }, intensity = 2): { rate: string; pitch: string; volume: string; sentence: number; comma: number } {
  const s = SHAPE[mood];
  const k = mood === 'mischievous' || mood === 'sarcastic' || mood === 'mock_angry' ? [0.6, 1, 1.4][Math.min(3, Math.max(1, intensity)) - 1] : 1;
  return {
    rate: signed(Math.max(-40, Math.min(50, base.rate + s.rate * k))),
    pitch: signed(Math.max(-40, Math.min(60, base.pitch + s.pitch * k))),
    volume: signed(s.volume * k),
    sentence: Math.round(s.sentence * k),
    comma: Math.round(s.comma * k),
  };
}

/** SSML for one chunk: the mood's prosody, and pauses after sentences (longer after "!" / "?") and commas. */
export function moodSsml(text: string, o: { lang: string; voice: string; mood: Mood; base: { rate: number; pitch: number }; intensity?: number }): string {
  const p = prosodyFor(o.mood, o.base, o.intensity);
  let body = escapeXml(text);
  if (p.sentence) body = body.replace(/([.!?…])\s+(?=\S)/g, (_, end: string) => `${end}<break time="${Math.round(p.sentence * (end === '!' || end === '?' ? 1.25 : 1))}ms"/> `);
  if (p.comma) body = body.replace(/,\s+(?=\S)/g, `,<break time="${p.comma}ms"/> `);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${o.lang}"><voice name="${o.voice}"><prosody rate="${p.rate}" pitch="${p.pitch}" volume="${p.volume}">${body}</prosody></voice></speak>`;
}

/**
 * Short fixed phrases Sunny says again and again: their audio is cached (one synthesis, then $0). Only these — a reply
 * built from someone's data is never cached or shared.
 */
export const FIXED_PHRASES = [
  'Eshitaman!',
  'Ha, eshitaman.',
  'Qani, ayting.',
  'Shu yerdaman!',
  'Eshitaman, nima gap?',
  'Salom! Eshitaman.',
  'Salom! Nima yordam kerak?',
  'Assalomu alaykum! Eshitaman.',
  'Bo‘ldi.',
  'Tushunarli.',
  'Tayyor.',
  'Bir daqiqa.',
  'Vazifa bajarildi.',
  'Yaxshi, rahmat! Sizda nima gap — nima yordam kerak?',
  'Zo‘r, rahmat! Qanday yordam beray?',
];
const FIXED = new Set(FIXED_PHRASES.map((p) => p.toLowerCase()));
export const isFixedPhrase = (text: string) => FIXED.has(text.trim().toLowerCase());

/** Cache key: the provider, voice, every prosody setting, the mood, the spoken text and a version — never the wrong voice. */
export function voiceCacheKey(parts: { provider: string; voice: string; rate: number; pitch: number; mood: Mood; intensity: number; spoken: string; format: 'pcm' | 'mp3' }, hash: (s: string) => string): string {
  const id = hash(JSON.stringify({ v: 3, ...parts }));
  return `fixed/${parts.format}/${id}.${parts.format === 'mp3' ? 'mp3' : 'pcm'}`;
}

/** Free-quota guard: may this synthesis run? Over the cap, only with the owner's explicit paid permission. */
export function voiceAllowed(s: VoiceSettings, usedChars: number, chars: number): { ok: true } | { ok: false; reason: 'off' | 'quota' } {
  if (!s.enabled || s.provider === 'off') return { ok: false, reason: 'off' };
  if (!s.paidAllowed && usedChars + chars > s.monthlyChars) return { ok: false, reason: 'quota' };
  return { ok: true };
}

/** Speech recognition (server side): provider and monthly cap (Azure F0: 5 audio hours a month). */
export type SttSettings = { provider: 'gemini' | 'azure' | 'off'; monthlyMs: number; paidAllowed: boolean };
export function sttSettings(env: Record<string, string | undefined>): SttSettings {
  const p = env.SUNNY_STT_PROVIDER;
  const minutes = num(env.SUNNY_STT_MONTHLY_MINUTES, 0, 100_000);
  return { provider: p === 'azure' || p === 'off' ? p : 'gemini', monthlyMs: (minutes ?? 300) * 60_000, paidAllowed: bool(env.SUNNY_STT_PAID_ALLOWED) ?? false };
}
export const sttAllowed = (s: SttSettings, usedMs: number, ms: number) => s.provider !== 'off' && (s.paidAllowed || usedMs + ms <= s.monthlyMs);
