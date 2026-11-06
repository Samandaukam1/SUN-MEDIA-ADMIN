import { NextResponse, type NextRequest } from 'next/server';

import { completeConnect } from '@/lib/instagram/server';
import { isSmmOwner } from '@/lib/neosmm/server';

// Instagram's redirect after the owner's consent. Only a configured owner, only with a state they created themselves
// (one-time, 10 minutes). The result goes back to the profile card as a short code — never a token.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const owner = await isSmmOwner();
  if (!owner) return new NextResponse(null, { status: 404 });
  const q = request.nextUrl.searchParams;
  const result = await completeConnect(owner, { state: q.get('state') ?? '', code: q.get('code'), error: q.get('error') });
  const back = new URL('/smm-api', request.url);
  back.searchParams.set('bolim', 'profillar');
  if ('profileId' in result && result.profileId) back.searchParams.set('profil', result.profileId);
  back.searchParams.set('ig', result.code);
  if ('got' in result && result.got) back.searchParams.set('ig_user', result.got);
  if (result.code === 'connected' && result.missing.length) back.searchParams.set('ig_missing', result.missing.join(','));
  if (result.code === 'failed' && result.message) back.searchParams.set('ig_msg', result.message.slice(0, 200));
  const res = NextResponse.redirect(back, { status: 303 });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
