import type { Database } from '@/types/database';

type Status = Database['public']['Enums']['content_status'];

/**
 * Internal stages as people say them; each groups one or more database statuses. The old client approval
 * statuses (client_review, revision) are history and fold into "Ichki tekshiruv" / "Montaj".
 */
export const CONTENT_STAGES: { key: string; label: string; statuses: Status[] }[] = [
  { key: 'idea', label: 'G‘oya', statuses: ['idea'] },
  { key: 'script', label: 'Ssenariy', statuses: ['script'] },
  { key: 'ready_shoot', label: 'Syomkaga tayyor', statuses: ['ready_for_shoot'] },
  { key: 'shoot', label: 'Syomka', statuses: ['shooting'] },
  { key: 'shot', label: 'Syomka tugadi', statuses: ['shot'] },
  { key: 'edit', label: 'Montaj', statuses: ['editing', 'revision'] },
  { key: 'check', label: 'Ichki tekshiruv', statuses: ['internal_review', 'client_review'] },
  { key: 'ready', label: 'Tayyor', statuses: ['approved'] },
  { key: 'scheduled', label: 'Rejalashtirildi', statuses: ['scheduled'] },
  { key: 'live', label: 'Joylandi', statuses: ['published'] },
];

/** Who holds the work at a status (the team member for the stage; the admin for internal checks). */
export function responsibleRole(status: Status): string[] {
  switch (status) {
    case 'idea':
    case 'script':
      return ['copywriter', 'smm_manager'];
    case 'ready_for_shoot':
    case 'shooting':
      return ['operator'];
    case 'shot':
    case 'editing':
    case 'revision':
      return ['editor', 'designer'];
    case 'internal_review':
    case 'client_review':
      return ['project_manager'];
    case 'approved':
    case 'scheduled':
    case 'published':
      return ['smm_manager'];
    default:
      return [];
  }
}

export const FINISHED: Status[] = ['approved', 'scheduled', 'published', 'cancelled'];

export function isOverdue(item: { due_at: string | null; status: Status }, now = Date.now()) {
  return !!item.due_at && !FINISHED.includes(item.status) && new Date(item.due_at).getTime() < now;
}

/** People a content item needs; each is one select on the content form. */
export const CONTENT_TEAM_ROLES = ['operator', 'editor', 'designer', 'smm_manager', 'copywriter'] as const;
