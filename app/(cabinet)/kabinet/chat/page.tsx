import type { Metadata } from 'next';
import Link from 'next/link';

import { ChatPanel } from '@/components/cabinet/partner/ChatPanel';
import { Panel } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { partnerHref, resolvePartner } from '@/lib/cabinet/partner-context';
import { CHAT_PAGE, loadChatRoom, loadMessages } from '@/lib/cabinet/partner-data';

export const metadata: Metadata = { title: 'Chat' };

/** The brand's chat with its SUN MEDIA team (the same room as in the mobile app). */
export default async function PartnerChatPage({ searchParams }: { searchParams: Promise<{ brend?: string; oldin?: string }> }) {
  const params = await searchParams;
  const scope = await resolvePartner(params.brend);
  const room = await loadChatRoom(scope.clientId);
  if (!room) {
    return (
      <PartnerFrame scope={scope} title="Chat">
        <Panel>
          <p className="py-6 text-center text-[14px] text-[#8e8e96]">Chat hali ochilmagan. SUN MEDIA menejeringiz bilan bog‘laning.</p>
        </Panel>
      </PartnerFrame>
    );
  }
  const before = params.oldin && !Number.isNaN(Date.parse(params.oldin)) ? params.oldin : null;
  const messages = await loadMessages(room.id, before);
  const older = messages.length === CHAT_PAGE ? partnerHref(scope, '/kabinet/chat', { oldin: messages[0].created_at }) : null;

  return (
    <PartnerFrame scope={scope} title="Chat" subtitle="SUN MEDIA jamoangiz bilan to‘g‘ridan-to‘g‘ri yozishma.">
      {before ? (
        <Link href={partnerHref(scope, '/kabinet/chat')} className="text-[13.5px] text-[#d4fc18] hover:underline">
          ← Eng yangi xabarlarga qaytish
        </Link>
      ) : null}
      <ChatPanel
        roomId={room.id}
        brand={new URLSearchParams(scope.brandQuery).get('brend')}
        me={scope.context.userId}
        messages={messages}
        olderHref={older}
        readOnly={scope.preview}
        live={!before}
      />
    </PartnerFrame>
  );
}
