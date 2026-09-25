import { Sidebar } from '@/components/panel/Sidebar';
import { requireStaff } from '@/lib/auth';
import { navigationFor } from '@/lib/navigation';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await requireStaff();
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        groups={navigationFor(context)}
        user={{ name: context.profile?.full_name || context.profile?.email || '—', role: context.roles.map((r) => r.name).join(', ') }}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
