// meta-sync: scheduled by pg_cron (x-sync-secret) or started by an admin ("Hozir yangilash", own session).
//   {mode:'daily'}               every connected Instagram account: yesterday's insights, posts, month totals
//   {mode:'leads'}               leads whose answers could not be fetched yet (up to five attempts each)
//   {mode:'client', client_id}   one client's Instagram right now (after connecting, or on demand)
import { serviceClient, staffWith, userClient } from '../_shared/clients.ts';
import { syncInstagramAccount, type SyncAccount } from '../_shared/instagram.ts';
import { fetchLeadDetails } from '../_shared/leads.ts';
import { graphClient, json, safeEqual } from '../_shared/meta.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = (await req.json().catch(() => ({}))) as { mode?: string; client_id?: string };

  const secret = Deno.env.get('META_SYNC_SECRET') ?? '';
  const given = req.headers.get('x-sync-secret') ?? '';
  const bySchedule = !!secret && safeEqual(given, secret);
  if (!bySchedule) {
    // An admin may refresh one client with their own session.
    const user = userClient(req);
    if (!user || body.mode !== 'client' || !(await staffWith(user, 'integrations.manage'))) return json({ error: 'Forbidden' }, 403);
  }

  const appSecret = Deno.env.get('META_APP_SECRET');
  if (!appSecret) return json({ error: 'META_APP_SECRET is not configured' }, 409);
  const service = serviceClient();
  const graph = graphClient({ appSecret, version: Deno.env.get('META_GRAPH_VERSION') });

  if (body.mode === 'leads') {
    const { data, error } = await service.rpc('meta_leads_to_fetch', { p_limit: 100 });
    if (error) return json({ error: error.message }, 500);
    let completed = 0;
    for (const lead of (data ?? []) as { lead_id: string; meta_lead_id: string; page_asset_id: string }[]) {
      if (await fetchLeadDetails(service, graph, lead)) completed++;
    }
    return json({ mode: 'leads', attempted: (data ?? []).length, completed });
  }

  if (body.mode === 'daily' || body.mode === 'client') {
    const { data, error } = await service.rpc('ig_accounts_to_sync', { p_client: body.mode === 'client' ? body.client_id ?? null : null });
    if (error) return json({ error: error.message }, 500);
    const results = [];
    for (const account of (data ?? []) as SyncAccount[]) {
      results.push({ asset_id: account.asset_id, ...(await syncInstagramAccount(service, graph, account)) });
    }
    return json({ mode: body.mode, accounts: results.length, failed: results.filter((r) => !r.ok).length });
  }

  return json({ error: 'Unknown mode' }, 400);
});
