import type { NextRequest } from 'next/server';

/**
 * A request made by this site's own pages (or typed in the address bar), not by another site in the background:
 * the session cookie only counts for those, so another site cannot act for a signed-in visitor (CSRF). The mobile app
 * uses its token, not cookies.
 */
export function sameSite(request: Pick<NextRequest, 'headers'>): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}
