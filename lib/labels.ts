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
