import { redirect } from 'next/navigation';

import type { CreateItem } from '@/components/panel/CreateMenu';
import { PanelShell } from '@/components/panel/PanelShell';
import { can, canUsePanel, requireStaff } from '@/lib/auth';
import { loadMyChats, unreadTotal } from '@/lib/chat';
import { navigationFor } from '@/lib/navigation';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await requireStaff();
  // An admin-issued password is replaced before anything else opens.
  if (context.temporary_password) redirect('/parol');
  // Web panel = management (system owner, admins, Rahbar); other staff have their own cabinet.
  if (!canUsePanel(context)) redirect('/xodim');
  // Unread chat messages on the sidebar's Chat entry.
  const unread = unreadTotal(await loadMyChats().catch(() => []));
  const sections = navigationFor(context).map((s) => (s.key === 'chat' ? { ...s, badge: unread } : s));
  const create: CreateItem[] = [
    can(context, 'content.manage') ? { href: '/work/content/new', label: 'Yangi kontent', icon: 'film' as const, hint: 'Reels, post, stories…' } : null,
    can(context, 'shootings.manage') ? { href: '/work/shootings/new', label: 'Yangi syomka', icon: 'video' as const, hint: 'Vaqt, joy va jamoa' } : null,
    can(context, 'tasks.manage') ? { href: '/work/tasks/new', label: 'Yangi vazifa', icon: 'checkSquare' as const, hint: 'Kimga va qachongacha' } : null,
    can(context, 'clients.create') ? { href: '/clients?new=1', label: 'Yangi mijoz', icon: 'briefcase' as const, hint: 'Kompaniya va login' } : null,
    can(context, 'employees.create') ? { href: '/team/new', label: 'Yangi xodim', icon: 'users' as const, hint: 'Lavozim, login va parol' } : null,
  ].filter((i) => i !== null);

  return (
    <PanelShell
      sections={sections}
      create={create}
      user={{
        name: context.profile?.full_name || context.profile?.email || '—',
        role: context.roles.map((r) => r.name).join(', '),
        initials: initials(context.profile?.full_name ?? context.profile?.email ?? ''),
      }}
    >
      {children}
    </PanelShell>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}
