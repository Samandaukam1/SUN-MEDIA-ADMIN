/**
 * Universal memory search (§32), the pure part: which words of a question to look for, and how well a found record
 * matches. Only the rows the person may read are ever searched (their own session, row-level security); only the best
 * few, with their source, reach the model — never the whole database.
 */

/** Words that carry no subject ("nima kelishgandik", "o‘tgan oy", "bo‘yicha"). Compared without apostrophes. */
const STOP = new Set(
  (
    'nima nimalar nimani nimaga qanday qanaqa qachon qayerda qaysi kim kimga kimlar boyicha haqida uchun bilan va yoki ham edi ekan edik ' +
    'kelishgandik kelishdik kelishuv kelishib kelishganmiz gaplashgandik gaplashdik gapirgandik degandik dedik aytgandik yozgandik ' +
    'otgan oy oyda oyi hafta haftada kecha bugun ertaga yil yilda sunny biz bizning men mening meni u bu shu ushbu osha ular ' +
    'bor yoq qilgan qildik qilamiz qilish ayt aytib ber berib top topib eslat esla eslab qol korsat haqidagi boyichami narsa gap'
  ).split(' '),
);

/**
 * Up to five search stems: subject words without the endings that change ("videosi", "videoni" → "video"). Apostrophes
 * become `_` (one any-character in SQL `ilike`), so "o‘tgan" also finds "o'tgan". Letters and digits only: safe to put
 * into a PostgREST filter.
 */
export function searchTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
  const out: string[] = [];
  for (const word of words) {
    const bare = word.replace(/'/g, '');
    if (bare.length < 3 || STOP.has(bare)) continue;
    let cut = word.length;
    if (bare.length > 6) {
      let letters = 0;
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== "'") letters++;
        if (letters === 5) {
          cut = i + 1;
          break;
        }
      }
    }
    const term = word.slice(0, cut).replace(/'+$/, '').replace(/'/g, '_');
    if (term.replace(/_/g, '').length >= 3 && !out.includes(term)) out.push(term);
  }
  return out.slice(0, 5);
}

const pattern = (term: string) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.?'), 'iu');

/** How many of the terms a text contains. */
export function matches(text: string, terms: string[]): number {
  return terms.filter((t) => pattern(t).test(text)).length;
}

/** A short piece of the text around the first match. */
export function snippet(text: string, terms: string[], size = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  let at = -1;
  for (const t of terms) {
    const m = pattern(t).exec(flat);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  const start = Math.max(0, at - 70);
  const piece = flat.slice(start, start + size);
  return `${start > 0 ? '…' : ''}${piece}${start + size < flat.length ? '…' : ''}`;
}
