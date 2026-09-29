import { can, isSystemOwner } from '@/lib/auth';
import type { IconName } from '@/components/ui/Icon';
import type { StaffContext } from '@/types/app';
import type { VisibleSection } from './nav';

type Gate = { permission?: string; anyOf?: string[]; systemOwner?: boolean };
export type NavPage = { href: string; label: string } & Gate;
export type NavSection = { key: string; label: string; icon: IconName; pages: NavPage[] } & Gate;

/**
 * Six sections for admins, a seventh ("Tizim boshqaruvi") only for the Tizim egasi. Everything else is a tab
 * inside its section, so the sidebar never grows. Each page is gated by the same rule its page enforces.
 * Daily work (attendance, shootings, tasks, client chat) happens in the mobile app; the web is for large jobs.
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
      { href: '/clients/accounts', label: 'Mijoz akkauntlari', permission: 'clients.manage' },
    ],
  },
  {
    key: 'team',
    label: 'Jamoa',
    icon: 'users',
    pages: [
      { href: '/team', label: 'Xodimlar', anyOf: ['employees.read', 'employees.manage'] },
      { href: '/team/new', label: 'Xodim qo‘shish', permission: 'employees.manage' },
      { href: '/team/accounts', label: 'Akkauntlar', permission: 'employees.manage' },
      { href: '/team/attendance', label: 'Davomat', anyOf: ['attendance.read', 'attendance.manage'] },
      { href: '/team/performance', label: 'Ish samaradorligi', permission: 'performance.read' },
      { href: '/roles', label: 'Rollar va ruxsatlar', anyOf: ['roles.manage', 'employees.manage'] },
      { href: '/workspace', label: 'E’lonlar', permission: 'workspace.manage' },
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
    pages: [{ href: '/settings', label: 'Ish jadvali va eslatmalar', anyOf: ['settings.manage', 'notifications.manage'] }],
  },
  {
    key: 'system',
    label: 'Tizim boshqaruvi',
    icon: 'shield',
    systemOwner: true,
    pages: [
      { href: '/system/admins', label: 'Adminlar', systemOwner: true },
      { href: '/system/accounts', label: 'Barcha akkauntlar', systemOwner: true },
      { href: '/system/permissions', label: 'Global ruxsatlar', systemOwner: true },
      { href: '/system/sessions', label: 'Sessiyalar', systemOwner: true },
      { href: '/system/locks', label: 'Bloklangan akkauntlar', systemOwner: true },
      { href: '/audit', label: 'Audit log', systemOwner: true },
      { href: '/system/security', label: 'Xavfsizlik', systemOwner: true },
      { href: '/system/integrations', label: 'Integratsiyalar', systemOwner: true },
      { href: '/system/settings', label: 'Tizim sozlamalari', systemOwner: true },
    ],
  },
];

const allowed = (context: StaffContext, gate: Gate) =>
  (!gate.systemOwner || isSystemOwner(context)) && (!gate.permission || can(context, gate.permission)) && (!gate.anyOf || gate.anyOf.some((p) => can(context, p)));

export function navigationFor(context: StaffContext): VisibleSection[] {
  return SECTIONS.filter((s) => allowed(context, s))
    .map((section) => {
      const pages = section.pages.filter((p) => allowed(context, p)).map(({ href, label }) => ({ href, label }));
      return { key: section.key, label: section.label, icon: section.icon, href: pages[0]?.href ?? '/', pages };
    })
    .filter((s) => s.pages.length > 0);
}
