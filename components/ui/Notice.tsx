import type { ReactNode } from 'react';

import { cn } from './cn';
import { Icon } from './Icon';

const tones = {
  info: 'border-info/30 bg-info-soft text-ink',
  warning: 'border-warning/30 bg-warning-soft text-ink',
  danger: 'border-danger/30 bg-danger-soft text-ink',
  success: 'border-success/30 bg-success-soft text-ink',
};

export function Notice({ tone = 'info', title, children }: { tone?: keyof typeof tones; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      <Icon name={tone === 'success' ? 'check' : 'alert'} size={17} className="mt-0.5 shrink-0" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
      </div>
    </div>
  );
}
