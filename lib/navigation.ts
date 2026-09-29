import { can } from '@/lib/auth';
import type { IconName } from '@/components/ui/Icon';
import type { StaffContext } from '@/types/app';
import type { VisibleSection } from './nav';

type Gate = { permission?: string; anyOf?: string[] };
export type NavPage = { href: string; label: string } & Gate;
export type NavSection = { key: string; label: string; icon: IconName; pages: NavPage[] };

/**
 * Six places, nothing more. Everything else lives as a tab inside its section, so the sidebar never grows.
 * Each page is gated by the same permission its page enforces.
 */
const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Bosh sahifa', icon: 'home', pages: [{ href: '/', label: 'Bugun' }] },
  {
    key: 'work',
    label: 'Ish jarayoni',
    icon: 'layers',
    pages: [
      { href: '/work/content', label: 'Kontent', anyOf: ['content.manage', 'clients.read_all', 'approvals.manage'] },
      { href: '/work/calendar', label: 'Kalendar', anyOf: ['content.manage', 'shootings.manage', 'clients.read_all'] },
      { href: '/work/shootings', label: 'Syomkalar', anyOf: ['shootings.manage', 'clients.read_all'] },
      { href: '/work/tasks', label: 'Vazifalar', anyOf: ['tasks.manage', 'tasks.read_all'] },
      { href: '/work/approvals', label: 'Tasdiqlashlar', anyOf: ['approvals.manage'] },
      { href: '/work/files', label: 'Fayllar', anyOf: ['files.manage', 'clients.read_all'] },
    ],
  },
  {
    key: 'clients',
    label: 'Mijozlar',
    icon: 'briefcase',
    pages: [
      { href: '/clients', label: 'Barcha mijozlar', anyOf: ['clients.read_all', 'clients.manage'] },
      { href: '/clients/projects', label: 'Loyihalar', anyOf: ['projects.manage', 'clients.read_all'] },
      { href: '/plans', label: 'Tariflar', anyOf: ['plans.manage', 'subscriptions.read', 'subscriptions.manage'] },
      { href: '/clients/contracts', label: 'Shartnomalar', permission: 'contracts.manage' },
    ],
  },
  {
    key: 'team',
    label: 'Jamoa',
    icon: 'users',
    pages: [
      { href: '/team', label: 'Xodimlar', anyOf: ['employees.read', 'employees.manage'] },
      { href: '/team/attendance', label: 'Davomat', anyOf: ['attendance.read', 'attendance.manage'] },
      { href: '/team/performance', label: 'Ish samaradorligi', permission: 'performance.read' },
      { href: '/roles', label: 'Rollar va ruxsatlar', anyOf: ['roles.manage', 'employees.manage'] },
      { href: '/team/accounts', label: 'Akkauntlar', permission: 'employees.manage' },
      { href: '/workspace', label: 'E’lonlar va hujjatlar', permission: 'workspace.manage' },
    ],
  },
  {
    key: 'reports',
    label: 'Hisobotlar',
    icon: 'barChart',
    pages: [
      { href: '/reports', label: 'Mijozlar hisoboti', anyOf: ['reports.read', 'reports.manage'] },
      { href: '/reports/monthly', label: 'Oylik natijalar', anyOf: ['reports.read', 'reports.manage'] },
      { href: '/reports/team', label: 'Xodimlar KPI', permission: 'performance.read' },
      { href: '/reports/agency', label: 'Agentlik statistikasi', permission: 'dashboard.view' },
    ],
  },
  {
    key: 'settings',
    label: 'Sozlamalar',
    icon: 'settings',
    pages: [
      { href: '/settings', label: 'Umumiy', anyOf: ['settings.manage', 'employees.manage', 'notifications.manage'] },
      { href: '/audit', label: 'Faoliyat tarixi', permission: 'audit.read' },
    ],
  },
];

const allowed = (context: StaffContext, gate: Gate) => (!gate.permission || can(context, gate.permission)) && (!gate.anyOf || gate.anyOf.some((p) => can(context, p)));

export function navigationFor(context: StaffContext): VisibleSection[] {
  return SECTIONS.map((section) => {
    const pages = section.pages.filter((p) => allowed(context, p)).map(({ href, label }) => ({ href, label }));
    return { key: section.key, label: section.label, icon: section.icon, href: pages[0]?.href ?? '/', pages };
  }).filter((s) => s.pages.length > 0);
}
