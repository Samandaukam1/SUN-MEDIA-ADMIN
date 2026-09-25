import { can } from '@/lib/auth';
import type { StaffContext } from '@/types/app';

export type NavItem = { href: string; label: string; icon: NavIcon; permission?: string };
export type NavIcon = 'activity';

/** Sections appear here as their modules ship; each entry is gated by the permission its page enforces. */
const NAV: Array<{ title: string; items: NavItem[] }> = [
  { title: 'Boshqaruv', items: [{ href: '/', label: 'Command Center', icon: 'activity', permission: 'dashboard.view' }] },
];

export function navigationFor(context: StaffContext) {
  return NAV.map((group) => ({ ...group, items: group.items.filter((i) => !i.permission || can(context, i.permission)) })).filter(
    (group) => group.items.length > 0,
  );
}
