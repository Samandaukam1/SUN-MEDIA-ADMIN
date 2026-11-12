import { NextResponse, type NextRequest } from 'next/server';

import { TOKEN_COOKIE, TOKEN_TTL_HOURS } from '@/lib/brief/server';

/**
 * A device link (/suhbat/k/<key>): puts the key into this browser's interview cookie and leaves the address at once,
 * so the key does not stay in the address bar or history. /suhbat checks it; a wrong or used key opens nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = NextResponse.redirect(new URL('/suhbat', request.url), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  if (/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    res.cookies.set(TOKEN_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/suhbat', maxAge: TOKEN_TTL_HOURS * 3600 });
  }
  return res;
}
