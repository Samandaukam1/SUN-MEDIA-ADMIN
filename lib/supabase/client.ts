'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getBrowserClient() {
  if (!client) {
    const { url, key } = getPublicEnv();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
