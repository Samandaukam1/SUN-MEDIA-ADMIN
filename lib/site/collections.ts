/**
 * The lists edited in "Sayt" (services, cases, partners…): one description drives the editor UI and the
 * server-side validation. Field keys are the table's column names. No server-only imports — the editor uses it too.
 */

export type SiteFieldType = 'text' | 'textarea' | 'url' | 'image' | 'gallery' | 'list' | 'results' | 'icon' | 'partner' | 'boolean' | 'year' | 'slug';

export type SiteField = {
  key: string;
  label: string;
  type: SiteFieldType;
  required?: boolean;
  max?: number;
  items?: number;
  hint?: string;
  placeholder?: string;
  rows?: number;
  half?: boolean;
};

export type SiteCollectionKey = 'services' | 'cases' | 'partners' | 'testimonials' | 'stats' | 'benefits' | 'steps' | 'faqs';

export type SiteCollection = {
  key: SiteCollectionKey;
  table: `site_${SiteCollectionKey}`;
  title: string;
  description: string;
  addLabel: string;
  emptyText: string;
  fields: SiteField[];
  /** Column shown as the row title / subtitle / thumbnail in the list. */
  primary: string;
  secondary?: string;
  thumb?: string;
  /** Storage folder for this list's images. */
  folder: string;
};

export const SITE_COLLECTIONS: Record<SiteCollectionKey, SiteCollection> = {
  services: {
    key: 'services',
    table: 'site_services',
    title: 'Xizmatlar',
    description: 'Bosh sahifadagi kartalar va “Xizmatlar” sahifasi. Har bir xizmat ariza formasida tanlov sifatida ham chiqadi.',
    addLabel: 'Xizmat qo‘shish',
    emptyText: 'Hali xizmat yo‘q.',
    primary: 'title',
    secondary: 'summary',
    folder: 'services',
    fields: [
      { key: 'title', label: 'Nomi', type: 'text', required: true, max: 80, placeholder: 'Foto va video syomka' },
      { key: 'icon', label: 'Belgi', type: 'icon', half: true },
      { key: 'summary', label: 'Qisqa tavsif (karta)', type: 'textarea', required: true, max: 300, rows: 3 },
      { key: 'details', label: 'Batafsil (Xizmatlar sahifasi)', type: 'textarea', max: 2000, rows: 5 },
      { key: 'bullets', label: 'Nimalar kiradi', type: 'list', items: 8, max: 80, hint: 'Har biri alohida qator, 8 tagacha.' },
    ],
  },
  cases: {
    key: 'cases',
    table: 'site_cases',
    title: 'Keyslar',
    description: 'Qilingan loyihalar: muqova, natijalar (raqamlar), vazifa va yechim, galereya. “Bosh sahifada” belgilanganlari landingda chiqadi.',
    addLabel: 'Keys qo‘shish',
    emptyText: 'Hali keys yo‘q. Birinchi loyihangizni qo‘shing — “Keyslar” sahifasi menyuda shundan keyin paydo bo‘ladi.',
    primary: 'title',
    secondary: 'summary',
    thumb: 'cover_url',
    folder: 'cases',
    fields: [
      { key: 'title', label: 'Loyiha nomi', type: 'text', required: true, max: 120 },
      { key: 'slug', label: 'Manzil (URL)', type: 'slug', max: 80, hint: 'Bo‘sh qolsa nomdan yasaladi: /keyslar/…', half: true },
      { key: 'partner_id', label: 'Hamkor', type: 'partner', half: true, hint: 'Ro‘yxatda bo‘lmasa, quyida mijoz nomini yozing.' },
      { key: 'client_name', label: 'Mijoz nomi', type: 'text', max: 80, half: true },
      { key: 'category', label: 'Yo‘nalish', type: 'text', max: 40, placeholder: 'SMM, Reels, Brending…', half: true },
      { key: 'year', label: 'Yil', type: 'year', half: true },
      { key: 'is_featured', label: 'Bosh sahifada ko‘rsatish', type: 'boolean', half: true },
      { key: 'summary', label: 'Qisqa tavsif', type: 'textarea', required: true, max: 300, rows: 3 },
      { key: 'results', label: 'Natijalar (raqamlarda)', type: 'results', items: 6, hint: 'Masalan: “+240%” — “Instagram qamrovi”.' },
      { key: 'cover_url', label: 'Muqova rasmi', type: 'image', hint: 'Gorizontal, kamida 1600 px eni.' },
      { key: 'challenge', label: 'Vazifa', type: 'textarea', max: 2000, rows: 4 },
      { key: 'solution', label: 'Yechim', type: 'textarea', max: 2000, rows: 4 },
      { key: 'gallery', label: 'Galereya', type: 'gallery', items: 12 },
      { key: 'video_url', label: 'Video havolasi', type: 'url', placeholder: 'https://instagram.com/reel/…' },
    ],
  },
  partners: {
    key: 'partners',
    table: 'site_partners',
    title: 'Hamkorlar',
    description:
      'Faol hamkorlar bosh sahifadagi 3D pufaklarda (bir vaqtda 5 tagacha, navbat bilan) va “Hamkorlar” sahifasida chiqadi. Logotip bir marta yuklanadi — ikkala joy ham shundan foydalanadi.',
    addLabel: 'Hamkor qo‘shish',
    emptyText: 'Hali hamkor yo‘q. “Mijozlardan to‘ldirish” bilan tez boshlang — “Hamkorlar” sahifasi shundan keyin menyuda chiqadi.',
    primary: 'name',
    secondary: 'highlight',
    thumb: 'logo_url',
    folder: 'partners',
    fields: [
      { key: 'name', label: 'Brend nomi', type: 'text', required: true, max: 80 },
      { key: 'logo_url', label: 'Logotip', type: 'image', hint: 'PNG, JPG, WEBP yoki SVG (SVG xavfsiz rasmga aylantiriladi). Shaffof fon eng yaxshisi, fonli rasm ham to‘g‘ri chiqadi.' },
      { key: 'since_year', label: 'Hamkorlik boshlangan yil', type: 'year', half: true },
      { key: 'industry', label: 'Soha yoki hamkorlik yo‘nalishi', type: 'text', max: 60, placeholder: 'SMM, Reels, brending…', half: true },
      { key: 'highlight', label: 'Erishilgan natija (qisqa)', type: 'text', max: 80, placeholder: 'Instagram auditoriyasi 3 barobar' },
      { key: 'description', label: 'Hamkorlik haqida', type: 'textarea', max: 500, rows: 3 },
      { key: 'website_url', label: 'Sayt yoki ijtimoiy tarmoq havolasi', type: 'url', placeholder: 'https://instagram.com/…' },
    ],
  },
  testimonials: {
    key: 'testimonials',
    table: 'site_testimonials',
    title: 'Fikrlar',
    description: 'Hamkorlarning SUN MEDIA haqidagi so‘zlari — faqat ularning roziligi bilan.',
    addLabel: 'Fikr qo‘shish',
    emptyText: 'Hali fikr yo‘q.',
    primary: 'author_name',
    secondary: 'quote',
    thumb: 'avatar_url',
    folder: 'people',
    fields: [
      { key: 'quote', label: 'Fikr matni', type: 'textarea', required: true, max: 600, rows: 4 },
      { key: 'author_name', label: 'Muallif', type: 'text', required: true, max: 80, half: true },
      { key: 'author_role', label: 'Lavozimi', type: 'text', max: 80, placeholder: 'Marketing direktori', half: true },
      { key: 'partner_id', label: 'Hamkor', type: 'partner' },
      { key: 'avatar_url', label: 'Surati', type: 'image' },
    ],
  },
  stats: {
    key: 'stats',
    table: 'site_stats',
    title: 'Raqamlar',
    description: 'Haqiqiy ko‘rsatkichlar: loyihalar, hamkorlar, yillar… Raqam saytda 0 dan sanab chiqadi.',
    addLabel: 'Raqam qo‘shish',
    emptyText: 'Hali raqam yo‘q — bo‘lim saytda yashirin turadi.',
    primary: 'value',
    secondary: 'label',
    folder: 'stats',
    fields: [
      { key: 'value', label: 'Qiymat', type: 'text', required: true, max: 16, placeholder: '120+', half: true },
      { key: 'label', label: 'Nimaning soni', type: 'text', required: true, max: 60, placeholder: 'Tayyor loyiha', half: true },
      { key: 'description', label: 'Izoh', type: 'text', max: 160 },
    ],
  },
  benefits: {
    key: 'benefits',
    table: 'site_benefits',
    title: 'Afzalliklar',
    description: '“Nega SUN MEDIA” bloki. Birinchisi katta karta bo‘lib chiqadi.',
    addLabel: 'Afzallik qo‘shish',
    emptyText: 'Hali afzallik yo‘q.',
    primary: 'title',
    secondary: 'description',
    folder: 'benefits',
    fields: [
      { key: 'title', label: 'Sarlavha', type: 'text', required: true, max: 80 },
      { key: 'icon', label: 'Belgi', type: 'icon', half: true },
      { key: 'description', label: 'Tavsif', type: 'textarea', required: true, max: 300, rows: 3 },
    ],
  },
  steps: {
    key: 'steps',
    table: 'site_steps',
    title: 'Ish jarayoni',
    description: 'G‘oyadan natijagacha bosqichlar — saytda raqamlangan holda chiqadi.',
    addLabel: 'Bosqich qo‘shish',
    emptyText: 'Hali bosqich yo‘q.',
    primary: 'title',
    secondary: 'description',
    folder: 'steps',
    fields: [
      { key: 'title', label: 'Bosqich', type: 'text', required: true, max: 80 },
      { key: 'description', label: 'Tavsif', type: 'textarea', required: true, max: 300, rows: 3 },
    ],
  },
  faqs: {
    key: 'faqs',
    table: 'site_faqs',
    title: 'Savol-javoblar',
    description: 'Ko‘p beriladigan savollar bloki.',
    addLabel: 'Savol qo‘shish',
    emptyText: 'Hali savol yo‘q.',
    primary: 'question',
    secondary: 'answer',
    folder: 'faqs',
    fields: [
      { key: 'question', label: 'Savol', type: 'text', required: true, max: 200 },
      { key: 'answer', label: 'Javob', type: 'textarea', required: true, max: 1200, rows: 4 },
    ],
  },
};

export const SITE_COLLECTION_KEYS = Object.keys(SITE_COLLECTIONS) as SiteCollectionKey[];

export function isCollectionKey(value: string): value is SiteCollectionKey {
  return (SITE_COLLECTION_KEYS as string[]).includes(value);
}

/** Empty values for a new row (what the "Qo‘shish" form starts from). */
export function blankItem(collection: SiteCollection): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of collection.fields) {
    out[f.key] =
      f.type === 'list' || f.type === 'gallery' || f.type === 'results'
        ? []
        : f.type === 'boolean'
          ? false
          : f.type === 'icon'
            ? 'spark'
            : f.type === 'year' || f.type === 'partner' || f.type === 'image' || f.type === 'url'
              ? null
              : '';
  }
  return out;
}
