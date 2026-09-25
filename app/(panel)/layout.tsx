import { Sidebar } from '@/components/panel/Sidebar';
import { requireStaff } from '@/lib/auth';
import { navigationFor } from '@/lib/navigation';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await requireStaff();
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        groups={navigationFor(context)}
        user={{
          name: context.profile?.full_name || context.profile?.email || '—',
          role: context.roles.map((r) => r.name).join(', '),
          initials: initials(context.profile?.full_name ?? context.profile?.email ?? ''),
        }}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-9">{children}</div>
      </main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}
