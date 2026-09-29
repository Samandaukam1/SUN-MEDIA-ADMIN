import type { BadgeTone } from '@/components/ui/Badge';
import type { Database } from '@/types/database';

type Enums = Database['public']['Enums'];

export const CONTENT_STATUS: Record<Enums['content_status'], { label: string; tone: BadgeTone }> = {
  idea: { label: 'G‘oya', tone: 'neutral' },
  script: { label: 'Ssenariy', tone: 'info' },
  ready_for_shoot: { label: 'Syomkaga tayyor', tone: 'info' },
  shooting: { label: 'Syomka', tone: 'violet' },
  shot: { label: 'Suratga olindi', tone: 'violet' },
  editing: { label: 'Montaj', tone: 'accent' },
  internal_review: { label: 'Tekshiruv', tone: 'info' },
  client_review: { label: 'Mijoz tasdiqlashi', tone: 'warning' },
  revision: { label: 'O‘zgartirish', tone: 'danger' },
  approved: { label: 'Tayyor', tone: 'success' },
  scheduled: { label: 'Rejalashtirilgan', tone: 'info' },
  published: { label: 'Joylandi', tone: 'success' },
  cancelled: { label: 'Bekor qilindi', tone: 'neutral' },
};

export const TASK_STATUS: Record<Enums['task_status'], { label: string; tone: BadgeTone }> = {
  todo: { label: 'Navbatda', tone: 'neutral' },
  in_progress: { label: 'Jarayonda', tone: 'accent' },
  in_review: { label: 'Tekshiruvda', tone: 'info' },
  revision: { label: 'Qayta ishlash', tone: 'danger' },
  done: { label: 'Bajarildi', tone: 'success' },
  cancelled: { label: 'Bekor', tone: 'neutral' },
};

export const TASK_TYPE: Record<Enums['task_type'], string> = {
  shooting: 'Syomka',
  editing: 'Montaj',
  design: 'Dizayn',
  copywriting: 'Matn',
  publishing: 'Post',
  review: 'Tekshiruv',
  strategy: 'Strategiya',
  meeting: 'Uchrashuv',
  other: 'Boshqa',
};

export const PRIORITY: Record<Enums['priority_level'], { label: string; tone: BadgeTone }> = {
  low: { label: 'Past', tone: 'neutral' },
  normal: { label: 'Oddiy', tone: 'neutral' },
  high: { label: 'Muhim', tone: 'warning' },
  urgent: { label: 'Shoshilinch', tone: 'danger' },
};

export const CONTENT_TYPE: Record<Enums['content_type'], string> = {
  reel: 'Reels',
  video: 'Video',
  post: 'Post',
  carousel: 'Karusel',
  story: 'Stories',
  design: 'Dizayn',
  ad_creative: 'Reklama kreativi',
  other: 'Boshqa',
};

export const PUBLICATION_STATUS: Record<Enums['publication_status'], { label: string; tone: BadgeTone }> = {
  planned: { label: 'Rejada', tone: 'neutral' },
  scheduled: { label: 'Rejalashtirilgan', tone: 'info' },
  published: { label: 'Joylandi', tone: 'success' },
  failed: { label: 'Xato', tone: 'danger' },
  cancelled: { label: 'Bekor', tone: 'neutral' },
};

export const VERSION_STATUS: Record<Enums['version_status'], { label: string; tone: BadgeTone }> = {
  internal_review: { label: 'Tekshiruvda', tone: 'info' },
  client_review: { label: 'Mijoz tasdiqlashida', tone: 'warning' },
  changes_requested: { label: 'O‘zgartirish so‘raldi', tone: 'danger' },
  approved: { label: 'Tasdiqlandi', tone: 'success' },
  superseded: { label: 'Eski versiya', tone: 'neutral' },
};

export const PROJECT_STATUS: Record<Enums['project_status'], { label: string; tone: BadgeTone }> = {
  planning: { label: 'Rejalashtirilmoqda', tone: 'info' },
  active: { label: 'Faol', tone: 'success' },
  on_hold: { label: 'To‘xtatilgan', tone: 'warning' },
  completed: { label: 'Yakunlangan', tone: 'neutral' },
  cancelled: { label: 'Bekor qilingan', tone: 'neutral' },
};

export const CONTRACT_STATUS: Record<Enums['contract_status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Qoralama', tone: 'neutral' },
  active: { label: 'Amalda', tone: 'success' },
  expired: { label: 'Muddati tugagan', tone: 'warning' },
  terminated: { label: 'Bekor qilingan', tone: 'danger' },
};

export const SHOOTING_STATUS: Record<Enums['shooting_status'], { label: string; tone: BadgeTone }> = {
  planned: { label: 'Rejada', tone: 'neutral' },
  confirmed: { label: 'Tasdiqlangan', tone: 'info' },
  in_progress: { label: 'Davom etmoqda', tone: 'accent' },
  completed: { label: 'Yakunlandi', tone: 'success' },
  postponed: { label: 'Ko‘chirildi', tone: 'warning' },
  cancelled: { label: 'Bekor qilindi', tone: 'neutral' },
};

export const ATTENDANCE_STATUS: Record<Enums['attendance_status'], { label: string; tone: BadgeTone }> = {
  present: { label: 'Keldi', tone: 'success' },
  late: { label: 'Kechikdi', tone: 'warning' },
  absent: { label: 'Kelmadi', tone: 'danger' },
  excused: { label: 'Sababli', tone: 'info' },
  vacation: { label: 'Ta’tilda', tone: 'violet' },
  remote: { label: 'Masofadan', tone: 'accent' },
};

export const SHOOTING_ATTENDANCE_STATUS: Record<Enums['shooting_attendance_status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Belgilanmagan', tone: 'neutral' },
  arrived: { label: 'Keldi', tone: 'success' },
  late: { label: 'Kechikdi', tone: 'warning' },
  absent: { label: 'Kelmadi', tone: 'danger' },
  excused: { label: 'Sababli', tone: 'info' },
};

export const PLATFORM_LABEL: Record<Enums['social_platform'], string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  x: 'X',
  website: 'Veb-sayt',
  other: 'Boshqa',
};

export function lookup<T>(map: Record<string, T>, key: string | null | undefined, fallback: T): T {
  return (key && map[key]) || fallback;
}

export const ACCOUNT_STATUS: Record<Enums['account_status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Faol', tone: 'success' },
  suspended: { label: 'To‘xtatilgan', tone: 'warning' },
  disabled: { label: 'O‘chirilgan', tone: 'danger' },
};

export const EMPLOYMENT_TYPE: Record<Enums['employment_type'], string> = {
  full_time: 'To‘liq stavka',
  part_time: 'Yarim stavka',
  contractor: 'Shartnoma asosida',
  intern: 'Amaliyotchi',
};

export const EMPLOYEE_STATUS: Record<Enums['employee_status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Ishlamoqda', tone: 'success' },
  on_leave: { label: 'Ta’tilda', tone: 'violet' },
  terminated: { label: 'Ishdan ketgan', tone: 'neutral' },
};

export const TEAM_ROLE_LABEL: Record<Enums['team_role'], string> = {
  account_manager: 'Akkaunt menejer',
  project_manager: 'Loyiha menejeri',
  smm_manager: 'SMM menejer',
  operator: 'Operator',
  editor: 'Montajyor',
  designer: 'Dizayner',
  copywriter: 'Kopirayter',
  assistant: 'Yordamchi',
};

export const CLIENT_STATUS: Record<Enums['client_status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Faol', tone: 'success' },
  paused: { label: 'Pauza', tone: 'warning' },
  disabled: { label: 'O‘chirilgan', tone: 'danger' },
  archived: { label: 'Arxiv', tone: 'neutral' },
};

/** Uzbek names for permissions shown in account forms. */
export const PERMISSION_LABEL: Record<string, string> = {
  'dashboard.view': 'Agentlik bosh sahifasi',
  'clients.read_all': 'Barcha mijozlarni ko‘rish',
  'clients.manage': 'Mijozlarni boshqarish',
  'employees.read': 'Xodimlarni ko‘rish',
  'employees.manage': 'Xodim va akkauntlarni boshqarish',
  'roles.manage': 'Rollarni boshqarish',
  'attendance.read': 'Davomatni ko‘rish',
  'attendance.manage': 'Davomatni belgilash',
  'performance.read': 'Ish samaradorligini ko‘rish',
  'projects.manage': 'Loyihalarni boshqarish',
  'content.manage': 'Kontentni boshqarish',
  'content.edit_copy': 'Ssenariy va post matnini tahrirlash',
  'publications.manage': 'Postlarni joylash',
  'shootings.manage': 'Syomkalarni boshqarish',
  'tasks.read_all': 'Barcha vazifalarni ko‘rish',
  'tasks.manage': 'Vazifalarni boshqarish',
  'approvals.manage': 'Tasdiqlashni boshqarish',
  'files.upload': 'Fayl yuklash',
  'files.manage': 'Fayllarni boshqarish',
  'plans.manage': 'Tariflarni boshqarish',
  'subscriptions.read': 'Mijoz tarifini ko‘rish',
  'subscriptions.manage': 'Mijozga tarif biriktirish',
  'contracts.manage': 'Shartnomalarni boshqarish',
  'finance.read': 'Moliyaviy ko‘rsatkichlar',
  'analytics.manage': 'Ijtimoiy tarmoq natijalarini kiritish',
  'reports.read': 'Hisobotlarni ko‘rish',
  'reports.manage': 'Hisobotlarni boshqarish',
  'notifications.manage': 'Bildirishnomalarni boshqarish',
  'chat.manage': 'Chatlarni boshqarish',
  'audit.read': 'Faoliyat tarixi',
  'settings.manage': 'Sozlamalar',
  'client.content.view': 'Kontentni ko‘rish',
  'client.approve': 'Kontentni tasdiqlash / o‘zgartirish so‘rash',
  'client.plan.view': 'Tarifni ko‘rish',
  'client.plan.request_upgrade': 'Tarifni oshirish so‘rovi',
  'client.contracts.view': 'Shartnomalarni ko‘rish',
  'client.reports.view': 'Hisobotlarni ko‘rish',
  'client.files.upload': 'Fayl yuklash',
};

export const PERMISSION_MODULE_LABEL: Record<string, string> = {
  clients: 'Mijozlar',
  commercial: 'Tarif va shartnomalar',
  dashboard: 'Bosh sahifa',
  files: 'Fayllar',
  team: 'Jamoa',
  attendance: 'Davomat',
  production: 'Ishlab chiqarish',
  content: 'Kontent',
  analytics: 'Natijalar',
  reports: 'Hisobotlar',
  reporting: 'Hisobotlar',
  system: 'Tizim',
  workspace: 'E’lonlar va hujjatlar',
  client: 'Mijoz kabineti',
  projects: 'Loyihalar',
  tasks: 'Vazifalar',
  approvals: 'Tasdiqlash',
  notifications: 'Bildirishnomalar',
  chat: 'Chat',
};

export const SUBSCRIPTION_STATUS: Record<Enums['subscription_status'], { label: string; tone: BadgeTone }> = {
  scheduled: { label: 'Rejalashtirilgan', tone: 'info' },
  active: { label: 'Faol', tone: 'success' },
  expired: { label: 'Tugagan', tone: 'neutral' },
  cancelled: { label: 'Bekor qilingan', tone: 'neutral' },
};

export const REQUEST_STATUS: Record<Enums['request_status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Kutilmoqda', tone: 'warning' },
  approved: { label: 'Tasdiqlandi', tone: 'success' },
  rejected: { label: 'Rad etildi', tone: 'danger' },
  cancelled: { label: 'Bekor qilindi', tone: 'neutral' },
};

/** "3 500 000 so‘m" — UZS without decimals, other currencies with the code. */
export function formatMoney(amount: number | string | null | undefined, currency = 'UZS'): string {
  if (amount == null || amount === '') return '—';
  const value = Number(amount);
  const whole = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: currency === 'UZS' ? 0 : 2 }).format(value).replace(/ /g, ' ');
  return currency === 'UZS' ? `${whole} so‘m` : `${whole} ${currency}`;
}

/** Calendar event types from get_calendar_events, in the words people use. */
export const EVENT_TYPE: Record<string, { label: string; tone: BadgeTone }> = {
  shooting: { label: 'Syomka', tone: 'violet' },
  publication: { label: 'Post', tone: 'success' },
  approval_deadline: { label: 'Tasdiqlash', tone: 'warning' },
  content_due: { label: 'Montaj', tone: 'accent' },
  editing_deadline: { label: 'Montaj', tone: 'accent' },
  design_deadline: { label: 'Dizayn', tone: 'info' },
  task_deadline: { label: 'Muddat', tone: 'neutral' },
  meeting: { label: 'Uchrashuv', tone: 'info' },
  company_meeting: { label: 'Umumiy yig‘ilish', tone: 'info' },
  company_holiday: { label: 'Bayram', tone: 'success' },
  company_day_off: { label: 'Dam olish kuni', tone: 'success' },
  company_company_event: { label: 'Kompaniya tadbiri', tone: 'violet' },
  company_training: { label: 'Trening', tone: 'info' },
  company_birthday: { label: 'Tug‘ilgan kun', tone: 'accent' },
};
