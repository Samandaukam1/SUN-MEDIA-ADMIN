/**
 * Industry → sub-industry taxonomy, and a keyword classifier for the client's own description (used when no AI is
 * available, and as a check on the AI's answer). The family decides which website discovery flow fits.
 */

export type WebFamily = 'health' | 'education' | 'food' | 'b2b' | 'retail' | 'property' | 'booking' | 'generic';
export type Sub = { key: string; label: string; keywords: string[] };
export type Industry = { key: string; label: string; family: WebFamily; subs: Sub[]; keywords: string[] };

export const INDUSTRIES: Industry[] = [
  {
    key: 'clinic',
    label: 'Poliklinika / Tibbiyot',
    family: 'health',
    keywords: ['klinika', 'poliklinika', 'shifoxona', 'tibbiy', 'tibbiyot', 'shifokor', 'doktor', 'diagnostika', 'laboratoriya', 'медицин', 'клиник'],
    subs: [
      { key: 'multi', label: 'Ko‘p tarmoqli klinika', keywords: ['ko‘p tarmoqli', 'poliklinika', 'multi'] },
      { key: 'diagnostic', label: 'Diagnostika / laboratoriya', keywords: ['diagnostika', 'laboratoriya', 'analiz', 'uzi', 'mrt'] },
      { key: 'specialized', label: 'Ixtisoslashgan klinika (ko‘z, ginekologiya, kardiologiya…)', keywords: ['ko‘z', 'ginekolog', 'kardio', 'lor', 'urolog', 'ortoped'] },
      { key: 'rehab', label: 'Reabilitatsiya / sanatoriya', keywords: ['reabilitatsiya', 'sanatoriy', 'massaj', 'fizioterap'] },
      { key: 'private_doctor', label: 'Xususiy shifokor / kabinet', keywords: ['kabinet', 'xususiy shifokor'] },
    ],
  },
  {
    key: 'dental',
    label: 'Stomatologiya',
    family: 'health',
    keywords: ['stomatolog', 'tish', 'dental', 'implant', 'breket', 'ortodont', 'стомат'],
    subs: [
      { key: 'general', label: 'Umumiy stomatologiya', keywords: ['davolash', 'plomba'] },
      { key: 'implant', label: 'Implantatsiya va protezlash', keywords: ['implant', 'protez'] },
      { key: 'ortho', label: 'Ortodontiya (breketlar, elaynerlar)', keywords: ['breket', 'ortodont', 'elayner'] },
      { key: 'kids', label: 'Bolalar stomatologiyasi', keywords: ['bolalar'] },
      { key: 'aesthetic', label: 'Estetik stomatologiya (vinir, oqartirish)', keywords: ['vinir', 'oqartir', 'estetik'] },
    ],
  },
  {
    key: 'edu_center',
    label: 'Ta’lim / O‘quv markazi',
    family: 'education',
    keywords: ['o‘quv markaz', 'oquv markaz', 'kurs', 'ta’lim', 'talim', 'maktab', 'bog‘cha', 'repetitor', 'ielts', 'it akademiya', 'akademiya', 'учеб', 'курс'],
    subs: [
      { key: 'languages', label: 'Til kurslari (IELTS, CEFR…)', keywords: ['ielts', 'ingliz', 'til', 'cefr', 'sat'] },
      { key: 'it', label: 'IT va kasbiy kurslar', keywords: ['it', 'dasturlash', 'dizayn kurs', 'kasb'] },
      { key: 'school_prep', label: 'Abituriyent va maktab tayyorlovi', keywords: ['abituriyent', 'dtm', 'maktab tayyor', 'repetitor'] },
      { key: 'private_school', label: 'Xususiy maktab / bog‘cha', keywords: ['xususiy maktab', 'bog‘cha', 'bogcha'] },
      { key: 'online', label: 'Onlayn ta’lim platformasi', keywords: ['onlayn kurs', 'platforma'] },
    ],
  },
  {
    key: 'study_abroad',
    label: 'Xorijda ta’lim konsaltingi',
    family: 'education',
    keywords: ['xorijda o‘qish', 'chet elda', 'universitetga hujjat', 'study abroad', 'grant', 'viza', 'admission', 'xorijiy universitet', 'зарубеж'],
    subs: [
      { key: 'admissions', label: 'Universitetlarga qabul (bakalavr, magistr)', keywords: ['universitet', 'bakalavr', 'magistr', 'qabul'] },
      { key: 'language_abroad', label: 'Xorijda til kurslari', keywords: ['til kursi', 'language school'] },
      { key: 'scholarship', label: 'Grant va stipendiyalar bo‘yicha yordam', keywords: ['grant', 'stipendiya'] },
      { key: 'school_abroad', label: 'Xorijiy maktab va kollejlar', keywords: ['kollej', 'college', 'maktab'] },
    ],
  },
  {
    key: 'consulting',
    label: 'Biznes konsalting / Xizmat ko‘rsatish',
    family: 'generic',
    keywords: ['konsalting', 'maslahat', 'audit', 'buxgalter', 'yuridik', 'advokat', 'huquq', 'hr', 'rekruting', 'logistika', 'agentlik', 'консалт'],
    subs: [
      { key: 'business', label: 'Biznes konsalting', keywords: ['biznes konsalting', 'strategiya'] },
      { key: 'legal_finance', label: 'Yuridik va buxgalteriya xizmatlari', keywords: ['yuridik', 'buxgalter', 'soliq', 'audit', 'advokat'] },
      { key: 'hr', label: 'HR va rekruting', keywords: ['hr', 'rekruting', 'kadr'] },
      { key: 'logistics', label: 'Logistika va transport xizmatlari', keywords: ['logistika', 'yuk', 'tashish', 'kargo'] },
      { key: 'b2b_services', label: 'Boshqa B2B xizmatlar', keywords: ['b2b', 'outsorsing', 'tozalash'] },
    ],
  },
  {
    key: 'food',
    label: 'Restoran / Kafe / Fast food',
    family: 'food',
    keywords: ['restoran', 'kafe', 'fast food', 'fastfud', 'oshxona', 'choyxona', 'pizza', 'burger', 'kofe', 'coffee', 'yetkazib berish', 'ресторан', 'кафе'],
    subs: [
      { key: 'restaurant', label: 'Restoran', keywords: ['restoran', 'banket'] },
      { key: 'cafe', label: 'Kafe / kofeyni', keywords: ['kafe', 'kofe', 'coffee', 'kofeyni'] },
      { key: 'fastfood', label: 'Fast food', keywords: ['fast food', 'fastfud', 'burger', 'lavash', 'pizza'] },
      { key: 'chain', label: 'Tarmoq (bir nechta filial)', keywords: ['tarmoq', 'filiallar'] },
      { key: 'delivery', label: 'Faqat yetkazib berish (dark kitchen)', keywords: ['dark kitchen', 'faqat yetkazib'] },
    ],
  },
  {
    key: 'manufacturing',
    label: 'Ishlab chiqarish',
    family: 'b2b',
    keywords: ['ishlab chiqar', 'zavod', 'fabrika', 'sex', 'производ', 'mahsulot ishlab', 'parranda', 'sut mahsulot', 'qadoqla'],
    subs: [
      { key: 'food_products', label: 'Oziq-ovqat mahsulotlari', keywords: ['oziq-ovqat', 'go‘sht', 'parranda', 'tovuq', 'sut', 'non', 'ichimlik', 'suv'] },
      { key: 'building', label: 'Qurilish materiallari', keywords: ['qurilish material', 'g‘isht', 'beton', 'profil'] },
      { key: 'textile', label: 'To‘qimachilik va kiyim', keywords: ['tekstil', 'to‘qimachilik', 'kiyim tikish'] },
      { key: 'furniture', label: 'Mebel', keywords: ['mebel'] },
      { key: 'packaging_chem', label: 'Qadoq, kimyo va boshqa sanoat', keywords: ['qadoq', 'kimyo', 'plastik'] },
    ],
  },
  {
    key: 'wholesale',
    label: 'Ulgurji savdo / B2B',
    family: 'b2b',
    keywords: ['ulgurji', 'optom', 'distribyutor', 'diler', 'yetkazib beruvchi', 'import', 'оптов', 'дистриб'],
    subs: [
      { key: 'food_dist', label: 'Oziq-ovqat distribyutsiyasi', keywords: ['oziq-ovqat', 'horeca'] },
      { key: 'equipment', label: 'Uskunalar va texnika', keywords: ['uskuna', 'texnika', 'jihoz'] },
      { key: 'materials', label: 'Xomashyo va materiallar', keywords: ['xomashyo', 'material'] },
      { key: 'consumer_goods', label: 'Iste’mol tovarlari', keywords: ['tovar', 'maishiy'] },
    ],
  },
  {
    key: 'retail',
    label: 'Chakana savdo / E-commerce',
    family: 'retail',
    keywords: ['do‘kon', 'dokon', 'magazin', 'onlayn do‘kon', 'internet magazin', 'savdo', 'butik', 'e-commerce', 'marketplace', 'магазин'],
    subs: [
      { key: 'fashion', label: 'Kiyim, poyabzal, aksessuar', keywords: ['kiyim', 'poyabzal', 'butik', 'aksessuar'] },
      { key: 'electronics', label: 'Elektronika va maishiy texnika', keywords: ['elektronika', 'telefon', 'texnika'] },
      { key: 'home', label: 'Uy-ro‘zg‘or, mebel, dekor', keywords: ['uy-ro‘zg‘or', 'dekor', 'mebel'] },
      { key: 'cosmetics', label: 'Kosmetika va parfyumeriya', keywords: ['kosmetika', 'parfyum', 'atir'] },
      { key: 'online_only', label: 'Faqat onlayn do‘kon', keywords: ['faqat onlayn', 'instagram do‘kon'] },
    ],
  },
  {
    key: 'real_estate',
    label: 'Ko‘chmas mulk / Qurilish',
    family: 'property',
    keywords: ['ko‘chmas mulk', 'kochmas mulk', 'uy-joy', 'kvartira', 'qurilish', 'zastroychik', 'quruvchi', 'rieltor', 'turar joy', 'недвиж', 'застрой'],
    subs: [
      { key: 'developer', label: 'Qurilish kompaniyasi (yangi uylar)', keywords: ['zastroychik', 'qurilish kompaniya', 'yangi uy', 'turar joy majmua'] },
      { key: 'agency', label: 'Rieltorlik agentligi', keywords: ['rieltor', 'agentlik'] },
      { key: 'commercial', label: 'Tijorat ko‘chmas mulki (ofis, savdo maydoni)', keywords: ['ofis', 'tijorat', 'ijara'] },
      { key: 'renovation', label: 'Ta’mirlash va dizayn', keywords: ['ta’mir', 'remont', 'interyer'] },
    ],
  },
  {
    key: 'beauty',
    label: 'Go‘zallik / Salon / Estetika',
    family: 'booking',
    keywords: ['salon', 'go‘zallik', 'gozallik', 'kosmetolog', 'estetika', 'barber', 'sartarosh', 'manikyur', 'spa', 'красот', 'салон'],
    subs: [
      { key: 'salon', label: 'Go‘zallik saloni', keywords: ['salon', 'soch', 'manikyur'] },
      { key: 'cosmetology', label: 'Kosmetologiya / estetik klinika', keywords: ['kosmetolog', 'estetik', 'lazer'] },
      { key: 'barber', label: 'Barbershop', keywords: ['barber', 'sartarosh'] },
      { key: 'spa', label: 'SPA va massaj', keywords: ['spa', 'massaj'] },
      { key: 'master', label: 'Yakka usta', keywords: ['usta', 'master'] },
    ],
  },
  {
    key: 'hospitality',
    label: 'Mehmonxona / Turizm',
    family: 'booking',
    keywords: ['mehmonxona', 'hotel', 'xostel', 'turizm', 'tur', 'sayohat', 'travel', 'dam olish', 'гостиниц', 'туризм'],
    subs: [
      { key: 'hotel', label: 'Mehmonxona / xostel', keywords: ['mehmonxona', 'hotel', 'xostel'] },
      { key: 'tour_operator', label: 'Turoperator / turagentlik', keywords: ['turoperator', 'turagent', 'tur paket'] },
      { key: 'resort', label: 'Dam olish maskani', keywords: ['dam olish', 'resort', 'zona otdix'] },
      { key: 'inbound', label: 'Ichki turizm va ekskursiyalar', keywords: ['ekskursiya', 'ichki turizm'] },
    ],
  },
  {
    key: 'tech',
    label: 'Texnologiya / SaaS',
    family: 'generic',
    keywords: ['saas', 'dastur', 'ilova', 'startap', 'it kompaniya', 'platforma', 'software', 'texnologiya', 'crm', 'программ'],
    subs: [
      { key: 'saas', label: 'SaaS mahsulot (obuna)', keywords: ['saas', 'obuna'] },
      { key: 'mobile_app', label: 'Mobil ilova', keywords: ['ilova', 'app'] },
      { key: 'it_services', label: 'IT xizmatlar va dasturlash', keywords: ['dasturlash', 'outsors', 'it xizmat'] },
      { key: 'hardware', label: 'Qurilmalar va integratsiya', keywords: ['qurilma', 'kamera', 'integratsiya'] },
    ],
  },
  {
    key: 'auto',
    label: 'Avtomobil mahsulotlari va xizmatlari',
    family: 'generic',
    keywords: ['avto', 'mashina', 'avtosalon', 'ehtiyot qism', 'zapchast', 'servis', 'avtomoyka', 'shina', 'авто'],
    subs: [
      { key: 'dealer', label: 'Avtosalon / diler', keywords: ['avtosalon', 'diler'] },
      { key: 'parts', label: 'Ehtiyot qismlar', keywords: ['ehtiyot qism', 'zapchast', 'shina', 'moy'] },
      { key: 'service', label: 'Avtoservis / moyka / detailing', keywords: ['servis', 'moyka', 'detailing', 'ta’mir'] },
      { key: 'rental', label: 'Ijara va taksi', keywords: ['ijara', 'prokat', 'taksi'] },
    ],
  },
  {
    key: 'other',
    label: 'Boshqa yo‘nalish',
    family: 'generic',
    keywords: [],
    subs: [{ key: 'other', label: 'Boshqa', keywords: [] }],
  },
];

export const industryOf = (key: string | null | undefined) => INDUSTRIES.find((i) => i.key === key) ?? null;
export const subOf = (industry: string | null | undefined, sub: string | null | undefined) => industryOf(industry)?.subs.find((s) => s.key === sub) ?? null;
export const familyOf = (industry: string | null | undefined): WebFamily => industryOf(industry)?.family ?? 'generic';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ’`']/g, '‘')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The client's own words → the most likely industry (and sub-industry), by keyword hits. Deterministic, explainable,
 * conservative: ties and single weak hits return "other" with low confidence rather than a guess.
 */
export function classifyText(text: string): { industry: string; sub: string | null; confidence: number; matched: string[] } {
  const t = norm(text);
  if (t.length < 3) return { industry: 'other', sub: null, confidence: 0, matched: [] };
  const scored = INDUSTRIES.filter((i) => i.key !== 'other')
    .map((i) => {
      const matched = i.keywords.filter((k) => t.includes(norm(k)));
      const subHits = i.subs.map((s) => ({ s, hits: s.keywords.filter((k) => t.includes(norm(k))) })).sort((a, b) => b.hits.length - a.hits.length);
      return { i, matched, score: matched.length * 2 + (subHits[0]?.hits.length ?? 0), sub: subHits[0]?.hits.length ? subHits[0].s.key : null, subMatched: subHits[0]?.hits ?? [] };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score === 0) return { industry: 'other', sub: null, confidence: 0, matched: [] };
  if (second && second.score === best.score) return { industry: 'other', sub: null, confidence: 0.2, matched: [...best.matched, ...second.matched] };
  const confidence = Math.min(0.9, 0.35 + best.score * 0.12);
  return { industry: best.i.key, sub: best.sub, confidence, matched: [...best.matched, ...best.subMatched] };
}
