import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';

type Props = { title: string; eyebrow?: string; description?: string; actions?: ReactNode; back?: { href: string; label: string } };

export function PageHeader({ title, eyebrow, description, actions, back }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <Icon name="arrowLeft" size={15} />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className="text-sm text-subtle">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
