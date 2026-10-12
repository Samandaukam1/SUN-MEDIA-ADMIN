/** Phone as typed on the form → +<digits>. Nine digits are a local Uzbek number (90 123 45 67). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') && digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}

/**
 * Link as typed → a full https URL; '' stays empty (the field is optional); null when it is not a link.
 * "@brend" is read as an Instagram handle, "brend.uz" gets https://.
 */
export function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return '';
  const handle = /^@([A-Za-z0-9._]{1,30})$/.exec(value);
  const candidate = handle ? `https://instagram.com/${handle[1]}` : /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) return null;
    if (url.username || url.password) return null;
    const out = url.toString();
    return out.length <= 500 ? out : null;
  } catch {
    return null;
  }
}

/** Optional https link in the editor: '' → null, missing scheme → https://. Undefined when invalid. */
export function normalizeHttpsLink(raw: string): string | null | undefined {
  const value = normalizeLink(raw);
  if (value === '') return null;
  if (value === null) return undefined;
  return value.replace(/^http:\/\//i, 'https://');
}

/** "Instagram Reels — 2024!" → "instagram-reels-2024" (Uzbek Latin and Cyrillic letters kept readable). */
export function slugify(text: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
    о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '',
    э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  };
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
