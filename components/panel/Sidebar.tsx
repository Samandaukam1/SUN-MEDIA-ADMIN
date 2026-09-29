'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import { locate, type VisibleSection } from '@/lib/nav';
import { CreateMenu, type CreateItem } from './CreateMenu';

type Props = {
  sections: VisibleSection[];
  create: CreateItem[];
  user: { name: string; role: string; initials: string };
};

/** Six sections and one "+ Yaratish" — the pages of a section are tabs at the top, not more sidebar rows. */
export function Sidebar({ sections, create, user }: Props) {
  const pathname = usePathname();
  const active = locate(sections, pathname)?.section.key;
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="px-6 pt-7 pb-5">
        <Link href="/" aria-label="SUN MEDIA — Bosh sahifa">
          <Logo width={128} onDark />
        </Link>
      </div>
      {create.length ? (
        <div className="px-3 pb-5">
          <CreateMenu items={create} />
        </div>
      ) : null}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Asosiy menyu">
        <ul className="space-y-0.5">
          {sections.map((section) => {
            const on = section.key === active;
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                    on ? 'bg-white/[0.08] text-sidebar-active' : 'hover:bg-white/[0.04] hover:text-sidebar-active',
                  )}
                >
                  {on ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-brand" aria-hidden /> : null}
                  <Icon name={section.icon} className={on ? 'text-brand' : undefined} />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
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
