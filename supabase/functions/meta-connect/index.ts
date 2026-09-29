// meta-connect: the admin panel's "Mijoz → Integratsiyalar → Meta → Ulash" wizard.
//
//   POST {action:'status'}                          → is Meta configured on the server?
//   POST {action:'start', client_id, return_to}     → Facebook Login URL (signed state)
//   GET  ?code&state                                → Facebook redirects here; token → Vault; back to the admin panel
//   POST {action:'assets', connection_id}           → businesses, pages (+ Instagram, lead forms), ad accounts
//   POST {action:'save', client_id, connection_id, assets, template, auto_deliver}
//   POST {action:'disconnect', asset_id}
//
// POST calls carry the admin's own Supabase session; the database authorizes every change with it.
// The app secret and all tokens stay here and in Vault — nothing secret is ever returned.
import { background, env, readToken, serviceClient, staffWith, userClient } from '../_shared/clients.ts';
import { adminMessage, allowedReturn, collect, graphClient, json, META_SCOPES, signState, verifyState, type Graph } from '../_shared/meta.ts';

type Page = {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string; followers_count?: number };
};
type Asset = { type: 'business' | 'page' | 'instagram' | 'ad_account' | 'lead_form'; external_id: string; name?: string; parent_external_id?: string | null; details?: Record<string, unknown> };

const STATE_TTL_MS = 15 * 60_000;

function configured(): boolean {
  return !!(Deno.env.get('META_APP_ID') && Deno.env.get('META_APP_SECRET') && Deno.env.get('META_STATE_SECRET'));
}

// Public base of the functions (what Meta calls). Defaults to the project URL; override for local tunnels.
function functionsUrl(): string {
  return (Deno.env.get('PUBLIC_FUNCTIONS_URL') || `${env('SUPABASE_URL')}/functions/v1`).replace(/\/+$/, '');
}

function callbackUrl(): string {
  return `${functionsUrl()}/meta-connect`;
}

function graph(): Graph {
  return graphClient({ appSecret: env('META_APP_SECRET'), version: Deno.env.get('META_GRAPH_VERSION') });
}

function returnOrigins(): string[] {
  return (Deno.env.get('META_ALLOWED_RETURN_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get('state') ?? '', env('META_STATE_SECRET'));
  if (!state) return new Response('Havola eskirgan. Admin paneldan qayta boshlang.', { status: 400 });
  const back = allowedReturn(state.return_to, returnOrigins());
  if (!back) return new Response('Qaytish manzili ruxsat etilmagan.', { status: 400 });

  const code = url.searchParams.get('code');
  if (!code) return redirect(withParams(back, { meta: 'cancelled' }));

  try {
    const g = graph();
    const appId = env('META_APP_ID');
    const secret = env('META_APP_SECRET');
    const short = await g<{ access_token: string }>('oauth/access_token', { client_id: appId, client_secret: secret, redirect_uri: callbackUrl(), code });
    const long = await g<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: secret,
      fb_exchange_token: short.access_token,
    });
    const me = await g<{ id: string; name?: string }>('me', { fields: 'id,name' }, { token: long.access_token });
    const perms = await g<{ data?: { permission: string; status: string }[] }>('me/permissions', {}, { token: long.access_token });
    const granted = (perms.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission);

    const service = serviceClient();
    const { data: connectionId, error } = await service.rpc('meta_save_connection', {
      p_meta_user_id: me.id,
      p_name: me.name ?? '',
      p_token: long.access_token,
      p_expires_at: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
      p_scopes: granted,
      p_connected_by: state.uid,
    });
    if (error) throw new Error(error.message);
    const missing = ['pages_show_list', 'leads_retrieval', 'instagram_manage_insights'].filter((p) => !granted.includes(p));
    return redirect(withParams(back, { meta: 'connected', connection: String(connectionId), ...(missing.length ? { missing: missing.join(',') } : {}) }));
  } catch (e) {
    console.error('meta-connect callback', e);
    return redirect(withParams(back, { meta: 'error', message: adminMessage(e).slice(0, 200) }));
  }
}

async function listAssets(connectionId: string) {
  const service = serviceClient();
  const token = await readToken(service, 'connection', connectionId);
  if (!token) throw new Error('Meta ulanishi topilmadi. Qayta ulang.');
  const g = graph();
  // Page tokens stay in memory only (to read each page's lead forms); the response never contains a token.
  const pages = await collect<Page>(g, 'me/accounts', {
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url,followers_count}',
    limit: '100',
  }, token);
  const withForms = await Promise.all(
    pages.map(async (p) => {
      let forms: { id: string; name: string; status?: string }[] = [];
      try {
        if (p.access_token) forms = await collect(g, `${p.id}/leadgen_forms`, { fields: 'id,name,status', limit: '100' }, p.access_token, 200);
      } catch {
        forms = [];
      }
      return {
        id: p.id,
        name: p.name,
        picture: p.picture?.data?.url ?? null,
        instagram: p.instagram_business_account
          ? {
              id: p.instagram_business_account.id,
              username: p.instagram_business_account.username ?? null,
              picture: p.instagram_business_account.profile_picture_url ?? null,
              followers: p.instagram_business_account.followers_count ?? null,
            }
          : null,
        lead_forms: forms.map((f) => ({ id: f.id, name: f.name, status: f.status ?? null })),
      };
    }),
  );
  let adAccounts: { id: string; name: string; account_status?: number; currency?: string }[] = [];
  let businesses: { id: string; name: string }[] = [];
  try {
    adAccounts = await collect(g, 'me/adaccounts', { fields: 'id,name,account_status,currency', limit: '100' }, token);
  } catch {
    adAccounts = [];
  }
  try {
    businesses = await collect(g, 'me/businesses', { fields: 'id,name', limit: '100' }, token);
  } catch {
    businesses = [];
  }
  return { pages: withForms, ad_accounts: adAccounts, businesses };
}

async function ensureAppWebhook(g: Graph): Promise<string | null> {
  const verify = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
  if (!verify) return 'META_WEBHOOK_VERIFY_TOKEN sozlanmagan: lidlar webhook orqali kelmaydi.';
  try {
    const appId = env('META_APP_ID');
    await g(`${appId}/subscriptions`, {
      object: 'page',
      callback_url: `${functionsUrl()}/meta-webhook`,
      fields: 'leadgen',
      verify_token: verify,
      include_values: 'true',
    }, { method: 'POST', token: `${appId}|${env('META_APP_SECRET')}` });
    return null;
  } catch (e) {
    return `Webhook obunasi: ${adminMessage(e)}`;
  }
}

async function save(req: Request, body: { client_id: string; connection_id: string; assets: Asset[]; template?: string; auto_deliver?: boolean }) {
  const user = userClient(req)!;
  const { data: saved, error } = await user.rpc('save_meta_assets', {
    p_client: body.client_id,
    p_connection: body.connection_id,
    p_assets: body.assets,
    p_template: body.template ?? null,
    p_auto_deliver: body.auto_deliver ?? null,
  });
  if (error) return json({ error: error.message, code: error.code }, error.code === '42501' ? 403 : 400);

  const service = serviceClient();
  const g = graph();
  const warnings: string[] = [];
  const pagesSaved = ((saved ?? []) as { asset_id: string; asset_type: string; external_id: string }[]).filter((a) => a.asset_type === 'page');
  if (pagesSaved.length > 0) {
    const userToken = await readToken(service, 'connection', body.connection_id);
    const pages = userToken ? await collect<Page>(g, 'me/accounts', { fields: 'id,access_token', limit: '100' }, userToken) : [];
    const webhookWarning = await ensureAppWebhook(g);
    if (webhookWarning) warnings.push(webhookWarning);
    for (const page of pagesSaved) {
      const pageToken = pages.find((p) => p.id === page.external_id)?.access_token;
      if (!pageToken) {
        await service.rpc('meta_mark_asset', { p_asset_id: page.asset_id, p_webhook_ok: false, p_error: 'Sahifaga ruxsat berilmagan (Meta Login’da sahifani tanlang).' });
        warnings.push(`Sahifa ${page.external_id}: ruxsat yo‘q`);
        continue;
      }
      await service.rpc('meta_save_token', { p_owner_kind: 'asset', p_owner_id: page.asset_id, p_token: pageToken });
      try {
        await g(`${page.external_id}/subscribed_apps`, { subscribed_fields: 'leadgen' }, { method: 'POST', token: pageToken });
        await service.rpc('meta_mark_asset', { p_asset_id: page.asset_id, p_webhook_ok: true, p_error: null });
      } catch (e) {
        await service.rpc('meta_mark_asset', { p_asset_id: page.asset_id, p_webhook_ok: false, p_error: adminMessage(e) });
        warnings.push(`Sahifa ${page.external_id}: ${adminMessage(e)}`);
      }
    }
  }

  // First Instagram numbers without waiting for the nightly sync.
  const syncSecret = Deno.env.get('META_SYNC_SECRET');
  if (syncSecret && body.assets.some((a) => a.type === 'instagram')) {
    background(
      fetch(`${env('SUPABASE_URL')}/functions/v1/meta-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
        body: JSON.stringify({ mode: 'client', client_id: body.client_id }),
      }),
    );
  }
  return json({ saved: (saved ?? []).length, warnings });
}

async function disconnect(req: Request, assetId: string) {
  const user = userClient(req)!;
  const { error } = await user.rpc('disconnect_meta_asset', { p_asset_id: assetId });
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
  const service = serviceClient();
  const pageToken = await readToken(service, 'asset', assetId);
  if (pageToken) {
    const { data: asset } = await service.from('meta_assets').select('external_id, asset_type').eq('id', assetId).single();
    if (asset?.asset_type === 'page') {
      await graph()(`${asset.external_id}/subscribed_apps`, {}, { method: 'DELETE', token: pageToken }).catch(() => undefined);
    }
    await service.rpc('meta_drop_token', { p_owner_kind: 'asset', p_owner_id: assetId });
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'GET') return await callback(req);
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const user = userClient(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const uid = await staffWith(user, 'integrations.manage');
    if (!uid) return json({ error: 'Forbidden' }, 403);

    if (body.action === 'status') return json({ configured: configured(), callback_url: callbackUrl(), webhook_url: `${functionsUrl()}/meta-webhook` });
    if (!configured()) return json({ error: 'Meta ilovasi hali sozlanmagan (META_APP_ID / META_APP_SECRET).', code: 'not_configured' }, 409);

    switch (body.action) {
      case 'start': {
        const back = allowedReturn(String(body.return_to ?? ''), returnOrigins());
        if (!back) return json({ error: 'return_to is not an allowed admin origin' }, 400);
        const state = await signState(
          { uid, client_id: String(body.client_id ?? ''), return_to: back, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomUUID() },
          env('META_STATE_SECRET'),
        );
        const version = Deno.env.get('META_GRAPH_VERSION') || 'v23.0';
        const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
        url.search = new URLSearchParams({ client_id: env('META_APP_ID'), redirect_uri: callbackUrl(), state, scope: META_SCOPES.join(','), response_type: 'code' }).toString();
        return json({ url: url.toString() });
      }
      case 'assets':
        return json(await listAssets(String(body.connection_id ?? '')));
      case 'save':
        return await save(req, body as Parameters<typeof save>[1]);
      case 'disconnect':
        return await disconnect(req, String(body.asset_id ?? ''));
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    console.error('meta-connect', e);
    return json({ error: adminMessage(e) }, 500);
  }
});
