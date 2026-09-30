'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { coinCampaignSchema, coinGiftSchema, coinPackFormSchema, type GameLevel } from '@/lib/schemas/sun-coin';
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

export async function createSunCoinPack(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const parsed = coinPackFormSchema.safeParse({
    coins: Number(formData.get('coins')),
    price: Number(String(formData.get('price') ?? '').replace(',', '.')),
    currency: String(formData.get('currency') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_sun_coin_pack', {
    p_pack: { coins: parsed.data.coins, priceCents: Math.round(parsed.data.price * 100), currency: parsed.data.currency.toUpperCase(), sortOrder: parsed.data.sortOrder },
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: `${parsed.data.coins} SC paketi qo‘shildi.` };
}

export async function setSunCoinPackActive(id: string, isActive: boolean): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Paket topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_sun_coin_pack', { p_pack: { id, isActive } });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: isActive ? 'Paket Coin Shop’da ko‘rinadi.' : 'Paket yashirildi.' };
}

/** After the payment has reached SUN MEDIA: the server credits the coins once and closes the request. */
export async function fulfillSunCoinPurchase(id: string): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'So‘rov topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('fulfill_sun_coin_purchase', { p_request: id });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: 'To‘lov tasdiqlandi, SUN Coin hisobga tushdi.' };
}

export async function rejectSunCoinPurchase(id: string, note: string): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'So‘rov topilmadi.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_sun_coin_purchase', { p_request: id, p_note: note.slice(0, 300) });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: 'So‘rov rad etildi.' };
}

/** A gift to a client user found by email: ADMIN_BONUS in the ledger, the player is notified. */
export async function giftSunCoin(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission('promo.manage');
  const parsed = coinGiftSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    amount: Number(formData.get('amount')),
    note: String(formData.get('note') ?? ''),
  });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Formani tekshiring.', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const found = await supabase.rpc('search_sun_coin_recipients', { p_query: parsed.data.email });
  if (found.error) return { status: 'error', message: toUserMessage(found.error) };
  const recipient = z.array(z.object({ userId: z.string(), email: z.string().nullable(), name: z.string() })).parse(found.data)
    .find((r) => r.email?.toLowerCase() === parsed.data.email);
  if (!recipient) return { status: 'error', message: 'Bu email bilan faol mijoz topilmadi.', fieldErrors: { email: 'Mijoz topilmadi' } };
  const { data, error } = await supabase.rpc('grant_sun_coin_bonus', {
    p_user: recipient.userId, p_amount: parsed.data.amount, p_note: parsed.data.note || undefined, p_request: crypto.randomUUID(),
  });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  const balance = (data as { balance?: number } | null)?.balance;
  return { status: 'success', message: `${recipient.name}: +${parsed.data.amount} SC${balance == null ? '' : ` (balans ${balance} SC)`}.` };
}

export async function setSafiLevel(level: GameLevel): Promise<ActionState> {
  await requirePermission('promo.manage');
  if (!['easy', 'normal', 'hard', 'extreme'].includes(level)) return { status: 'error', message: 'Bunday daraja yo‘q.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_game_center_difficulty', { p_game_key: 'safi-penalty', p_difficulty: level });
  if (error) return { status: 'error', message: toUserMessage(error) };
  refreshCampaigns();
  return { status: 'success', message: 'Daraja yangilandi. Yangi raundlarga qo‘llanadi.' };
}
