import { normalize } from './intents';
import { matches, searchTerms } from './recall';

/**
 * Automatic memory suggestions (pure): a sentence that states a lasting habit or preference of the person ("men
 * postlarni doim kechqurun joylayman", "menga qisqa hisobot yoqadi") is offered for remembering — Sunny asks, and only
 * the person's "ha" saves it. Questions, jokes, quotes, commands, secrets and one-off plans are never offered; a
 * duplicate of a saved note is not offered again, and a note on the same topic is offered as a replacement.
 */
export type MemoryCandidate = { text: string; confidence: number; replaces?: { id: string; body: string } };
export type SavedNote = { id: string; body: string };

/** Offered only at or above this confidence. */
export const SUGGEST_AT = 0.7;

const FIRST_PERSON = /(^| )(men|menga|meni|mening|biz|bizga|bizni|bizning|ozim|ozimga)( |$)/u;
const RULES: [RegExp, number][] = [
  [/(^| )(har doim|doim|doimo|hamisha|odatda|har safar)( |$)/u, 0.8],
  [/(afzal koraman|afzal koramiz|yoqtiraman|yoqtiramiz|yoqtirmayman|yoqtirmaymiz)( |$)/u, 0.8],
  [/(menga|bizga) .*(yoqadi|yoqmaydi|maqul|qulay|kerak emas)( |$)/u, 0.75],
  [/(meni|menga) .* deb (chaqir|murojaat qil|ata)/u, 0.85],
];
const NOT_LASTING = [
  /\?$/u, // a question
  /(haha|hihi|xaxa|hazil|prikol|😂|🤣|😆)/u, // a joke
  /^(eslab qol|unut|esla)/u, // an explicit command: the AI handles it
  /(bugun|ertaga|indinga|hozir|kecha|shu hafta|keyingi hafta)( |$)/u, // a one-off plan, not a habit
  /\d{6,}/u, // numbers that look like phones, cards, documents
  /(parol|password|пароль|karta|pasport|login)/u, // secrets
];

const HOW = /^(har|doim|odatd|hamis|safar|yoqad|yoqti|yoqma|afzal|maqul|qulay|kerak)/u;
const words = (s: string) => s.split(' ').filter(Boolean).length;

export function memoryCandidate(message: string, saved: SavedNote[] = []): MemoryCandidate | null {
  const raw = message.trim().replace(/^(sunny|sunni|sanni)[,! ]+/iu, '');
  if (raw.length < 12 || raw.length > 220 || /["«»“”]/u.test(raw)) return null;
  const t = normalize(raw);
  if (words(t) < 3 || words(t) > 32 || !FIRST_PERSON.test(t)) return null;
  if (NOT_LASTING.some((re) => re.test(t) || re.test(raw.toLowerCase()))) return null;
  const confidence = Math.max(0, ...RULES.filter(([re]) => re.test(t)).map(([, c]) => c));
  if (confidence < SUGGEST_AT) return null;

  const text = raw.replace(/[.!\s]+$/u, '');
  // The topic words only: "doim", "yoqadi" say how, not what.
  const terms = searchTerms(text).filter((w) => !HOW.test(w));
  let replaces: SavedNote | undefined;
  for (const n of saved) {
    const a = normalize(n.body);
    if (a === t || a.includes(t) || t.includes(a)) return null; // already remembered
    const shared = terms.length ? matches(n.body, terms) : 0;
    if (shared >= Math.max(2, Math.ceil(terms.length * 0.8))) return null; // the same thing in other words
    if (shared >= 2 && !replaces) replaces = n; // the same topic, said differently now: a correction
  }
  return { text, confidence, ...(replaces ? { replaces } : {}) };
}

/** Sunny's question after its reply. */
export const suggestionLine = (c: MemoryCandidate) =>
  c.replaces ? `Avval «${c.replaces.body}» deb eslab qolgan edim — yangisiga almashtiraymi?` : 'Bu doimiy odatingizga o‘xshaydi — eslab qolaymi?';
