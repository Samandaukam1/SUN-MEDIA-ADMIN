/**
 * Order targets, canonical (pure; unit-tested). The canonical key is what "the same target" means for the queue,
 * the recent-link suggestions and the Instagram profile cards; the link actually sent stays as the owner typed it.
 * An Instagram post / reel shortcode is never taken for a username, and a post link never names its profile here.
 */

export type TargetKind = 'profile' | 'post' | 'link';
export type TargetInfo = {
  platform: string;
  kind: TargetKind;
  /** Canonical key: "ig:u:<username>", "ig:p:<shortcode>", or the normalised link. */
  key: string;
  username: string | null;
  shortcode: string | null;
  /** A readable canonical form (the profile URL for an Instagram account). */
  canonical: string;
};

const IG_HOST = /^(www\.|m\.)?instagram\.com$|^(www\.)?instagr\.am$/;
const IG_USER = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;
const IG_POST = new Set(['p', 'reel', 'reels', 'tv']);
// First path segments that are Instagram pages, not accounts.
const IG_RESERVED = new Set([
  ...IG_POST,
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'developer',
  'legal',
  'web',
  's',
  'tags',
  'locations',
  'challenge',
  'privacy',
  'terms',
  'api',
  'oauth',
  'graphql',
  'static',
  'share',
  'emails',
  'session',
  'login',
  'signup',
]);
const SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;

const igProfile = (username: string): TargetInfo => ({
  platform: 'Instagram',
  kind: 'profile',
  key: `ig:u:${username}`,
  username,
  shortcode: null,
  canonical: `https://www.instagram.com/${username}`,
});

/** A plain link, normalised: lower-case host without "www.", no fragment, no trailing slash; the query is kept. */
function plainLink(platform: string, url: URL): TargetInfo {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const canonical = `https://${host}${path}${url.search}`;
  return { platform, kind: 'link', key: canonical.slice(0, 600), username: null, shortcode: null, canonical };
}

/** null when the text is not a link or a handle at all (the service's own target check says why). */
export function parseTarget(raw: string, platform: string): TargetInfo | null {
  const t = raw.trim();
  if (!t || t.length > 500 || /\s/.test(t)) return null;

  if (!/^https?:\/\//i.test(t)) {
    const handle = t.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,64}$/.test(handle)) return null;
    if (platform === 'Instagram') return IG_USER.test(handle) ? igProfile(handle) : null;
    return { platform, kind: 'profile', key: `${platform.toLowerCase()}:@${handle}`, username: handle, shortcode: null, canonical: `@${handle}` };
  }

  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!IG_HOST.test(host)) return plainLink(platform, url);

  const segs = url.pathname.split('/').filter(Boolean);
  const first = (segs[0] ?? '').toLowerCase();
  // instagram.com/p/<code>, /reel/<code>, and the newer /<username>/p/<code> (the username there is not trusted).
  const postAt = IG_POST.has(first) ? 0 : IG_POST.has((segs[1] ?? '').toLowerCase()) ? 1 : -1;
  if (postAt >= 0 && segs[postAt + 1] && SHORTCODE.test(segs[postAt + 1])) {
    const shortcode = segs[postAt + 1];
    return { platform: 'Instagram', kind: 'post', key: `ig:p:${shortcode}`, username: null, shortcode, canonical: `https://www.instagram.com/p/${shortcode}` };
  }
  if (first && !IG_RESERVED.has(first) && IG_USER.test(first)) return igProfile(first);
  return plainLink('Instagram', url);
}

/** The queue key: one active order per provider account + service + canonical target. */
export const queueKey = (serviceId: number, target: TargetInfo) => `neosmm:${serviceId}:${target.key}`.slice(0, 700);
