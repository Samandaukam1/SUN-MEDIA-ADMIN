import { NextResponse, type NextRequest } from 'next/server';

import { revokeThisDevice } from '@/lib/pwa/server';
import { createClient } from '@/lib/supabase/server';

/** Ends this browser's session (other devices stay signed in) and returns to the public site. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await revokeThisDevice(supabase);
  await supabase.auth.signOut({ scope: 'local' });
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  // The browser drops its cached copies of this site, so the next person at this computer sees nothing private.
  response.headers.set('Clear-Site-Data', '"cache"');
  return response;
}
