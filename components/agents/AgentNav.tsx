'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/agents', 'Umumiy'],
  ['/agents/profillar', 'Mijozlar'],
  ['/agents/taqvim', 'Kontent reja'],
  ['/agents/generatsiya', 'Generatsiya'],
  ['/agents/tasdiqlash', 'Tasdiqlash'],
  ['/agents/tayyor', 'Tayyor kontent'],
  ['/agents/trendlar', 'Trend Radar'],
  ['/agents/tahlil', 'Tahlil'],
  ['/agents/sozlamalar', 'Sozlamalar'],
] as const;

/** The agent's own sections, inside the existing panel (not a second dashboard). */
export function AgentNav() {
  const path = usePathname();
  return (
    <nav aria-label="AI kontent agent" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {LINKS.map(([href, label]) => {
        const on = href === '/agents' ? path === href : path.startsWith(href) || (href === '/agents/tasdiqlash' && path.startsWith('/agents/kontent'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors ${on ? 'bg-accent text-accent-fg font-semibold' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
