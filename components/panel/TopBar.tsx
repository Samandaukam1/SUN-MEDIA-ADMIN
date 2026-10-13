'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import { locate, type VisibleSection } from '@/lib/nav';

function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  return (
    <form action="/search" className={cn('relative', className)} role="search">
      <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
      <input
        ref={input}
        type="search"
        name="q"
        defaultValue={pathname === '/search' ? (params.get('q') ?? '') : ''}
        placeholder="Qidirish: mijoz, kontent, xodim…"
        aria-label="Qidirish"
        className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-subtle focus:border-line-strong"
      />
    </form>
  );
}

/**
 * Where am I (section + its pages as tabs) and one search box for everything. On phones: a menu button for the
 * sidebar drawer, a search button that opens a full-width search row, and the tabs on their own scrollable row.
 */
export function TopBar({ sections, onMenu, menuOpen = false }: { sections: VisibleSection[]; onMenu?: () => void; menuOpen?: boolean }) {
  const pathname = usePathname();
  const here = locate(sections, pathname);
  const section = here?.section;
  const [searching, setSearching] = useState(false);
  useEffect(() => setSearching(false), [pathname]);
  const tabs = section && section.pages.length > 1 ? section.pages : null;

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 sm:px-6 lg:gap-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Menyuni ochish"
          aria-controls="panel-menu"
          aria-expanded={menuOpen}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-2 lg:hidden"
        >
          <Icon name="menu" size={22} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <p className="min-w-0 truncate py-3.5 text-[15px] font-semibold lg:shrink-0 lg:py-4">{section?.label ?? 'SUN MEDIA'}</p>
          {tabs ? (
            <nav className="-mb-px hidden min-w-0 gap-1 overflow-x-auto lg:flex" aria-label={`${section!.label} bo‘limlari`}>
              {tabs.map((page) => {
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
        <SearchBox className="hidden w-72 shrink-0 md:block" />
        <button
          type="button"
          onClick={() => setSearching((v) => !v)}
          aria-label={searching ? 'Qidiruvni yopish' : 'Qidirish'}
          aria-expanded={searching}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-2 md:hidden"
        >
          <Icon name={searching ? 'x' : 'search'} size={20} />
        </button>
      </div>
      {searching ? (
        <div className="px-3 pb-3 sm:px-6 md:hidden">
          <SearchBox autoFocus />
        </div>
      ) : null}
      {tabs ? (
        <nav className="-mb-px flex gap-1 overflow-x-auto px-1.5 [scrollbar-width:none] sm:px-4 lg:hidden" aria-label={`${section!.label} bo‘limlari`}>
          {tabs.map((page) => {
            const on = here?.page.href === page.href;
            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap',
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
  );
}
