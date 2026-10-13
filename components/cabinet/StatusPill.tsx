import type { TaskStatus } from '@/lib/cabinet/tasks';
import { TASK_STATUS } from '@/lib/labels';

const TONE: Record<string, string> = {
  neutral: 'bg-white/[0.06] text-[#d9d9de]',
  accent: 'bg-[#d4fc18]/14 text-[#d4fc18]',
  info: 'bg-sky-400/12 text-sky-300',
  danger: 'bg-[#ff8a8a]/12 text-[#ff9c9c]',
  success: 'bg-emerald-400/12 text-emerald-300',
  warning: 'bg-amber-400/12 text-amber-300',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-semibold ${TONE[s.tone] ?? TONE.neutral}`}>{s.label}</span>;
}
