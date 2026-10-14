import Link from 'next/link';

import { NotificationBell } from '@/components/live/NotificationBell';
import { SiteIcon } from '@/components/site/SiteIcon';

/** Staff cabinet header: chat (with unread messages) and the notification bell. */
export function StaffHeaderActions({ userId, unreadChats }: { userId: string; unreadChats: number }) {
  return (
    <>
      <Link
        href="/xodim/chat"
        aria-label={unreadChats ? `Chat: ${unreadChats} ta yangi xabar` : 'Chat'}
        title="Chat"
        className="lg relative grid size-10 shrink-0 place-items-center rounded-full text-[#d9d9de] transition-colors hover:text-[#d4fc18]"
      >
        <SiteIcon name="message" size={17} />
        {unreadChats ? (
          <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#d4fc18] px-1 text-[10.5px] font-bold text-[#0b0b0c]">
            {unreadChats > 99 ? '99+' : unreadChats}
          </span>
        ) : null}
      </Link>
      <NotificationBell userId={userId} area="staff" tone="dark" />
    </>
  );
}
