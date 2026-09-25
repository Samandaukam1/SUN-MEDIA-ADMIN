'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/components/ui/cn';
import type { NavIcon, NavItem } from '@/lib/navigation';

const ICONS: Record<NavIcon, React.ReactNode> = {
  activity: (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
};

type Props = {
  groups: Array<{ title: string; items: NavItem[] }>;
  user: { name: string; role: string };
};

export function Sidebar({ groups, user }: Props) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="flex items-center gap-3 px-6 py-6">
        <LogoMark size={26} />
        <span className="text-[13px] font-bold tracking-[0.28em] text-sidebar-active">SUN MEDIA</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Asosiy menyu">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-white/40 uppercase">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        active ? 'bg-white/[0.07] text-sidebar-active' : 'hover:bg-white/[0.04] hover:text-sidebar-active',
                      )}
                    >
                      <span className={active ? 'text-[#F5A524]' : undefined}>{ICONS[item.icon]}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/[0.06] px-6 py-5">
        <p className="truncate text-sm font-medium text-sidebar-active">{user.name}</p>
        <p className="truncate text-xs">{user.role}</p>
        <form action="/auth/signout" method="post" className="mt-3">
          <button type="submit" className="text-xs font-medium text-[#F5A524] hover:underline">
            Chiqish
          </button>
        </form>
      </div>
    </aside>
  );
}
