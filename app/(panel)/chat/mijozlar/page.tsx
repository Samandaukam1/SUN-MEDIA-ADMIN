import type { Metadata } from 'next';

import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Mijozlar bilan chat' };

/** Chat → Mijozlar: one chat per client, the same room the client sees in their cabinet and app. */
export default async function ClientChatPage({ searchParams }: { searchParams: Promise<{ xona?: string; oldin?: string }> }) {
  const { xona, oldin } = await searchParams;
  return <ChatWorkspace mode="clients" xona={xona} oldin={oldin} />;
}
