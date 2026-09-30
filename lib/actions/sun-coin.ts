'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { coinCampaignSchema } from '@/lib/schemas/sun-coin';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsFrom, type ActionState } from './state';

const campaignPath = '/clients/games/safi-penalty/rewards/sun-coin';

function refreshCampaigns() {
  revalidatePath(campaignPath);
  revalidatePath('/clients/games/safi-penalty');
}

export async function createSunCoinCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  let config: unknown;
  try {
    const raw = formData.get('config');
    if (typeof raw !== 'string' || raw.length > 30_000) throw new Error('INVALID_CONFIG');
    config = JSON.parse(raw);
  } catch {
    return { status: 'error', message: 'Kampaniya sozlamalarini tekshiring.' };
  }
  const parsed = coinCampaignSchema.safeParse(config);
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_sun_coin_campaign', { p_config: parsed.data });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: parsed.data.status === 'active' ? 'SUN Coin kampaniyasi ishga tushirildi.' : 'Kampaniya qoralamasi saqlandi. SUN Coin reward OFF.' };
}

export async function setSunCoinCampaignStatus(id: string, status: 'active' | 'paused' | 'ended'): Promise<ActionState> {
  await requirePermission('promo.manage');
  const parsed = z.object({ id: z.uuid(), status: z.enum(['active', 'paused', 'ended']) }).safeParse({ id, status });
  if (!parsed.success) return { status: 'error', message: 'Kampaniya yoki holat noto‘g‘ri.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_sun_coin_campaign_status', { p_campaign: parsed.data.id, p_status: parsed.data.status });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: status === 'active' ? 'SUN Coin reward ON.' : status === 'paused' ? 'Kampaniya pauzada. SUN Coin reward OFF.' : 'Kampaniya tugatildi. Tarixi saqlandi.' };
}
