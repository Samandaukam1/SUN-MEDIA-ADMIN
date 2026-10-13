import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getPublicEnv } from '@/lib/env';
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
 * Refreshes the auth cookie on every request. The domain is the public site for everyone; staff and partners sign in
 * only through the footer buttons. Anonymous visitors to private pages (and the old /login address) land on the home page.
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

  if (under(path, '/login')) return redirect(signedIn ? '/panel' : '/');
  // Not signed in: the site's home page, as for every visitor. The sign-in window opens only from the footer buttons.
  if (!signedIn && !OPEN_PATHS.some((p) => under(path, p))) return redirect('/');
  // Signed-in pages are personal: never stored by the browser or a shared cache.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
