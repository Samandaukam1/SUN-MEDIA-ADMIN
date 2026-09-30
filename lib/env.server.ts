import 'server-only';

/** Service-role / secret key. Read lazily so builds never require it and it can never reach the client bundle. */
export function getSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) {
    throw new Error('SUPABASE_SECRET_KEY (yoki SUPABASE_SERVICE_ROLE_KEY) server muhitida sozlanmagan.');
  }
  return key;
}

/** Public origin of the panel (OAuth return links). Localhost is a development-only fallback. */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (url) return url.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_SITE_URL production muhitida sozlanmagan.');
  return 'http://localhost:3000';
}
