import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getPublicEnv } from '@/lib/env';
import { GATE_COOKIE, gateSecret, verifyGateToken } from '@/lib/site/gate-token';
import type { Database } from '@/types/database';

/** Pages anyone may open without signing in (auth return links, the "no access" notice). */
const OPEN_PATHS = ['/auth/callback', '/no-access'];

/** The public website: the landing page, its pages and the files search engines ask for. */
const SITE_PATHS = ['/xizmatlar', '/keyslar', '/hamkorlar', '/tariflar', '/biz-haqimizda', '/aloqa'];
const SITE_FILES = ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/opengraph-image'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isSitePath(path: string): boolean {
  return path === '/' || SITE_PATHS.some((p) => under(path, p)) || SITE_FILES.some((p) => path.startsWith(p));
}

/**
 * Refreshes the auth cookie on every request. The domain is the public site; the panel's login only opens
 * after the footer code (sm_gate cookie). Anonymous visitors to panel pages land on the site, not on a login form.
 */
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

  if (isSitePath(path) || path.startsWith('/_next/')) return response;

  const redirect = (pathname: string, search = '') => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    target.search = search;
    const out = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => out.cookies.set(cookie));
    return out;
  };
  const gateOpen = () => verifyGateToken(request.cookies.get(GATE_COOKIE)?.value, gateSecret());

  if (under(path, '/login')) {
    if (signedIn) return redirect('/panel');
    return (await gateOpen()) ? response : redirect('/');
  }
  if (!signedIn && !OPEN_PATHS.some((p) => under(path, p))) {
    if (await gateOpen()) return redirect('/login', `?next=${encodeURIComponent(path + request.nextUrl.search)}`);
    return redirect('/');
  }
  return response;
}
