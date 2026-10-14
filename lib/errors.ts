type ErrorLike = { code?: string; message?: string; name?: string };

const AUTH: Record<string, string> = {
  invalid_credentials: 'Email yoki parol noto‘g‘ri.',
  email_not_confirmed: 'Email hali tasdiqlanmagan.',
  user_banned: 'Hisob bloklangan. Rahbar yoki administrator bilan bog‘laning.',
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
  TITLE_REQUIRED: 'Vazifa nomini yozing.',
  TOPIC_REQUIRED: 'Kontent mavzusini yozing.',
  CLIENT_REQUIRED: 'Mijozni tanlang.',
  CONTENT_TYPE_INVALID: 'Kontent turini tanlang.',
  SHOOT_TIME_REQUIRED: 'Operator yoki syomkaga boradiganlar tanlangan — syomka sanasi va vaqtini kiriting.',
  POST_BEFORE_SHOOT: 'Post sanasi syomkadan oldin bo‘lishi mumkin emas.',
  STAFF_REQUIRED: 'Faqat faol xodimlarni tanlang.',
  SCRIPTWRITER_SKILL: 'Ssenarist sifatida faqat “ssenariy” skilli bor xodim tanlanadi.',
  OPERATOR_SKILL: 'Operator sifatida faqat operatorlik skilli bor xodim tanlanadi.',
  EDITOR_SKILL: 'Montajyor sifatida faqat montaj skilli bor xodim tanlanadi.',
  DUE_REQUIRED: 'Topshirish muddatini belgilang.',
  EDITING_DONE: 'Montaj allaqachon tasdiqlangan.',
  EDITING_NOT_IN_REVIEW: 'Montaj hali tekshiruvga yuborilmagan.',
  SCRIPT_LOCKED: 'Ssenariy tekshiruvda yoki tasdiqlangan — o‘zgartirib bo‘lmaydi.',
  SCRIPT_EMPTY: 'Avval ssenariy matnini yozing.',
  SCRIPT_NOT_EDITABLE: 'Ssenariy hozir yuborib bo‘lmaydigan holatda.',
  SCRIPT_NOT_IN_REVIEW: 'Ssenariy hali tekshiruvga yuborilmagan.',
  NOTE_REQUIRED: 'Nimani tuzatish kerakligini yozing.',
  NAME_REQUIRED: 'Nomini yozing.',
  EQUIPMENT_CONFIRMED: 'Jihozlar allaqachon tasdiqlangan.',
  EQUIPMENT_EMPTY: 'Bu syomka uchun jihoz tanlanmagan.',
  EQUIPMENT_NOT_READY: 'Avval barcha jihozlarni belgilang.',
  CHECK_IN_TOO_EARLY: 'Kelganingizni 09:45 dan boshlab belgilashingiz mumkin.',
  ALREADY_CHECKED_IN: 'Bugungi davomatingiz allaqachon belgilangan.',
  WORK_HOURS_INVALID: 'Ish tugash vaqti boshlanishidan keyin bo‘lsin.',
  APPLICATION_INVALID: 'Maydonlarni tekshiring.',
  OWN_ATTENDANCE_LOCKED: 'O‘z davomatingizni o‘zgartira olmaysiz — uni Rahbar tuzatadi.',
  SELF_ATTENDANCE_KEPT: 'Xodim o‘zi tasdiqlagan davomat o‘chirilmaydi — kerak bo‘lsa holatini tuzating.',
  PLATFORM_INVALID: 'Platformani tanlang.',
  PLATFORM_REQUIRED: 'Kamida bitta platformani tanlang.',
  POST_TIME_REQUIRED: 'Post sanasi va vaqtini belgilang.',
  POST_LINK_REQUIRED: 'Joylangan post havolasini kiriting.',
  POST_LINK_INVALID: 'Post havolasi noto‘g‘ri. To‘liq havolani qo‘ying, masalan https://instagram.com/p/…',
  GAME_ENGAGEMENT_INVALID_CONFIG: 'Challenge yoki yutuq sozlamalarini tekshiring.',
  GAME_ENGAGEMENT_DEFINITION_IN_USE: 'Progress boshlangan. Natija turi, maqsad yoki SUN Coin miqdorini almashtirish uchun yangi topshiriq yarating.',
  COIN_INVALID_CONFIG: 'SUN Coin kampaniyasi sozlamalarini tekshiring.',
  COIN_CAMPAIGN_ALREADY_ACTIVE: 'Bu o‘yin uchun faol kampaniya bor. Avval uni pauzaga qo‘ying yoki tugating.',
  COIN_INVALID_TRANSITION: 'Kampaniyani bu holatga o‘tkazib bo‘lmaydi. Sahifani yangilang.',
  COIN_INVALID_PACK: 'Paket ma’lumotlarini tekshiring.',
  COIN_INVALID_AMOUNT: 'Miqdor 1 dan 100 000 SC gacha bo‘lsin.',
  COIN_INVALID_RECIPIENT: 'Bu foydalanuvchiga SUN Coin berib bo‘lmaydi.',
  GAME_INVALID_LEVEL: 'Bunday daraja yo‘q.',
  GAME_INVALID_REWARD_RULES: 'Mukofot qoidalarini tekshiring: gol 1–10, miqdor 1 dan katta, Pro 365 kungacha, soni berilganidan kam emas.',
  GAME_REWARD_CAMPAIGN_ACTIVE: 'SAFI uchun faol mukofot kampaniyasi bor. Avval uni pauzaga qo‘ying yoki tugating.',
  GAME_REWARD_CAMPAIGN_CLOSED: 'Tugatilgan kampaniyani o‘zgartirib bo‘lmaydi.',
  GAME_REWARD_INVALID_TRANSITION: 'Kampaniyani bu holatga o‘tkazib bo‘lmaydi. Sahifani yangilang.',
  GAME_REWARD_RULE_IN_USE: 'Bu qoida bo‘yicha mukofot berilgan — o‘chirib bo‘lmaydi, faqat o‘chirib qo‘yish (OFF) mumkin.',
  COIN_PURCHASE_CLOSED: 'Bu so‘rov allaqachon yopilgan. Sahifani yangilang.',
  'Cannot assign a role above your own': 'O‘zingizdan yuqori rolni bera olmaysiz.',
  'Cannot grant a permission you do not have': 'O‘zingizda yo‘q ruxsatni bera olmaysiz.',
  'Account is already provisioned': 'Bu akkaunt allaqachon sozlangan.',
  'Account is not a freshly created login': 'Akkaunt yaratish muddati o‘tdi. Qaytadan urinib ko‘ring.',
  'Choose a SUN MEDIA staff role': 'Xodim rolini tanlang.',
  'Choose a client role': 'Mijoz rolini tanlang.',
  'Invalid phone number': 'Telefon raqami noto‘g‘ri. Masalan: +998 90 123 45 67',
  'Give a reason for blocking the account': 'Bloklash sababini yozing.',
  'The last active owner cannot be blocked': 'Oxirgi faol rahbarni bloklab bo‘lmaydi.',
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
  if (e.code === 'P0402') {
    if (e.message === 'PRO_REQUIRED:clients.max') return 'Tarif limiti: yangi mijoz qo‘shish uchun SUN MEDIA Pro kerak.';
    if (e.message === 'PRO_REQUIRED:employees.max') return 'Tarif limiti: yangi xodim qo‘shish uchun SUN MEDIA Pro kerak.';
    return 'Bu imkoniyat SUN MEDIA Pro’da mavjud.';
  }
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

/** Only same-origin relative paths are accepted as post-login destinations; the default is the panel's home. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value === '/') return '/panel';
  return value;
}
