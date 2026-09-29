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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Icon name="plus" size={17} />
        Yaratish
      </button>
      {open ? (
        <div role="menu" className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1.5 text-ink shadow-2xl">
          {items.map((item) => (
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
