import type { BadgeTone } from '@/components/ui/Badge';
import type { Database } from '@/types/database';

type Enums = Database['public']['Enums'];

export const CONTENT_STATUS: Record<Enums['content_status'], { label: string; tone: BadgeTone }> = {
  idea: { label: 'G‘oya', tone: 'neutral' },
  script: { label: 'Ssenariy', tone: 'info' },
  ready_for_shoot: { label: 'Syomkaga tayyor', tone: 'info' },
  shooting: { label: 'Syomka', tone: 'violet' },
  shot: { label: 'Tasvirga olindi', tone: 'violet' },
  editing: { label: 'Montaj', tone: 'accent' },
  internal_review: { label: 'Ichki tekshiruv', tone: 'info' },
  client_review: { label: 'Mijoz tasdig‘ida', tone: 'warning' },
  revision: { label: 'Revision', tone: 'danger' },
  approved: { label: 'Tasdiqlandi', tone: 'success' },
  scheduled: { label: 'Rejalashtirildi', tone: 'info' },
  published: { label: 'Joylandi', tone: 'success' },
  cancelled: { label: 'Bekor qilindi', tone: 'neutral' },
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
  account_manager: 'Account manager',
  project_manager: 'Project manager',
  smm_manager: 'SMM manager',
  operator: 'Operator',
  editor: 'Montajyor',
  designer: 'Dizayner',
  copywriter: 'Kopirayter',
  assistant: 'Assistent',
};

export const CLIENT_STATUS: Record<Enums['client_status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Faol', tone: 'success' },
  paused: { label: 'Pauza', tone: 'warning' },
  disabled: { label: 'O‘chirilgan', tone: 'danger' },
  archived: { label: 'Arxiv', tone: 'neutral' },
};

/** Uzbek names for permissions shown in account forms. */
export const PERMISSION_LABEL: Record<string, string> = {
  'dashboard.view': 'Command Center',
  'clients.read_all': 'Barcha mijozlarni ko‘rish',
  'clients.manage': 'Mijozlarni boshqarish',
  'employees.read': 'Xodimlarni ko‘rish',
  'employees.manage': 'Xodim va akkauntlarni boshqarish',
  'roles.manage': 'Rollarni boshqarish',
  'attendance.read': 'Davomatni ko‘rish',
  'attendance.manage': 'Davomatni belgilash',
  'performance.read': 'KPI ko‘rish',
  'projects.manage': 'Loyihalarni boshqarish',
  'content.manage': 'Kontentni boshqarish',
  'content.edit_copy': 'Matn/caption tahrirlash',
  'publications.manage': 'Nashrlarni boshqarish',
  'shootings.manage': 'Syomkalarni boshqarish',
  'tasks.read_all': 'Barcha vazifalarni ko‘rish',
  'tasks.manage': 'Vazifalarni boshqarish',
  'approvals.manage': 'Tasdiqlashni boshqarish',
  'files.upload': 'Fayl yuklash',
  'files.manage': 'Fayllarni boshqarish',
  'plans.manage': 'Tariflarni boshqarish',
  'subscriptions.read': 'Obunalarni ko‘rish',
  'subscriptions.manage': 'Obunalarni boshqarish',
  'contracts.manage': 'Shartnomalarni boshqarish',
  'finance.read': 'Moliyaviy ko‘rsatkichlar',
  'analytics.manage': 'Analitika kiritish',
  'reports.read': 'Hisobotlarni ko‘rish',
  'reports.manage': 'Hisobotlarni boshqarish',
  'notifications.manage': 'Bildirishnomalarni boshqarish',
  'chat.manage': 'Chatlarni boshqarish',
  'audit.read': 'Audit jurnali',
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
  commercial: 'Tijorat',
  dashboard: 'Boshqaruv paneli',
  files: 'Fayllar',
  team: 'Jamoa',
  attendance: 'Davomat',
  production: 'Ishlab chiqarish',
  content: 'Kontent',
  analytics: 'Analitika',
  reports: 'Hisobotlar',
  reporting: 'Hisobot va analitika',
  system: 'Tizim',
  workspace: 'Ish joyi',
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
