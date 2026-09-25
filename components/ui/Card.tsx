import type { HTMLAttributes } from 'react';

import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('rounded-2xl border border-line bg-surface p-5', className)} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{children}</h2>
      {action}
    </div>
  );
}
