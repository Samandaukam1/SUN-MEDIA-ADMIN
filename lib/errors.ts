type ErrorLike = { code?: string; message?: string; name?: string };

const AUTH: Record<string, string> = {
  invalid_credentials: 'Email yoki parol noto‘g‘ri.',
  email_not_confirmed: 'Email hali tasdiqlanmagan.',
  user_banned: 'Hisob bloklangan. Owner yoki admin bilan bog‘laning.',
  over_request_rate_limit: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.',
};

const SQLSTATE: Record<string, string> = {
  '42501': 'Bu amal uchun ruxsatingiz yo‘q.',
  P0002: 'Ma’lumot topilmadi.',
  '23505': 'Bunday yozuv allaqachon mavjud.',
  '23503': 'Bog‘liq ma’lumot topilmadi.',
  '23514': 'Kiritilgan qiymat qoidalarga mos emas.',
};

export function toUserMessage(error: unknown): string {
  if (!error) return 'Noma’lum xatolik.';
  const e = error as ErrorLike;
  if (e.code && AUTH[e.code]) return AUTH[e.code];
  if (/invalid login credentials/i.test(e.message ?? '')) return AUTH.invalid_credentials;
  if (e.code && SQLSTATE[e.code]) return SQLSTATE[e.code];
  if (/fetch failed|network/i.test(e.message ?? '')) return 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.';
  return e.message ?? 'Noma’lum xatolik.';
}

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
