'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './state';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * "Bosh sahifa logosi": uploads to the public branding bucket with the admin's own session (storage policies
 * decide who may write where), then points the client (or the agency when clientId is null) at it.
 */
export type LogoVariant = 'light' | 'dark';

export async function uploadHomeLogo(clientId: string | null, variant: LogoVariant, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: 'Logo faylini tanlang.' };
  const ext = TYPES[file.type];
  if (!ext) return { status: 'error', message: 'PNG, JPG, WEBP yoki SVG yuklang.' };
  if (file.size > MAX_BYTES) return { status: 'error', message: 'Logo 2 MB dan kichik bo‘lsin.' };

  const supabase = await createClient();
  const path = `${clientId ? `clients/${clientId}` : 'agency'}/home-${variant}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: 'Logoni yuklashga ruxsat yo‘q yoki xato yuz berdi.' };
  const { data } = supabase.storage.from('branding').getPublicUrl(path);
  const { error } = await supabase.rpc('set_home_logo', { p_client: clientId as string, p_url: data.publicUrl, p_variant: variant });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(clientId ? `/clients/${clientId}` : '/system/settings');
  return { status: 'success', message: 'Logo saqlandi. Ilovada keyingi ochilishda ko‘rinadi.' };
}

export async function clearHomeLogo(clientId: string | null, variant: LogoVariant): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_home_logo', { p_client: clientId as string, p_url: null as unknown as string, p_variant: variant });
  if (error) return { status: 'error', message: toUserMessage(error) };
  revalidatePath(clientId ? `/clients/${clientId}` : '/system/settings');
  return { status: 'success', message: 'Standart logo qaytarildi.' };
}
