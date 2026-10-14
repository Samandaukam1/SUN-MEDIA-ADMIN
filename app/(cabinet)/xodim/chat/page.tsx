import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { StaffHeaderActions } from '@/components/cabinet/StaffHeaderActions';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { PresenceHeartbeat } from '@/components/live/PresenceHeartbeat';
import { getSessionContext } from '@/lib/auth';
import { homeFor } from '@/lib/cabinet/routing';
import { loadMyChats, unreadTotal } from '@/lib/chat';

export const metadata: Metadata = { title: 'Chat' };

/** The staff cabinet's chat: the same rooms, messages and read receipts as the app and the panel. */
export default async function StaffChatPage({ searchParams }: { searchParams: Promise<{ xona?: string; oldin?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=xodim');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.kind !== 'staff') redirect(home);
  if (context.temporary_password) redirect('/parol');
  const { xona, oldin } = await searchParams;
  const chats = await loadMyChats().catch(() => []);
  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';
  return (
    <>
      <PresenceHeartbeat />
      <CabinetHeader
        name={context.profile?.full_name || context.profile?.email || ''}
        role={role}
        home="/xodim"
        extra={<StaffHeaderActions userId={context.userId} unreadChats={unreadTotal(chats)} />}
      />
      <main className="cabinet-tokens mx-auto max-w-6xl px-3 pt-6 pb-10 sm:px-8">
        <ChatWorkspace mode="staff" xona={xona} oldin={oldin} />
      </main>
    </>
  );
}
