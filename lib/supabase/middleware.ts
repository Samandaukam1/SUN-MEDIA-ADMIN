import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/no-access'];

/** Refreshes the auth cookie on every request and sends anonymous visitors to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getPublicEnv();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = path !== '/' ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : '';
    return NextResponse.redirect(loginUrl);
  }
  if (signedIn && path === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }
  return response;
}
