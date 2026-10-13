import type { Metadata } from 'next';

import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Jamoa chati' };

/** Chat → Jamoa: SUN MEDIA's own groups and direct messages. */
export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ xona?: string; oldin?: string }> }) {
  const { xona, oldin } = await searchParams;
  return <ChatWorkspace mode="team" xona={xona} oldin={oldin} />;
}
