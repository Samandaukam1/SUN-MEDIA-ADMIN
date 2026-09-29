import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';

/** Filter pills as plain links (server-rendered, shareable URLs). */
export function ChipLinks({ items }: { items: { label: string; href: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filtr">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'true' : undefined}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap',
            item.active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
          )}
        >
          {item.label}
          {item.count != null ? <span className={cn('tabular text-xs', item.active ? 'text-bg/70' : 'text-subtle')}>{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A GET search box that keeps the other filters as hidden fields. */
export function SearchBox({ placeholder, value, keep = {} }: { placeholder: string; value?: string; keep?: Record<string, string | undefined> }) {
  return (
    <form className="relative min-w-64 flex-1" role="search">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
      <input name="q" defaultValue={value} placeholder={placeholder} aria-label={placeholder} className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm outline-none focus:border-line-strong" />
    </form>
  );
}

type Column = string | { label: string; className?: string };

/** Plain data table inside a card; rows are passed as children. */
export function Table({ columns, children }: { columns: Column[]; children: ReactNode }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
            {columns.map((c, i) => {
              const col = typeof c === 'string' ? { label: c } : c;
              return (
                <th key={`${col.label}-${i}`} className={cn('px-5 py-3 whitespace-nowrap', col.className)}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

/** Row whose first cell holds the link; the whole row is clickable. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="after:absolute after:inset-0">
      {children}
    </Link>
  );
}

export const rowClass = 'relative border-b border-line last:border-0 hover:bg-surface-2';
export const cellClass = 'px-5 py-3.5 align-middle';

/** Previous / next page links for offset lists. */
export function Pager({ page, hasNext, href }: { page: number; hasNext: boolean; href: (page: number) => string }) {
  if (page === 0 && !hasNext) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 0 ? (
        <Link href={href(page - 1)} className="font-medium text-muted hover:text-ink">
          ← Oldingi
        </Link>
      ) : (
        <span />
      )}
      <span className="text-subtle">{page + 1}-sahifa</span>
      {hasNext ? (
        <Link href={href(page + 1)} className="font-medium text-muted hover:text-ink">
          Keyingi →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Builds "/path?a=1&b=2" from the current filters plus overrides; empty values are dropped. */
export function withParams(path: string, params: Record<string, string | undefined>, override: Record<string, string | undefined> = {}): string {
  const merged = { ...params, ...override };
  const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
