'use server';

import { z } from 'zod';

import { disconnect, igConfig, startConnect, syncNow } from '@/lib/instagram/server';
import { requireSmmOwner } from '@/lib/neosmm/server';

/**
 * Profile cards ↔ Instagram (Instagram Login). Owner only; the browser gets a consent URL or a message — never a token.
 */

const uuid = z.uuid();

export async function smmIgConnect(profileId: string, reconnect = false) {
  const owner = await requireSmmOwner();
  if (!uuid.safeParse(profileId).success) return { ok: false as const, message: 'Profil topilmadi.' };
  return startConnect(owner, profileId, !!reconnect);
}

export async function smmIgSyncNow(profileId: string) {
  await requireSmmOwner();
  if (!uuid.safeParse(profileId).success) return { ok: false, message: 'Profil topilmadi.' };
  return syncNow(profileId);
}

export async function smmIgDisconnect(profileId: string) {
  await requireSmmOwner();
  if (!uuid.safeParse(profileId).success) return { ok: false, message: 'Profil topilmadi.' };
  return (await disconnect(profileId))
    ? { ok: true, message: 'Ulanish uzildi: token o‘chirildi, avtomatik yangilash to‘xtadi. Buyurtmalar va kuzatuvlar tarixi saqlandi.' }
    : { ok: false, message: 'Ulanish topilmadi.' };
}

export async function smmIgConfigured() {
  await requireSmmOwner();
  return igConfig().configured;
}
