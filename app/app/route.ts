import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/lib/auth';
import { destinationFor } from '@/lib/cabinet/routing';

export const dynamic = 'force-dynamic';

/**
 * The installed app's start page: the person's own area (panel, staff cabinet or partner cabinet), or — when nobody is
 * signed in on this device — the site with the sign-in window open.
 */
export async function GET(request: NextRequest) {
  const context = await getSessionContext().catch(() => null);
  const to = destinationFor(context, null);
  const res = NextResponse.redirect(new URL(to ?? '/?kirish=1', request.url), { status: 303 });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
