import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';

export type Crumb = { label: string; href?: string };

type Props = { title: string; description?: string; actions?: ReactNode; crumbs?: Crumb[] };

/** Page title with an optional trail back ("Jamoa › Xodimlar › Jasur") and the page's own actions. */
export function PageHeader({ title, description, actions, crumbs }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs?.length ? (
          <nav aria-label="Yo‘l" className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <Icon name="chevronRight" size={14} className="text-subtle" /> : null}
                {c.href ? (
                  <Link href={c.href} className="font-medium hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
