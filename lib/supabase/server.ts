import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/** Request-scoped client acting as the signed-in user: every query runs under RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getPublicEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes cookies instead.
        }
      },
    },
  });
}
