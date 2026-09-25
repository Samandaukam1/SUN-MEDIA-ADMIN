import Link from 'next/link';

import { cn } from './cn';

/** Link-based tabs (server-rendered, deep-linkable through ?tab=). */
export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Bo‘limlar">
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap',
              on ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count != null ? <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
