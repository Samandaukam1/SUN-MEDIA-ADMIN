'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import type { NavItem } from '@/lib/navigation';

type Props = {
  groups: { title: string; items: NavItem[] }[];
  user: { name: string; role: string; initials: string };
};

export function Sidebar({ groups, user }: Props) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="px-6 pt-7 pb-6">
        <Link href="/" aria-label="SUN MEDIA — Dashboard">
          <Logo width={132} onDark />
        </Link>
      </div>
      <nav className="flex-1 space-y-7 overflow-y-auto px-3 pb-4" aria-label="Asosiy menyu">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.1em] text-white/35 uppercase">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        active ? 'bg-white/[0.08] text-sidebar-active' : 'hover:bg-white/[0.04] hover:text-sidebar-active',
                      )}
                    >
                      {active ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-brand" aria-hidden /> : null}
                      <Icon name={item.icon} className={active ? 'text-brand' : undefined} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">{user.initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-active">{user.name}</p>
          <p className="truncate text-xs">{user.role}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" title="Chiqish" aria-label="Chiqish" className="rounded-lg p-2 text-sidebar-text hover:bg-white/[0.06] hover:text-sidebar-active">
            <Icon name="logOut" size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
