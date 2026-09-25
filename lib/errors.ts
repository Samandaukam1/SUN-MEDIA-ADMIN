type ErrorLike = { code?: string; message?: string; name?: string };

const AUTH: Record<string, string> = {
  invalid_credentials: 'Email yoki parol noto‘g‘ri.',
  email_not_confirmed: 'Email hali tasdiqlanmagan.',
  user_banned: 'Hisob bloklangan. Owner yoki admin bilan bog‘laning.',
  over_request_rate_limit: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.',
};

const SQLSTATE: Record<string, string> = {
  '22023': 'Kiritilgan ma’lumotlarni tekshiring.',
  '23502': 'Majburiy maydonlarni to‘ldiring.',
  '42501': 'Bu amal uchun ruxsatingiz yo‘q.',
  P0002: 'Ma’lumot topilmadi.',
  '23505': 'Bunday yozuv allaqachon mavjud.',
  '23503': 'Bog‘liq ma’lumot topilmadi.',
  '23514': 'Kiritilgan qiymat qoidalarga mos emas.',
};

// Known messages raised by our RPCs / Supabase Auth, translated. Anything else stays generic so raw
// database text (constraint names, values, SQL) never reaches the screen.
const KNOWN: Record<string, string> = {
  'Cannot assign a role above your own': 'O‘zingizdan yuqori rolni bera olmaysiz.',
  'Cannot grant a permission you do not have': 'O‘zingizda yo‘q ruxsatni bera olmaysiz.',
  'Account is already provisioned': 'Bu akkaunt allaqachon sozlangan.',
  'Account is not a freshly created login': 'Akkaunt yaratish muddati o‘tdi. Qaytadan urinib ko‘ring.',
  'Choose a SUN MEDIA staff role': 'Xodim rolini tanlang.',
  'Choose a client role': 'Mijoz rolini tanlang.',
  'Invalid phone number': 'Telefon raqami noto‘g‘ri. Masalan: +998 90 123 45 67',
  'Give a reason for blocking the account': 'Bloklash sababini yozing.',
  'The last active owner cannot be blocked': 'Oxirgi faol Owner’ni bloklab bo‘lmaydi.',
  'Not allowed to assign this client': 'Bu mijozga xodim biriktirishga ruxsatingiz yo‘q.',
  'Only client permissions can be granted to client users': 'Mijozga faqat mijoz ruxsatlarini berish mumkin.',
  'Unknown client permission': 'Noma’lum ruxsat.',
  'Unknown staff permission': 'Noma’lum ruxsat.',
  'Client user not found': 'Mijoz foydalanuvchisi topilmadi.',
  'Account not found': 'Akkaunt topilmadi.',
  'Client not found': 'Mijoz topilmadi.',
  email_exists: 'Bu email bilan akkaunt allaqachon mavjud.',
  user_already_exists: 'Bu email bilan akkaunt allaqachon mavjud.',
  weak_password: 'Parol talablarga javob bermadi. Qayta urinib ko‘ring.',
  email_address_invalid: 'Email manzili noto‘g‘ri.',
};

export function toUserMessage(error: unknown): string {
  if (!error) return 'Noma’lum xatolik.';
  const e = error as ErrorLike;
  if (e.code && KNOWN[e.code]) return KNOWN[e.code];
  if (e.message && KNOWN[e.message]) return KNOWN[e.message];
  if (/already (been )?registered|already exists/i.test(e.message ?? '')) return KNOWN.email_exists;
  if (/(First|Last) name is required/.test(e.message ?? '')) return 'Ism va familiyani kiriting (60 belgigacha).';
  if (e.code && AUTH[e.code]) return AUTH[e.code];
  if (/invalid login credentials/i.test(e.message ?? '')) return AUTH.invalid_credentials;
  if (e.code && SQLSTATE[e.code]) return SQLSTATE[e.code];
  if (/fetch failed|network/i.test(e.message ?? '')) return 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.';
  return 'Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.';
}

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
