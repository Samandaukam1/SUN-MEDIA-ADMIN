'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import { locate, type VisibleSection } from '@/lib/nav';

/** Where am I (section + its pages as tabs) and one search box for everything. */
export function TopBar({ sections }: { sections: VisibleSection[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const here = locate(sections, pathname);
  const section = here?.section;

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-8">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <p className="shrink-0 py-4 text-[15px] font-semibold">{section?.label ?? 'SUN MEDIA'}</p>
          {section && section.pages.length > 1 ? (
            <nav className="-mb-px flex min-w-0 gap-1 overflow-x-auto" aria-label={`${section.label} bo‘limlari`}>
              {section.pages.map((page) => {
                const on = here?.page.href === page.href;
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'border-b-2 px-3 py-4 text-sm font-medium whitespace-nowrap',
                      on ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {page.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
        <form action="/search" className="relative w-72 shrink-0" role="search">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            name="q"
            defaultValue={pathname === '/search' ? (params.get('q') ?? '') : ''}
            placeholder="Qidirish: mijoz, kontent, xodim…"
            aria-label="Qidirish"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-subtle focus:border-line-strong"
          />
        </form>
      </div>
    </div>
  );
}
