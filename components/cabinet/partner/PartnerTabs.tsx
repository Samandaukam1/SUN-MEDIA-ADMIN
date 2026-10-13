'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { SiteIcon } from '@/components/site/SiteIcon';

export type PartnerTab = { href: string; path: string; label: string; icon: string; badge?: number };

/** Section tabs of the partner cabinet; on phones a swipeable row that keeps the active tab in view. */
export function PartnerTabs({ tabs }: { tabs: PartnerTab[] }) {
  const pathname = usePathname();
  const active = [...tabs].sort((a, b) => b.path.length - a.path.length).find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    row.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  return (
    <nav className="sticky top-16 z-30 border-b border-white/[0.06] bg-[#050506]/80 backdrop-blur-xl sm:top-[72px]" aria-label="Kabinet bo‘limlari">
      <div ref={row} className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8">
        {tabs.map((t) => {
          const on = active?.path === t.path;
          return (
            <Link
              key={t.path}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors ${
                on ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'text-[#c9c9ce] hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <SiteIcon name={t.icon} size={16} strokeWidth={1.8} />
              {t.label}
              {t.badge && !on ? (
                <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? 'bg-[#0b0b0c] text-[#d4fc18]' : 'bg-[#d4fc18] text-[#0b0b0c]'}`}>
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
