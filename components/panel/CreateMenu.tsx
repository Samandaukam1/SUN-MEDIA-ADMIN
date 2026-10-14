'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';

export type CreateItem = { href: string; label: string; icon: IconName; hint: string };

/** The one "+ Yaratish" of the panel: every new thing starts here instead of an "Add" button on each page. */
export function CreateMenu({ items }: { items: CreateItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The first item, when it is "Vazifa yaratish", is the button itself; the rest open from the arrow beside it.
  const primary = items[0]?.href === '/work/tasks/yaratish' ? items[0] : null;
  const rest = primary ? items.slice(1) : items;
  const btn =
    'flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

  return (
    <div ref={ref} className="relative">
      {primary ? (
        <div className="flex gap-1.5">
          <Link href={primary.href} className={`${btn} min-w-0 flex-1 px-3`}>
            <Icon name="plus" size={17} />
            Vazifa yaratish
          </Link>
          {rest.length ? (
            <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Boshqa yaratish turlari" onClick={() => setOpen(!open)} className={`${btn} w-10 shrink-0`}>
              <Icon name="chevronDown" size={17} />
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={`${btn} w-full px-4`}>
          <Icon name="plus" size={17} />
          Yaratish
        </button>
      )}
      {open ? (
        <div role="menu" className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1.5 text-ink shadow-2xl">
          {rest.map((item) => (
            <Link key={item.href} href={item.href} role="menuitem" className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
              <Icon name={item.icon} size={17} className="mt-0.5 text-muted" />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted">{item.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
