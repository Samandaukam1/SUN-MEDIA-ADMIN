// meta-webhook: Meta Lead Ads → SUN MEDIA. Public endpoint (Meta calls it), authenticated by the app-secret signature.
//   GET  hub.mode=subscribe & hub.verify_token → echo hub.challenge (webhook verification)
//   POST object=page, field=leadgen            → create the lead once, fetch its answers, keep it for the admin
// Always answers 200 for a valid signature, so Meta does not flood retries; unfinished leads are retried by meta-sync.
import { serviceClient } from '../_shared/clients.ts';
import { fetchLeadDetails } from '../_shared/leads.ts';
import { graphClient, json, parseLeadgenEvents, safeEqual, verifyWebhookSignature } from '../_shared/meta.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const verify = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? '';
    const given = url.searchParams.get('hub.verify_token') ?? '';
    if (url.searchParams.get('hub.mode') === 'subscribe' && verify && safeEqual(given, verify)) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
  const raw = await req.text();
  if (!(await verifyWebhookSignature(appSecret, raw, req.headers.get('x-hub-signature-256')))) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: true, ignored: 'malformed' });
  }

  const service = serviceClient();
  const graph = graphClient({ appSecret, version: Deno.env.get('META_GRAPH_VERSION') });
  let created = 0;
  let duplicates = 0;
  let unrouted = 0;

  for (const event of parseLeadgenEvents(body)) {
    const { data, error } = await service.rpc('ingest_meta_lead', {
      p_meta_lead_id: event.leadgen_id,
      p_page_id: event.page_id,
      p_form_id: event.form_id,
      p_ad_id: event.ad_id,
      p_adset_id: event.adgroup_id,
      p_created_time: event.created_time,
    });
    if (error) {
      console.error('ingest_meta_lead', error.message);
      continue;
    }
    const result = data as { status: string; lead_id?: string; fetch_status?: string; page_asset_id?: string | null };
    if (result.status === 'unrouted') {
      unrouted++;
      continue;
    }
    if (result.status === 'duplicate') duplicates++;
    else created++;
    if (result.lead_id && (result.status === 'created' || result.fetch_status === 'pending')) {
      await fetchLeadDetails(service, graph, { lead_id: result.lead_id, meta_lead_id: event.leadgen_id, page_asset_id: result.page_asset_id ?? null });
    }
  }
  return json({ ok: true, created, duplicates, unrouted });
});
