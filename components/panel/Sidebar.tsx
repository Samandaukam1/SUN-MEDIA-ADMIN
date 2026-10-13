'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import { locate, type VisibleSection } from '@/lib/nav';
import { CreateMenu, type CreateItem } from './CreateMenu';

export type SidebarProps = {
  sections: VisibleSection[];
  create: CreateItem[];
  user: { name: string; role: string; initials: string };
};

/**
 * Six sections and one "+ Yaratish" — the pages of a section are tabs at the top, not more sidebar rows.
 * Desktop: always visible. Phones and tablets: a drawer opened from the top bar's menu button.
 */
export function Sidebar({ sections, create, user, open = false, onClose }: SidebarProps & { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const active = locate(sections, pathname)?.section.key;
  return (
    <aside
      id="panel-menu"
      aria-label="Panel menyusi"
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-text shadow-2xl transition-transform duration-300 ease-out',
        'lg:static lg:z-auto lg:h-full lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:transition-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-start justify-between px-6 pt-7 pb-5">
        <Link href="/panel" aria-label="SUN MEDIA — Bosh sahifa">
          <Logo width={128} onDark />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Menyuni yopish"
          className="-mt-1 -mr-2 grid size-10 place-items-center rounded-xl text-sidebar-text hover:bg-white/[0.06] hover:text-sidebar-active lg:hidden"
        >
          <Icon name="x" size={20} />
        </button>
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
                  {section.badge ? (
                    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">
                      {section.badge > 99 ? '99+' : section.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-4">
        <Link href="/profil" title="Mening profilim" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-90">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">{user.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-active">{user.name}</span>
            <span className="block truncate text-xs">{user.role}</span>
          </span>
        </Link>
        <Link href="/parol" title="Parolni almashtirish" aria-label="Parolni almashtirish" className="rounded-lg p-2 text-sidebar-text hover:bg-white/[0.06] hover:text-sidebar-active">
          <Icon name="key" size={17} />
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" title="Chiqish" aria-label="Chiqish" className="rounded-lg p-2 text-sidebar-text hover:bg-white/[0.06] hover:text-sidebar-active">
            <Icon name="logOut" size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
