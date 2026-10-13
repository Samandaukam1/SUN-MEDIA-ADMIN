/**
 * The interview with a prospective client. Read each question to them, tick what fits; when nothing fits, type
 * their own words. Keys are stored with the answers, so labels can be reworded later without losing history
 * (every analysis also keeps the labels it was given).
 */

export type Option = { key: string; label: string };
export type Question = {
  key: string;
  title: string;
  /** What to say to the client, in plain words. */
  ask: string;
  hint?: string;
  multiple?: boolean;
  /** Up to this many options (multiple choice only). */
  max?: number;
  options: Option[];
};

export const QUESTIONS: Question[] = [
  {
    key: 'business',
    title: 'Biznes turi',
    ask: 'Biznesingiz nima bilan shug‘ullanadi?',
    options: [
      { key: 'food', label: 'Restoran, kafe, fast-food' },
      { key: 'production', label: 'Ishlab chiqarish (oziq-ovqat, FMCG)' },
      { key: 'retail', label: 'Savdo, do‘kon, onlayn do‘kon' },
      { key: 'beauty', label: 'Go‘zallik, salon, klinika' },
      { key: 'education', label: 'Ta’lim, kurslar' },
      { key: 'real_estate', label: 'Ko‘chmas mulk, qurilish' },
      { key: 'services', label: 'Xizmat ko‘rsatish (B2B, logistika, sayohat…)' },
      { key: 'personal', label: 'Shaxsiy brend (ekspert, bloger, shifokor…)' },
    ],
  },
  {
    key: 'goal',
    title: 'Asosiy maqsad',
    ask: 'Biz bilan ishlashdan eng avvalo nimani kutyapsiz?',
    hint: '3 tagacha tanlang — eng muhimini birinchi.',
    multiple: true,
    max: 3,
    options: [
      { key: 'sales', label: 'Sotuvni oshirish' },
      { key: 'leads', label: 'Ko‘proq so‘rov/lid olish' },
      { key: 'awareness', label: 'Brendni tanitish' },
      { key: 'personal_brand', label: 'Shaxsiy brend qurish' },
      { key: 'followers', label: 'Obunachilarni ko‘paytirish' },
      { key: 'launch', label: 'Yangi mahsulot / filial ochilishi' },
      { key: 'image', label: 'Profilni chiroyli, professional qilish' },
    ],
  },
  {
    key: 'current',
    title: 'Hozirgi holat',
    ask: 'Instagram sahifangiz hozir qanday holatda?',
    options: [
      { key: 'none', label: 'Sahifa yo‘q' },
      { key: 'inactive', label: 'Bor, lekin deyarli post qilinmaydi' },
      { key: 'self', label: 'O‘zimiz muntazam post qilamiz' },
      { key: 'freelancer', label: 'SMM mutaxassis / freelancer yuritadi' },
      { key: 'agency', label: 'Boshqa agentlik bilan ishlaganmiz' },
    ],
  },
  {
    key: 'followers',
    title: 'Obunachilar soni',
    ask: 'Hozir taxminan nechta obunachingiz bor?',
    options: [
      { key: 'lt1k', label: '1 000 dan kam' },
      { key: '1k_5k', label: '1 000 – 5 000' },
      { key: '5k_20k', label: '5 000 – 20 000' },
      { key: '20k_100k', label: '20 000 – 100 000' },
      { key: 'gt100k', label: '100 000 dan ko‘p' },
    ],
  },
  {
    key: 'past',
    title: 'Avvalgi tajriba',
    ask: 'Ilgari SMM yoki reklama qilganmisiz? Natija qanday bo‘ldi?',
    options: [
      { key: 'never', label: 'Hech qilmaganmiz' },
      { key: 'good', label: 'Qilganmiz, natija yaxshi edi' },
      { key: 'weak', label: 'Qilganmiz, natija bo‘lmadi' },
      { key: 'bought', label: 'Obunachi sotib olingan (nakrutka)' },
      { key: 'ads_only', label: 'Faqat target reklama berganmiz' },
    ],
  },
  {
    key: 'audience',
    title: 'Mijozlari kim',
    ask: 'Sizning mijozlaringiz kimlar?',
    multiple: true,
    max: 4,
    options: [
      { key: 'young', label: 'Yoshlar (18–24)' },
      { key: 'adults', label: '25–34 yosh' },
      { key: 'mature', label: '35 yoshdan katta' },
      { key: 'women', label: 'Asosan ayollar' },
      { key: 'men', label: 'Asosan erkaklar' },
      { key: 'b2b', label: 'Kompaniyalar (B2B)' },
      { key: 'tashkent', label: 'Toshkent' },
      { key: 'regions', label: 'Viloyatlar' },
    ],
  },
  {
    key: 'platforms',
    title: 'Platformalar',
    ask: 'Qaysi tarmoqlarda bo‘lishni xohlaysiz?',
    multiple: true,
    options: [
      { key: 'instagram', label: 'Instagram' },
      { key: 'telegram', label: 'Telegram' },
      { key: 'tiktok', label: 'TikTok' },
      { key: 'youtube', label: 'YouTube' },
      { key: 'facebook', label: 'Facebook' },
    ],
  },
  {
    key: 'content',
    title: 'Kontent turi',
    ask: 'Qanday kontent kerak deb o‘ylaysiz?',
    multiple: true,
    options: [
      { key: 'reels', label: 'Reels / qisqa videolar' },
      { key: 'posts', label: 'Fotopost va dizayn' },
      { key: 'stories', label: 'Har kungi Story' },
      { key: 'shooting', label: 'Professional syomka' },
      { key: 'bloggers', label: 'Blogerlar bilan hamkorlik' },
      { key: 'ads', label: 'Target reklama' },
      { key: 'unsure', label: 'Bilmayman — siz maslahat bering' },
    ],
  },
  {
    key: 'ads_budget',
    title: 'Reklama byudjeti',
    ask: 'Reklamaga (Instagram/Facebook) oyiga qancha ajrata olasiz?',
    options: [
      { key: 'none', label: 'Hozircha yo‘q' },
      { key: 'lt300', label: '300$ gacha' },
      { key: '300_1000', label: '300 – 1 000$' },
      { key: '1000_3000', label: '1 000 – 3 000$' },
      { key: 'gt3000', label: '3 000$ dan ko‘p' },
    ],
  },
  {
    key: 'service_budget',
    title: 'Xizmat byudjeti',
    ask: 'Bizning xizmatlarimizga oyiga qancha byudjet rejalashtirgansiz?',
    options: [
      { key: 'lt500', label: '500$ gacha' },
      { key: '500_1000', label: '500 – 1 000$' },
      { key: '1000_1500', label: '1 000 – 1 500$' },
      { key: '1500_2500', label: '1 500 – 2 500$' },
      { key: 'gt2500', label: '2 500$ dan ko‘p' },
      { key: 'unknown', label: 'Hali aniq emas' },
    ],
  },
  {
    key: 'timeline',
    title: 'Natija muddati',
    ask: 'Birinchi sezilarli natijani qachon kutyapsiz?',
    options: [
      { key: '1m', label: '1 oy ichida' },
      { key: '3m', label: '3 oy ichida' },
      { key: '6m', label: '6 oy ichida' },
      { key: 'long', label: 'Uzoq muddatli hamkorlik' },
    ],
  },
  {
    key: 'success',
    title: 'Qanday natija ko‘nglini to‘ldiradi',
    ask: 'Qaysi natijani ko‘rsangiz “ish bo‘ldi” deysiz?',
    multiple: true,
    max: 3,
    options: [
      { key: 'orders', label: 'Zakaz va sotuvlar ko‘paydi' },
      { key: 'leads', label: 'Qo‘ng‘iroq/so‘rovlar ko‘paydi' },
      { key: 'followers', label: 'Obunachilar o‘sdi' },
      { key: 'reach', label: 'Ko‘rishlar va qamrov o‘sdi' },
      { key: 'beauty', label: 'Profil chiroyli va professional' },
      { key: 'recognition', label: 'Odamlar brendni taniy boshladi' },
    ],
  },
  {
    key: 'involvement',
    title: 'Kontentda ishtirok',
    ask: 'Videolarda kim qatnasha oladi?',
    options: [
      { key: 'owner', label: 'Rahbarning o‘zi (yuzi bilan)' },
      { key: 'staff', label: 'Xodimlar' },
      { key: 'product', label: 'Faqat mahsulot / joy' },
      { key: 'actors', label: 'Model/aktyor kerak' },
      { key: 'unsure', label: 'Hali bilmaymiz' },
    ],
  },
  {
    key: 'competitors',
    title: 'Raqobatchilar',
    ask: 'Kimni o‘zingizga raqobatchi yoki namuna deb bilasiz?',
    hint: 'Nomlarini yoki Instagram manzilini “o‘zim yozaman” maydoniga yozing.',
    options: [
      { key: 'known', label: 'Bor — nomini aytdi' },
      { key: 'unknown', label: 'Bilmaydi' },
      { key: 'none', label: 'Raqobatchi yo‘q deb hisoblaydi' },
    ],
  },
  {
    key: 'wishes',
    title: 'Qo‘shimcha istaklar',
    ask: 'Yana nima muhim? Nimadan qo‘rqasiz yoki nimani albatta xohlaysiz?',
    hint: 'Mijozning o‘z so‘zlarini yozing.',
    options: [
      { key: 'fast_reply', label: 'Tez aloqa va hisobot' },
      { key: 'quality', label: 'Sifat birinchi o‘rinda' },
      { key: 'price', label: 'Narx muhim' },
      { key: 'trust', label: 'Avval ishonch hosil qilmoqchi (sinov)' },
    ],
    multiple: true,
  },
];

export type Answer = { options: string[]; custom: string };
export type Answers = Record<string, Answer>;

export function isAnswered(a: Answer | undefined): boolean {
  return !!a && (a.options.length > 0 || a.custom.trim().length > 0);
}

/** Answers turned into readable lines (what the AI and the history see). */
export function readableAnswers(answers: Answers): { question: string; answer: string }[] {
  return QUESTIONS.filter((q) => isAnswered(answers[q.key])).map((q) => {
    const a = answers[q.key]!;
    const picked = a.options.map((k) => q.options.find((o) => o.key === k)?.label).filter(Boolean) as string[];
    const parts = [...picked, ...(a.custom.trim() ? [`O‘z so‘zlari: ${a.custom.trim()}`] : [])];
    return { question: q.ask, answer: parts.join('; ') };
  });
}

/** Keeps only known questions and options, de-duplicated, within limits; custom text trimmed to 1000 characters. */
export function cleanAnswers(input: unknown): Answers {
  const out: Answers = {};
  if (!input || typeof input !== 'object') return out;
  for (const q of QUESTIONS) {
    const raw = (input as Record<string, unknown>)[q.key] as { options?: unknown; custom?: unknown } | undefined;
    if (!raw || typeof raw !== 'object') continue;
    const valid = new Set(q.options.map((o) => o.key));
    let options = Array.isArray(raw.options) ? [...new Set(raw.options.filter((k): k is string => typeof k === 'string' && valid.has(k)))] : [];
    if (!q.multiple) options = options.slice(0, 1);
    if (q.max) options = options.slice(0, q.max);
    const custom = typeof raw.custom === 'string' ? raw.custom.trim().slice(0, 1000) : '';
    if (options.length || custom) out[q.key] = { options, custom };
  }
  return out;
}
