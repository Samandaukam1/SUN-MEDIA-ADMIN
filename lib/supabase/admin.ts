import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env';
import { getSecretKey } from '@/lib/env.server';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses RLS — use ONLY for Auth admin operations (create/invite/ban users)
 * after the caller's permission has been verified through their own session.
 */
export function createAdminClient() {
  return createClient<Database>(getPublicEnv().url, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
