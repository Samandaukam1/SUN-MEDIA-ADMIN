import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The VAPID public key the browser subscribes with (public by design); push is off until the server has keys. */
export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
  return NextResponse.json({ enabled: !!publicKey, publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}
