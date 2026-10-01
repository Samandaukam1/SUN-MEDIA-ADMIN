import 'server-only';

import { z } from 'zod';

import { getPublicEnv } from './env';

const settingsSchema = z.object({ external: z.object({ google: z.boolean().optional() }).passthrough() });

/**
 * Whether Supabase Auth has Google sign-in switched on (its public settings, the same ones the mobile app reads).
 * The login page shows "Google bilan kirish" only then — otherwise the button would lead to a raw
 * "provider is not enabled" error. Refreshed every minute; any failure keeps the button hidden.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  try {
    const { url, key } = getPublicEnv();
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 60 } });
    if (!response.ok) return false;
    return settingsSchema.parse(await response.json()).external.google === true;
  } catch {
    return false;
  }
}
