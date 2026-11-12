/**
 * Sifat tekshiruvchi (sof mantiq): faktlar, taqiqlar, boshqa profil ma'lumoti aralashuvi, takrorlanish, imlo belgilari,
 * rasm ustidagi matn, story tuzilmasi, caption chegaralari. "fail" — tasdiqqa chiqmaydi; "warn" — ko'rsatiladi.
 */
import { similarity, type AgentKind } from './core';
import type { RecentItem } from './creative';

export type QaIssue = { code: string; level: 'fail' | 'warn'; msg: string };
export type QaReport = { passed: boolean; issues: QaIssue[]; checked: string[] };

export type QaInput = {
  kind: AgentKind;
  language: string;
  framesExpected: number;
  frames: { headline: string; body: string; cta: string; warnings?: string[] }[];
  caption: string;
  hashtags: string;
  title: string;
  /** Raqamli da'volar faqat shu matnlarda bo'lsa ruxsat (faktlar, narx manbasi, afzalliklar, mahsulotlar, xotiradagi faktlar). */
  allowedText: string;
  forbidden: string;
  ownPhone: string | null;
  /** Boshqa profillarning nomi, username, telefoni — matnda uchramasligi kerak. */
  others: { name: string; username: string | null; phone: string | null }[];
  recent: RecentItem[];
  notes: string[];
};

/** Fixable: kopirayter bir marta qayta yozib tuzata oladigan xatolar. */
export const FIXABLE = new Set(['unverified_number', 'unverified_guarantee', 'forbidden_phrase', 'text_overflow', 'missing_cta', 'cyrillic_mixed', 'foreign_phone', 'duplicate_topic', 'caption_long', 'cross_profile']);

const NUMBER_CLAIM = /(\d[\d\s.,]*)\s*(%|foiz|so['ʻ’]m|sum|сум|\$|dollar|ming|mln|million|kun(?:da|lik)?|soat(?:da)?|yil(?:lik)?|marta|oy(?:lik)?)/gi;
const digitsOf = (s: string) => s.replace(/\D/g, '');

export function checkContent(i: QaInput): QaReport {
  const issues: QaIssue[] = [];
  const add = (code: string, level: QaIssue['level'], msg: string) => issues.push({ code, level, msg });
  const overlay = i.frames.map((f) => `${f.headline} ${f.body} ${f.cta}`).join(' \n ');
  const all = `${overlay}\n${i.caption}\n${i.hashtags}`;
  const low = all.toLowerCase();
  const allowedDigits = new Set((i.allowedText.match(/\d[\d\s.,]*/g) ?? []).map(digitsOf).filter(Boolean));

  // 1) Taqiqlangan ibora
  for (const phrase of i.forbidden.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3))
    if (low.includes(phrase)) add('forbidden_phrase', 'fail', `Taqiqlangan ibora: «${phrase}»`);

  // 2) O'ylab topilgan raqamli da'vo (narx, foiz, muddat …)
  for (const m of all.matchAll(NUMBER_CLAIM)) {
    const d = digitsOf(m[1]);
    if (d && !allowedDigits.has(d)) add('unverified_number', 'fail', `Brifda yo‘q raqamli da’vo: «${m[0].trim()}»`);
  }
  if (/(kafolat|garantiya|гарантия)/i.test(all) && !/(kafolat|garantiya|гарантия)/i.test(i.allowedText)) add('unverified_guarantee', 'fail', 'Brifda bo‘lmagan kafolat haqida yozilgan');
  if (/(mijozlarimiz(ning)? fikri|mijozimiz aytdi|sharhlar(imiz)?|отзыв)/i.test(all)) add('testimonial', 'warn', 'Mijoz fikri tilga olingan — haqiqiy manbasini tekshiring');
  if (/(eng yaxshi|eng arzon|№\s?1|#1\b|100\s?% sifat|raqobatsiz)/i.test(all)) add('superlative', 'warn', 'Asossiz maqtov iborasi');
  if (/(trend|hozir hamma|tadqiqotlar ko['ʻ’]rsat)/i.test(all)) add('trend_claim', 'warn', 'Trend yoki tadqiqotga da’vo — manbasi bo‘lmasa olib tashlang');

  // 3) Boshqa profil ma'lumoti aralashmasin
  for (const o of i.others) {
    const marks = [o.name.length >= 4 ? o.name : null, o.username, o.phone && digitsOf(o.phone).length >= 9 ? o.phone : null].filter((x): x is string => !!x);
    for (const mark of marks) {
      const hit = mark === o.phone ? digitsOf(all).includes(digitsOf(mark)) : low.includes(mark.toLowerCase());
      if (hit) add('cross_profile', 'fail', `Boshqa profil ma’lumoti aralashgan: «${mark}»`);
    }
  }
  const own = digitsOf(i.ownPhone ?? '');
  for (const m of all.matchAll(/\+?\d[\d\s\-()]{8,}\d/g)) {
    const d = digitsOf(m[0]);
    if (d.length >= 9 && (!own || !(d.endsWith(own.slice(-9)) || own.endsWith(d.slice(-9))))) add('foreign_phone', 'fail', `Begona telefon raqami: ${m[0].trim()}`);
  }

  // 4) Takrorlanish (oxirgi 30 kun)
  const head = i.frames[0]?.headline ?? '';
  const dup = i.recent.find((r) => similarity(i.title, r.title) >= 0.6 || r.headlines.some((h) => h && similarity(head, h) >= 0.7));
  if (dup) add('duplicate_topic', 'fail', `Oxirgi 30 kunda o‘xshash material bor: «${dup.title}» (${dup.date})`);

  // 5) Rasm ustidagi matn
  i.frames.forEach((f, n) => {
    if (f.warnings?.includes('text_overflow')) add('text_overflow', 'fail', `${n + 1}-kadrda matn sig‘madi — qisqartirish kerak`);
    if (f.warnings?.includes('low_contrast_fixed')) add('low_contrast', 'warn', `${n + 1}-kadr: brend matn rangi fonda o‘qilmasdi, avtomatik tuzatildi`);
    if (!f.headline.trim()) add('empty_headline', 'fail', `${n + 1}-kadrda sarlavha yo‘q`);
  });
  if (i.notes.includes('no_logo')) add('no_logo', 'warn', 'Logotip yuklanmagan — brend nomi matn bilan yozildi');
  if (i.notes.includes('product_photo_missing')) add('product_photo_missing', 'warn', 'Mahsulot fotosurati yo‘q — tipografik dizayn ishlatildi (Fayllar bo‘limiga rasm yuklang)');

  // 6) Yozuv
  if (i.language === 'uz' && /[Ѐ-ӿ]/.test(all)) add('cyrillic_mixed', 'fail', 'Lotin matnda kirill harflari bor');
  if (/\s[,.!?:;]/.test(all)) add('punct_space', 'warn', 'Tinish belgisi oldida bo‘sh joy');
  if (/\b(\p{L}{3,})\s+\1\b/iu.test(all)) add('double_word', 'warn', 'Ketma-ket takrorlangan so‘z');

  // 7) Tuzilma
  if (i.kind === 'story') {
    if (!i.frames.at(-1)?.cta.trim()) add('missing_cta', 'fail', 'Oxirgi kadrda harakatga chaqiriq yo‘q');
    if (i.frames.length !== i.framesExpected) add('frame_count', 'warn', `Kadrlar soni ${i.frames.length}, profilda ${i.framesExpected} belgilangan`);
  } else {
    if (!i.caption.trim()) add('missing_caption', 'fail', 'Caption bo‘sh');
    if (i.caption.length > 2200) add('caption_long', 'fail', 'Caption 2200 belgidan uzun (Instagram chegarasi)');
    if ((i.hashtags.match(/#/g) ?? []).length > 30) add('hashtags', 'fail', '30 tadan ko‘p heshteg (Instagram chegarasi)');
  }

  // Bir xil xabar bir martadan
  const seen = new Set<string>();
  const unique = issues.filter((x) => (seen.has(x.code + x.msg) ? false : (seen.add(x.code + x.msg), true)));
  return {
    passed: !unique.some((x) => x.level === 'fail'),
    issues: unique,
    checked: ['taqiqlar', 'raqamli da’volar', 'boshqa profil', 'takrorlanish', 'rasm ustidagi matn', 'yozuv', 'tuzilma'],
  };
}
