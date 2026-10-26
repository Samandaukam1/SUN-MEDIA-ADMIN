import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { StaffHeaderActions } from '@/components/cabinet/StaffHeaderActions';
import { NotificationSettings } from '@/components/pwa/NotificationSettings';
import { getSessionContext } from '@/lib/auth';
import { homeFor } from '@/lib/cabinet/routing';
import { loadMyChats, unreadTotal } from '@/lib/chat';

export const metadata: Metadata = { title: 'Bildirishnomalar' };

/** The staff cabinet's notification settings: push on this device, kinds, privacy, quiet hours, chats, devices. */
export default async function StaffNotificationsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=xodim&next=/xodim/bildirishnomalar');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.kind !== 'staff') redirect(home);
  if (context.temporary_password) redirect('/parol');
  const chats = await loadMyChats().catch(() => []);
  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';
  return (
    <>
      <CabinetHeader
        name={context.profile?.full_name || context.profile?.email || ''}
        role={role}
        home={home}
        extra={<StaffHeaderActions userId={context.userId} unreadChats={unreadTotal(chats)} />}
      />
      <main className="mx-auto max-w-3xl px-4 pt-7 pb-20 sm:px-8 sm:pt-10">
        <h1 className="font-display text-[26px] leading-tight font-medium tracking-[-0.03em] text-white sm:text-[32px]">Bildirishnomalar</h1>
        <p className="mt-1.5 mb-6 text-[14px] text-[#8e8e96]">Telefon, planshet va kompyuterga keladigan xabarlar.</p>
        <NotificationSettings userId={context.userId} tone="dark" />
      </main>
    </>
  );
}
