import 'server-only';

import { getPublicEnv } from '@/lib/env';

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

/** Host of the Supabase project this server talks to. */
export function supabaseHost(): string {
  return new URL(getPublicEnv().url).host;
}

/** DEV ONLY: the seed test accounts exist only in the local Supabase, so quick login needs `next dev` against it. */
export function devQuickLoginAvailable(): boolean {
  return process.env.NODE_ENV === 'development' && LOCAL_HOST.test(new URL(getPublicEnv().url).hostname);
}
