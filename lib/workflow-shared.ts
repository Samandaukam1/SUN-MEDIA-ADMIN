/** Content workflow names shared by the panel, the staff cabinet and the forms (no server code here). */

export type Stage = 'script' | 'equipment' | 'shooting' | 'editing' | 'publishing';
export type WorkflowRole = 'scriptwriter' | 'operator' | 'editor';

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'script', label: 'Ssenariy', hint: 'Ssenarist yozadi, Rahbar tasdiqlaydi' },
  { key: 'equipment', label: 'Jihozlar', hint: 'Admin tayyorlaydi va tasdiqlaydi' },
  { key: 'shooting', label: 'Syomka', hint: 'Operator va syomka jamoasi' },
  { key: 'editing', label: 'Montaj', hint: 'Admin montajyorni belgilaydi' },
  { key: 'publishing', label: 'Post', hint: 'Mas’ul xodim joylaydi' },
];

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<Stage, string>;

/** How a stage's task status reads for that stage ("Yangi / Jarayonda / Tekshiruvda / Tasdiqlangan / Tuzatish kerak"). */
export function stageStatusLabel(stage: Stage | null, status: string): string {
  const reviewed = stage === 'script' || stage === 'editing';
  switch (status) {
    case 'todo':
      return 'Yangi';
    case 'in_progress':
      return 'Jarayonda';
    case 'in_review':
      return 'Tekshiruvda';
    case 'revision':
      return 'Tuzatish kerak';
    case 'done':
      return reviewed ? 'Tasdiqlangan' : stage === 'equipment' ? 'Tayyor' : stage === 'publishing' ? 'Joylandi' : 'Tugallangan';
    case 'cancelled':
      return 'Bekor';
    default:
      return status;
  }
}

export const WORKFLOW_ROLE_LABEL: Record<WorkflowRole, string> = { scriptwriter: 'Ssenariy', operator: 'Operatorlik', editor: 'Montaj' };

/** "2026-10-16" + "11:00" in Tashkent → ISO instant. */
export function tashkentInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '10:00';
  return `${date}T${t}:00+05:00`;
}
