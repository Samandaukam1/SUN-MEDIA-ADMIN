import type { Database } from '@/types/database';
import type { Stage } from '@/lib/workflow-shared';

export type TaskStatus = Database['public']['Enums']['task_status'];

export const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'revision'];

export type TaskAction = { status: TaskStatus; label: string };

/**
 * What the assignee may do next (the same steps as in the mobile app); accepting or returning work is the manager's.
 * Workflow stages have their own steps: the script is sent from its editor, montaj goes to review (an admin accepts
 * it), equipment is confirmed on its own page.
 */
export function assigneeActions(status: TaskStatus, stage: Stage | null = null): TaskAction[] {
  if (stage === 'script' || stage === 'equipment') return [];
  if (stage === 'editing') {
    if (status === 'todo') return [{ status: 'in_progress', label: 'Montajni boshlash' }];
    if (status === 'in_progress') return [{ status: 'in_review', label: 'Tugatdim — tekshiruvga' }];
    if (status === 'revision') return [{ status: 'in_progress', label: 'Tuzatishni boshlash' }];
    return [];
  }
  if (stage === 'shooting') {
    if (status === 'todo') return [{ status: 'in_progress', label: 'Syomka boshlandi' }];
    if (status === 'in_progress') return [{ status: 'done', label: 'Syomka tugadi' }];
    return [];
  }
  if (stage === 'publishing') {
    if (status === 'todo') return [{ status: 'in_progress', label: 'Boshlash' }];
    if (status === 'in_progress') return [{ status: 'done', label: 'Post joylandi' }];
    return [];
  }
  if (status === 'todo') return [{ status: 'in_progress', label: 'Boshlash' }];
  if (status === 'in_progress')
    return [
      { status: 'in_review', label: 'Tekshiruvga yuborish' },
      { status: 'done', label: 'Bajarildi' },
    ];
  if (status === 'revision') return [{ status: 'in_progress', label: 'Qayta boshlash' }];
  return [];
}

export function canMoveTo(from: TaskStatus, to: TaskStatus, stage: Stage | null = null): boolean {
  return assigneeActions(from, stage).some((a) => a.status === to);
}

export type TaskGroup = 'yangi' | 'jarayonda' | 'tekshiruv' | 'bajarilgan';

/** "Yangi / Jarayonda / Tekshiruvda / Tugallangan" (a returned task counts as in progress). */
export function groupOf(status: TaskStatus): TaskGroup | null {
  if (status === 'todo') return 'yangi';
  if (status === 'in_progress' || status === 'revision') return 'jarayonda';
  if (status === 'in_review') return 'tekshiruv';
  if (status === 'done') return 'bajarilgan';
  return null;
}
