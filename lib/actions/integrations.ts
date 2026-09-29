'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { getPublicEnv } from '@/lib/env';
import { getSiteUrl } from '@/lib/env.server';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './state';

/**
 * Calls a Meta Edge Function as the signed-in admin (their own access token). The function keeps the Meta app
 * secret and the tokens; the database authorizes every change with this session. No service key here.
 */
async function callFunction<T>(name: 'meta-connect' | 'meta-sync', body: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessiya tugagan. Qayta kiring.');
  const { url, key } = getPublicEnv();
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: key },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 404) throw new Error('Meta integratsiyasi serverda hali o‘rnatilmagan (Edge Function deploy qilinmagan).');
  if (!response.ok) throw new Error(json.error ?? `Xato (${response.status})`);
  return json;
}

export type MetaStatus = { configured: boolean; deployed: boolean; callback_url?: string; webhook_url?: string; error?: string };

export async function getMetaStatus(): Promise<MetaStatus> {
  await requirePermission('integrations.manage');
  try {
    const status = await callFunction<{ configured: boolean; callback_url: string; webhook_url: string }>('meta-connect', { action: 'status' });
    return { ...status, deployed: true };
  } catch (e) {
    return { configured: false, deployed: false, error: toUserMessage(e) };
  }
}

/** Step 1: Facebook Login URL for this client; Meta sends the admin back to the Integratsiyalar tab. */
export async function startMetaConnect(clientId: string): Promise<{ url?: string; error?: string }> {
  await requirePermission('integrations.manage');
  try {
    const returnTo = `${getSiteUrl()}/clients/${clientId}?tab=integrations`;
    const { url } = await callFunction<{ url: string }>('meta-connect', { action: 'start', client_id: clientId, return_to: returnTo });
    return { url };
  } catch (e) {
    return { error: toUserMessage(e) };
  }
}

export type MetaAssets = {
  pages: {
    id: string;
    name: string;
    picture: string | null;
    instagram: { id: string; username: string | null; picture: string | null; followers: number | null } | null;
    lead_forms: { id: string; name: string; status: string | null }[];
  }[];
  ad_accounts: { id: string; name: string; account_status?: number; currency?: string }[];
  businesses: { id: string; name: string }[];
};

/** Steps 2–3: what this Meta login can reach (no tokens are returned). */
export async function listMetaAssets(connectionId: string): Promise<{ assets?: MetaAssets; error?: string }> {
  await requirePermission('integrations.manage');
  try {
    return { assets: await callFunction<MetaAssets>('meta-connect', { action: 'assets', connection_id: connectionId }) };
  } catch (e) {
    return { error: toUserMessage(e) };
  }
}

const assetSchema = z.object({
  type: z.enum(['business', 'page', 'instagram', 'ad_account', 'lead_form']),
  external_id: z.string().regex(/^(act_)?[0-9]{1,40}$/),
  name: z.string().max(200),
  parent_external_id: z.string().regex(/^[0-9]{1,40}$/).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
const saveSchema = z.object({
  client_id: z.uuid(),
  connection_id: z.uuid(),
  assets: z.array(assetSchema).max(200),
  template: z.enum(['standard', 'full']),
  auto_deliver: z.boolean(),
});

/** Steps 4–5: CRM template + save; pages get their token and the lead webhook subscription. */
export async function saveMetaSetup(input: z.input<typeof saveSchema>): Promise<ActionState & { warnings?: string[] }> {
  await requirePermission('integrations.manage');
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Tanlovni tekshiring.' };
  try {
    const result = await callFunction<{ saved: number; warnings: string[] }>('meta-connect', { action: 'save', ...parsed.data });
    revalidatePath(`/clients/${parsed.data.client_id}`);
    revalidatePath('/clients/integrations');
    return { status: 'success', message: `${result.saved} ta Meta obyekti saqlandi.`, warnings: result.warnings };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}

export async function disconnectMetaAsset(clientId: string, assetId: string): Promise<ActionState> {
  await requirePermission('integrations.manage');
  try {
    await callFunction('meta-connect', { action: 'disconnect', asset_id: assetId });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath('/clients/integrations');
    return { status: 'success', message: 'Uzildi.' };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}

/** "Hozir yangilash": this client's Instagram numbers right now. */
export async function refreshInstagram(clientId: string): Promise<ActionState> {
  await requirePermission('integrations.manage');
  try {
    const r = await callFunction<{ accounts: number; failed: number }>('meta-sync', { mode: 'client', client_id: clientId });
    revalidatePath(`/clients/${clientId}`);
    if (r.accounts === 0) return { status: 'error', message: 'Ulangan Instagram hisobi yo‘q.' };
    return r.failed ? { status: 'error', message: 'Instagram yangilanmadi — xato holatini ko‘ring.' } : { status: 'success', message: 'Instagram statistikasi yangilandi.' };
  } catch (e) {
    return { status: 'error', message: toUserMessage(e) };
  }
}

/** CRM template without reconnecting (standard / full, auto delivery). */
export async function saveCrmTemplate(clientId: string, template: 'standard' | 'full', autoDeliver: boolean): Promise<ActionState> {
  await requirePermission('integrations.manage');
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_crm_settings', { p_client: clientId, p_template: template, p_auto_deliver: autoDeliver });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(`/clients/${clientId}`);
  return { status: 'success', message: 'CRM shabloni saqlandi.' };
}
