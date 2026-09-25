import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';

type Tone = 'default' | 'danger' | 'warning' | 'success';
const toneClass: Record<Tone, string> = { default: 'text-ink', danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

export function Stat({ label, value, detail, tone = 'default' }: { label: string; value: string; detail?: string; tone?: Tone }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{label}</p>
      <p className={cn('tabular text-3xl font-bold tracking-tight', toneClass[tone])}>{value}</p>
      {detail ? <p className="text-[13px] text-muted">{detail}</p> : null}
    </Card>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-center text-sm text-subtle">{children}</p>;
}
