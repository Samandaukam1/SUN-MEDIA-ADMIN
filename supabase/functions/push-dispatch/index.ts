// push-dispatch: drains the notification_deliveries queue into Expo push. Called by the database
// (pg_net, right after notifications are created, and by the per-minute sweep) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { chunk, toExpoMessages, toResults, type Claimed, type ExpoTicket } from './results.ts';

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const MAX_ROUNDS = 10;
const BATCH = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('PUSH_DISPATCH_SECRET');
  if (!secret || req.headers.get('x-dispatch-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  let sent = 0;
  let failed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await supabase.rpc('claim_push_deliveries', { p_limit: BATCH });
    if (error) return json({ error: error.message, sent, failed }, 500);
    const batch = (data ?? []) as Claimed[];
    if (batch.length === 0) break;

    for (const part of chunk(batch, BATCH)) {
      let tickets: ExpoTicket[] | null = null;
      let httpError: string | undefined;
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(toExpoMessages(part)),
        });
        if (res.ok) tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? null;
        else httpError = `Expo HTTP ${res.status}`;
      } catch (e) {
        httpError = e instanceof Error ? e.message : 'Network error';
      }
      const results = toResults(part, tickets, httpError);
      const { error: completeError } = await supabase.rpc('complete_push_deliveries', { p_results: results });
      if (completeError) return json({ error: completeError.message, sent, failed }, 500);
      sent += results.filter((r) => r.status === 'sent').length;
      failed += results.filter((r) => r.status === 'failed').length;
    }
  }
  return json({ sent, failed });
});
