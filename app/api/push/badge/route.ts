import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The number on the app icon, from the server: unread notifications, each chat with unread messages counted once
 * (the same rule as the phone app's badge). It goes down as things are read, never only up.
 */
export async function GET() {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ count: 0 }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const [others, chats] = await Promise.all([
    db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).neq('type', 'chat.message'),
    db.from('notifications').select('entity_id').is('read_at', null).eq('type', 'chat.message').limit(1000),
  ]);
  const count = (others.count ?? 0) + new Set((chats.data ?? []).map((c) => c.entity_id)).size;
  return NextResponse.json({ count }, { headers: { 'Cache-Control': 'private, no-store' } });
}
