import 'server-only';

/** Service-role / secret key. Read lazily so builds never require it and it can never reach the client bundle. */
export function getSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) {
    throw new Error('SUPABASE_SECRET_KEY (yoki SUPABASE_SERVICE_ROLE_KEY) server muhitida sozlanmagan.');
  }
  return key;
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` || 'http://localhost:3000').replace(/\/$/, '');
}
