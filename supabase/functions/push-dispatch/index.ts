// push-dispatch: drains the notification_deliveries queue into Expo push (the mobile app) and Web Push (the installed
// web app and browsers). Called by the database (pg_net, right after notifications are created, and by the
// per-minute sweep) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts';
import { chunk, toExpoMessages, toResults, type Claimed, type DeliveryResult, type ExpoTicket } from './results.ts';
import { isWeb, webMessage, webResult, type WebClaimed } from './web.ts';

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const MAX_ROUNDS = 10;
const BATCH = 100;
const WEB_PARALLEL = 8;

function vapid(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://sunmediagroup.uz' };
}

/** Each web device separately (every browser has its own push service), a few at a time. */
async function sendWeb(batch: WebClaimed[]): Promise<DeliveryResult[]> {
  const keys = vapid();
  if (!keys) return batch.map((d) => ({ delivery_id: d.delivery_id, status: 'failed', error: 'VAPID keys are not configured' }));
  const results: DeliveryResult[] = [];
  for (const part of chunk(batch, WEB_PARALLEL)) {
    results.push(
      ...(await Promise.all(
        part.map(async (d) => {
          const { payload, options } = webMessage(d);
          try {
            return webResult(d, await sendWebPush({ endpoint: d.token, p256dh: d.p256dh, auth: d.auth_secret }, payload, keys, options));
          } catch (e) {
            return webResult(d, e instanceof Error ? e : new Error('Network error'));
          }
        }),
      )),
    );
  }
  return results;
}

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
    const claimed = (data ?? []) as Claimed[];
    if (claimed.length === 0) break;
    const web = claimed.filter(isWeb);
    const batch = claimed.filter((d) => !isWeb(d));

    if (web.length) {
      const results = await sendWeb(web);
      const { error: completeError } = await supabase.rpc('complete_push_deliveries', { p_results: results });
      if (completeError) return json({ error: completeError.message, sent, failed }, 500);
      sent += results.filter((r) => r.status === 'sent').length;
      failed += results.filter((r) => r.status === 'failed').length;
    }

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
