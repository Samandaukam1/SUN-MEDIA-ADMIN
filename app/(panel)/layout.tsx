import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import type { CreateItem } from '@/components/panel/CreateMenu';
import { Sidebar } from '@/components/panel/Sidebar';
import { TopBar } from '@/components/panel/TopBar';
import { can, canUsePanel, requireStaff } from '@/lib/auth';
import { navigationFor } from '@/lib/navigation';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await requireStaff();
  // Web = large management for the system owner and admins; employees work in the mobile app.
  if (!canUsePanel(context)) redirect('/no-access?reason=mobile');
  const sections = navigationFor(context);
  const create: CreateItem[] = [
    can(context, 'content.manage') ? { href: '/work/content/new', label: 'Yangi kontent', icon: 'film' as const, hint: 'Reels, post, stories…' } : null,
    can(context, 'shootings.manage') ? { href: '/work/shootings/new', label: 'Yangi syomka', icon: 'video' as const, hint: 'Vaqt, joy va jamoa' } : null,
    can(context, 'tasks.manage') ? { href: '/work/tasks/new', label: 'Yangi vazifa', icon: 'checkSquare' as const, hint: 'Kimga va qachongacha' } : null,
    can(context, 'clients.manage') ? { href: '/clients?new=1', label: 'Yangi mijoz', icon: 'briefcase' as const, hint: 'Kompaniya va login' } : null,
    can(context, 'employees.manage') ? { href: '/team/new', label: 'Yangi xodim', icon: 'users' as const, hint: 'Lavozim, login va parol' } : null,
  ].filter((i) => i !== null);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        sections={sections}
        create={create}
        user={{
          name: context.profile?.full_name || context.profile?.email || '—',
          role: context.roles.map((r) => r.name).join(', '),
          initials: initials(context.profile?.full_name ?? context.profile?.email ?? ''),
        }}
      />
      <main className="flex-1 overflow-y-auto">
        <Suspense>
          <TopBar sections={sections} />
        </Suspense>
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}
