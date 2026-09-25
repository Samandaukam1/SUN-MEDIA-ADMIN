import { can } from '@/lib/auth';
import type { IconName } from '@/components/ui/Icon';
import type { StaffContext } from '@/types/app';

export type NavItem = { href: string; label: string; icon: IconName; permission?: string; anyOf?: string[] };

/** Sections appear here as their modules ship; each entry is gated by the permission its page enforces. */
const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Boshqaruv', items: [{ href: '/', label: 'Dashboard', icon: 'activity', permission: 'dashboard.view' }] },
  {
    title: 'Odamlar',
    items: [
      { href: '/team', label: 'Jamoa', icon: 'users', anyOf: ['employees.read', 'employees.manage'] },
      { href: '/clients', label: 'Mijozlar', icon: 'briefcase', anyOf: ['clients.read_all', 'clients.manage'] },
    ],
  },
  {
    title: 'Tizim',
    items: [
      { href: '/workspace', label: 'Ish joyi', icon: 'megaphone', permission: 'workspace.manage' },
      { href: '/roles', label: 'Rollar va ruxsatlar', icon: 'shield', anyOf: ['roles.manage', 'employees.manage'] },
      { href: '/settings', label: 'Sozlamalar', icon: 'settings', anyOf: ['settings.manage', 'employees.manage', 'notifications.manage'] },
    ],
  },
];

export function navigationFor(context: StaffContext) {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (i) => (!i.permission || can(context, i.permission)) && (!i.anyOf || i.anyOf.some((p) => can(context, p))),
    ),
  })).filter((group) => group.items.length > 0);
}
