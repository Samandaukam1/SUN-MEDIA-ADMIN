/**
 * Text prepared for Sunny's voice, shared by the widget (where to cut a reply into spoken chunks) and the TTS route
 * (what the voice actually reads). Pure functions: no DOM, no server imports.
 */

export type SpeechLang = 'uz-UZ' | 'ru-RU' | 'en-US';

const UZ_CYRILLIC_WORDS = /(?<!\p{L})(ва|учун|билан|қанча|канча|нарх\p{L}*|салом|ассалому|хизмат\p{L}*|керак|менга|сизлар|қандай|кандай|йўқ|бўлади|тариф\p{L}*лар)(?!\p{L})/iu;
const UZ_LATIN_HINTS = /(o‘|o'|oʻ|g‘|g'|gʻ|(?<!\p{L})(va|bilan|uchun|siz|biz|qanday|qancha|kerak|bo‘ladi|xizmat\p{L}*|narx\p{L}*|salom|assalomu)(?!\p{L}))/iu;
const ENGLISH_HINTS = /(?<!\p{L})(the|is|are|you|your|what|how|do|does|much|price|cost|services?|hello|hi|can|need|want)(?!\p{L})/iu;

/** The language and script a visitor wrote in: the reply (and the voice reading it) follow it. */
export function textLanguage(text: string): { lang: SpeechLang; cyrillic: boolean } {
  if (/[Ѐ-ӿ]/.test(text)) return { lang: /[ўқғҳЎҚҒҲ]/.test(text) || UZ_CYRILLIC_WORDS.test(text) ? 'uz-UZ' : 'ru-RU', cyrillic: true };
  if (!UZ_LATIN_HINTS.test(text) && ENGLISH_HINTS.test(text)) return { lang: 'en-US', cyrillic: false };
  return { lang: 'uz-UZ', cyrillic: false };
}

const ONES = ['nol', 'bir', 'ikki', 'uch', 'to‘rt', 'besh', 'olti', 'yetti', 'sakkiz', 'to‘qqiz'];
const TENS = ['', 'o‘n', 'yigirma', 'o‘ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'to‘qson'];
const SCALES = ['', 'ming', 'million', 'milliard', 'trillion'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

function underThousand(n: number): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) words.push(...(h === 1 ? ['yuz'] : [ONES[h], 'yuz']));
  if (t) words.push(TENS[t]);
  if (o) words.push(ONES[o]);
  return words;
}

/** 1 500 000 → "bir million besh yuz ming" (literary Uzbek, the way a person reads a price aloud). */
export function uzNumber(n: number): string {
  if (!Number.isSafeInteger(n)) return String(n);
  if (n === 0) return ONES[0];
  if (n < 0) return `minus ${uzNumber(-n)}`;
  if (n >= 1e15) return String(n).split('').map((d) => ONES[Number(d)]).join(' ');
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const words: string[] = [];
  for (let scale = groups.length - 1; scale >= 0; scale--) {
    const g = groups[scale];
    if (!g) continue;
    // "ming", not "bir ming"; millions keep "bir".
    if (scale === 1 && g === 1) words.push('ming');
    else words.push(...underThousand(g), ...(scale ? [SCALES[scale]] : []));
  }
  return words.join(' ');
}

/** 25 → "yigirma beshinchi". */
export function uzOrdinal(n: number): string {
  const w = uzNumber(n);
  return /[aeiou]$/.test(w) ? `${w}nchi` : `${w}inchi`;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Uzbek Latin with numbers, dates, times, money and phones written out as words. */
function uzNumbersToWords(text: string): string {
  return (
    text
      // 25.10.2026 → yigirma beshinchi oktabr, ikki ming yigirma oltinchi yil
      .replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (m, d, mo, y) => {
        const month = MONTHS[Number(mo) - 1];
        return month && Number(d) >= 1 && Number(d) <= 31 ? `${uzOrdinal(Number(d))} ${month} ${uzOrdinal(Number(y))} yil` : m;
      })
      // 14:30 → o‘n to‘rt o‘ttiz
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h, mi) => (Number(mi) ? `${uzNumber(Number(h))} ${uzNumber(Number(mi))}` : uzNumber(Number(h))))
      // +998 90 123 45 67 → plyus to‘qqiz yuz to‘qson sakkiz, to‘qson, bir yuz yigirma uch…
      .replace(/\+?\d[\d\s()-]{7,}\d/g, (m) => {
        const groups = m.match(/\d+/g) ?? [];
        // A price is 1–3 digits then groups of three (150 000 000); a phone has a + or two-digit groups (90 123 45 67).
        const phone = digitsOf(m).length >= 9 && (m.startsWith('+') || groups.slice(1).some((g) => g.length !== 3));
        if (!phone) return m;
        return `${m.startsWith('+') ? 'plyus ' : ''}${groups.map((g) => (g.startsWith('0') ? g.split('').map((d) => ONES[Number(d)]).join(' ') : uzNumber(Number(g)))).join(', ')}`;
      })
      // 1 500 000 / 1.500.000 / 1,500,000 → one number
      .replace(/\b\d{1,3}(?:[   .,]\d{3})+\b/g, (m) => digitsOf(m))
      // 5-6 kun → besh-olti kun (a range, not an ordinal)
      .replace(/\b(\d+)\s*[-–]\s*(\d+)\b/g, (_, a, b) => `${uzNumber(Number(a))}–${uzNumber(Number(b))}`)
      // 3-bosqich, 2026-yil → uchinchi bosqich, ikki ming yigirma oltinchi yil
      .replace(/\b(\d+)-(?=\p{L})/gu, (_, n) => `${uzOrdinal(Number(n))} `)
      .replace(/\$\s?(\d+)/g, (_, n) => `${n} dollar`)
      .replace(/(\d)\s?(\$|USD\b)/g, '$1 dollar')
      .replace(/(\d)\s?UZS\b/g, '$1 so‘m')
      .replace(/(\d)\s?%/g, '$1 foiz')
      .replace(/(\d)\s?mln\b\.?/gi, '$1 million')
      .replace(/(\d)\s?mlrd\b\.?/gi, '$1 milliard')
      // 1,5 → bir butun o‘ndan besh
      .replace(/\b(\d+)[.,](\d{1,2})\b/g, (_, a, b) => `${uzNumber(Number(a))} butun ${b.length === 1 ? 'o‘ndan' : 'yuzdan'} ${uzNumber(Number(b))}`)
      .replace(/\d+/g, (n) => (n.length > 15 ? n.split('').map((d) => ONES[Number(d)]).join(' ') : uzNumber(Number(n))))
  );
}

/** Words the Uzbek voice would otherwise spell or mispronounce, written as they are said. */
const UZ_SAYS: [RegExp, string][] = [
  [/\bSUN\s*MEDIA\b/gi, 'San Media'],
  [/\bSMM\b/g, 'es-em-em'],
  [/\bCRM\b/g, 'si-ar-em'],
  [/\bAI\b/g, 'ey-ay'],
  [/\bPR\b/g, 'pi-ar'],
  [/\bIT\b/g, 'ay-ti'],
  [/\breels\b/gi, 'rils'],
  [/\bYouTube\b/gi, 'yutub'],
  [/\bva h\.k\./gi, 'va hokazo'],
  [/\bva b\./gi, 'va boshqalar'],
];

/**
 * What the voice reads: links become their label, URLs and markdown disappear, emoji are dropped, and in Uzbek Latin
 * numbers become words, the brand is "San Media" and oʻ/gʻ use the official letter (U+02BB) whatever was typed.
 */
export function speakable(text: string, lang: SpeechLang = 'uz-UZ'): string {
  let t = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(^|\s)\/([a-z][\w-]*)/gi, '$1$2')
    .replace(/(\p{L})\/(\p{L})/gu, '$1 $2')
    .replace(/(^|\s)@([\w.]+)/g, (_, s, h) => `${s}${h.replace(/[._]/g, ' ')}`)
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[*_#`>|~]/g, '')
    .replace(/&/g, lang === 'uz-UZ' ? ' va ' : lang === 'ru-RU' ? ' и ' : ' and ')
    // Lines (list items) become sentences, so the voice pauses between them instead of running them together.
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-•–]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l, i, all) => (i < all.length - 1 && !/[.!?…:;,]$/.test(l) ? `${l}.` : l))
    .join(' ');

  const cyrillic = /[Ѐ-ӿ]/.test(t);
  if (lang === 'uz-UZ' && !cyrillic) {
    t = uzNumbersToWords(t);
    for (const [re, said] of UZ_SAYS) t = t.replace(re, said);
    t = t.replace(/([oOgG])['‘’`ʼ]/g, '$1ʻ');
  } else if (cyrillic) {
    t = t.replace(/\bSUN\s*MEDIA\b/gi, 'Сан Медиа');
  }
  return t.replace(/\s+/g, ' ').trim();
}

const SENTENCE_END = /[.!?…]["»”')\]]*\s|\n/g;

/**
 * The first finished sentence of a reply that is still arriving (≥ `min` characters, followed by more text), so the
 * voice can start on it while the rest is written. A long first sentence is cut at a comma instead. Null until then.
 */
export function firstSentence(text: string, min = 24): string | null {
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
    const end = m.index + m[0].length;
    if (end >= min && text.slice(0, end).trim()) return text.slice(0, end);
  }
  if (text.length > 140) {
    const comma = /[,;:—]\s/g;
    for (let m = comma.exec(text); m; m = comma.exec(text)) if (m.index >= 60) return text.slice(0, m.index + m[0].length);
  }
  return null;
}

/** The rest of a reply in chunks of at most `max` characters, cut between sentences (one request per chunk). */
export function speechChunks(text: string, max = 600): string[] {
  const sentences = text.match(/[^.!?…\n]+(?:[.!?…]+["»”')\]]*|\n|$)/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && (current + s).length > max) {
      chunks.push(current.trim());
      current = '';
    }
    current += s;
    while (current.length > max) {
      chunks.push(current.slice(0, max).trim());
      current = current.slice(max);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => /\p{L}|\d/u.test(c));
}
