'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';

import type { VisibleSection } from '@/lib/nav';
import type { CreateItem } from './CreateMenu';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * The panel frame. Desktop (lg+): fixed sidebar beside the page. Phones and tablets: the page takes the full width
 * and the sidebar slides in from the left (menu button, backdrop or Esc closes it; it also closes on navigation).
 */
export function PanelShell({
  sections,
  create,
  user,
  children,
}: {
  sections: VisibleSection[];
  create: CreateItem[];
  user: { name: string; role: string; initials: string };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    // The page behind the drawer does not scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div data-panel className="flex h-dvh overflow-hidden">
      <Sidebar sections={sections} create={create} user={user} open={open} onClose={() => setOpen(false)} />
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Suspense>
          <TopBar sections={sections} onMenu={() => setOpen(true)} menuOpen={open} />
        </Suspense>
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
