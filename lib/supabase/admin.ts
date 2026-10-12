import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env';
import { getSecretKey } from '@/lib/env.server';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses RLS — use ONLY for Auth admin operations (create/invite/ban users)
 * after the caller's permission has been verified through their own session, and for the public site's
 * service-role-only RPCs (published site content, footer gate check, "Ariza qoldirish"; the latter two rate-limit
 * by a server-computed visitor key).
 */
export function createAdminClient() {
  return createClient<Database>(getPublicEnv().url, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
