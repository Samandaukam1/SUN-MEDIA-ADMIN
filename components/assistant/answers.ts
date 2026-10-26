/** A whole reply that only says yes / no (typed or spoken) answers the confirmation card above it. */
const words = (t: string) => t.toLowerCase().replace(/[‘’'`ʻʼ]/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const YES = new Set(['ha', 'xa', 'hа', 'haa', 'tasdiqlayman', 'tasdiqla', 'tasdiqlang', 'tasdiq', 'roziman', 'mayli', 'ok', 'okey', 'bajar', 'bajaring', 'yubor', 'yuboring', 'albatta', 'да', 'yes']);
const NO = new Set(['yoq', 'bekor', 'kerakmas', 'qilma', 'qilmang', 'toxta', 'нет', 'no', 'cancel']);
// Words that only complete an answer ("ha, qil", "bekor qil", "kerak emas").
const FILL = new Set(['qil', 'qiling', 'kerak', 'emas', 'yo', 'q']);
export const answers = (t: string): 'yes' | 'no' | null => {
  const w = words(t);
  if (!w.length || w.length > 4) return null;
  const only = (set: Set<string>) => w.every((x) => set.has(x) || FILL.has(x)) && w.some((x) => set.has(x));
  if (only(NO) || (w.includes('kerak') && w.includes('emas') && w.every((x) => FILL.has(x) || NO.has(x)))) return 'no';
  if (only(YES) && !w.includes('emas')) return 'yes';
  return null;
};
