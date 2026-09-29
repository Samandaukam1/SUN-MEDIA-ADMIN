import { ATTENDANCE_STATUS, CONTENT_STATUS, PUBLICATION_STATUS, SHOOTING_ATTENDANCE_STATUS, SHOOTING_STATUS, TASK_STATUS } from '@/lib/labels';

/** One row of get_activity_feed. */
export type ActivityItem = {
  id: number;
  occurred_at: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  client_name: string | null;
  label: string | null;
  subject_name: string | null;
  changes: { status?: string; old_status?: string; late_minutes?: number; title?: string } | null;
};

const statusLabel = (map: Record<string, { label: string }>, status: string | undefined) => (status ? (map[status]?.label ?? status) : '—');

/** Turns an audit entry into one plain Uzbek sentence (same wording as the mobile activity stream). */
export function describeActivity(item: ActivityItem): { text: string; detail: string | null } {
  const who = item.actor_name ?? 'Tizim';
  const { status, old_status: oldStatus, late_minutes: late } = item.changes ?? {};
  const label = item.label ?? item.changes?.title ?? null;
  const insert = item.action.endsWith('.insert');

  switch (item.entity_type) {
    case 'content_items':
      if (insert) return { text: `${who} yangi kontent yaratdi`, detail: label };
      if (status === 'approved') return { text: `${label ?? 'Kontent'} tasdiqlandi`, detail: who };
      if (status === 'revision') return { text: `${label ?? 'Kontent'} o‘zgartirishga qaytdi`, detail: who };
      if (status === 'published') return { text: `${label ?? 'Kontent'} joylandi`, detail: who };
      return { text: `${who}: ${statusLabel(CONTENT_STATUS, oldStatus)} → ${statusLabel(CONTENT_STATUS, status)}`, detail: label };
    case 'content_publications':
      return insert ? { text: `${who} postni rejalashtirdi`, detail: label } : { text: `Post: ${statusLabel(PUBLICATION_STATUS, status)}`, detail: label };
    case 'revisions':
      return { text: `${who} o‘zgartirish so‘radi`, detail: label };
    case 'tasks':
      return insert ? { text: `${who} vazifa yaratdi`, detail: label } : { text: `${who}: vazifa ${statusLabel(TASK_STATUS, status).toLowerCase()}`, detail: label };
    case 'shootings':
      return insert ? { text: `${who} syomka rejalashtirdi`, detail: label } : { text: `Syomka: ${statusLabel(SHOOTING_STATUS, status)}`, detail: label };
    case 'shooting_attendance':
      return {
        text: `${who} ${item.subject_name ?? 'xodim'}ni syomkada “${statusLabel(SHOOTING_ATTENDANCE_STATUS, status)}” deb belgiladi`,
        detail: [label, late ? `${late} daq kechikish` : null].filter(Boolean).join(' · ') || null,
      };
    case 'attendance':
      return { text: `${who} ${item.subject_name ?? 'xodim'}ni “${statusLabel(ATTENDANCE_STATUS, status).toLowerCase()}” deb belgiladi`, detail: late ? `${late} daqiqa kechikish` : null };
    case 'files':
      return { text: `${who} fayl yukladi`, detail: label };
    case 'projects':
      return insert ? { text: `${who} yangi loyiha ochdi`, detail: label } : { text: 'Loyiha yangilandi', detail: label };
    case 'clients':
      return insert ? { text: 'Yangi mijoz qo‘shildi', detail: label } : { text: 'Mijoz ma’lumoti yangilandi', detail: label };
    case 'monthly_reports':
      return { text: status === 'published' ? 'Oylik hisobot mijozga yuborildi' : 'Oylik hisobot yangilandi', detail: label };
    default:
      return { text: `${who}: ${item.action}`, detail: label };
  }
}
