import type { Database } from '@/types/database';

export type TaskStatus = Database['public']['Enums']['task_status'];

export const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'revision'];

export type TaskAction = { status: TaskStatus; label: string };

/** What the assignee may do next (the same steps as in the mobile app); accepting or returning work is the manager's. */
export function assigneeActions(status: TaskStatus): TaskAction[] {
  if (status === 'todo') return [{ status: 'in_progress', label: 'Boshlash' }];
  if (status === 'in_progress')
    return [
      { status: 'in_review', label: 'Tekshiruvga yuborish' },
      { status: 'done', label: 'Bajarildi' },
    ];
  if (status === 'revision') return [{ status: 'in_progress', label: 'Qayta boshlash' }];
  return [];
}

export function canMoveTo(from: TaskStatus, to: TaskStatus): boolean {
  return assigneeActions(from).some((a) => a.status === to);
}

export type TaskGroup = 'faol' | 'tekshiruv' | 'bajarilgan';

export function groupOf(status: TaskStatus): TaskGroup | null {
  if (OPEN_STATUSES.includes(status)) return 'faol';
  if (status === 'in_review') return 'tekshiruv';
  if (status === 'done') return 'bajarilgan';
  return null;
}
