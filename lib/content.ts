import type { Database } from '@/types/database';

type Status = Database['public']['Enums']['content_status'];

/** Studio stages as people say them; each groups one or more database statuses. */
export const CONTENT_STAGES: { key: string; label: string; statuses: Status[] }[] = [
  { key: 'idea', label: 'G‘oya', statuses: ['idea'] },
  { key: 'script', label: 'Ssenariy', statuses: ['script'] },
  { key: 'shoot', label: 'Syomka', statuses: ['ready_for_shoot', 'shooting', 'shot'] },
  { key: 'edit', label: 'Montaj', statuses: ['editing'] },
  { key: 'check', label: 'Tekshiruv', statuses: ['internal_review'] },
  { key: 'client', label: 'Mijoz tasdiqlashi', statuses: ['client_review'] },
  { key: 'rework', label: 'O‘zgartirish', statuses: ['revision'] },
  { key: 'ready', label: 'Tayyor', statuses: ['approved'] },
  { key: 'scheduled', label: 'Rejalashtirilgan', statuses: ['scheduled'] },
  { key: 'live', label: 'Joylandi', statuses: ['published'] },
];

export const FINISHED: Status[] = ['approved', 'scheduled', 'published', 'cancelled'];

export function isOverdue(item: { due_at: string | null; status: Status }, now = Date.now()) {
  return !!item.due_at && !FINISHED.includes(item.status) && new Date(item.due_at).getTime() < now;
}

/** People a content item needs; each is one select on the content form. */
export const CONTENT_TEAM_ROLES = ['operator', 'editor', 'designer', 'smm_manager', 'copywriter'] as const;
