import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { rateLimited } from '@/lib/assistant/request';
import { PUSH_COOKIE } from '@/lib/pwa/server';
import { sameSite } from '@/lib/security/same-site';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const b64url = (min: number, max: number) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).min(min).max(max);
const subscription = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.object({ p256dh: b64url(86, 90), auth: b64url(21, 26) }),
});
const body = z.object({ subscription, device: z.string().max(80).optional(), replaces: z.url().max(1024).nullish() });

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const notReady = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883';

async function signedIn(request: NextRequest) {
  if (!sameSite(request)) return null;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { db, userId } : null;
}

/** Turns push on for this device and the signed-in person (another account's subscription on it moves over). */
export async function POST(request: NextRequest) {
  const me = await signedIn(request);
  if (!me) return json({ error: 'Avval tizimga kiring.' }, 401);
  if (rateLimited(`push:${me.userId}`, 30, 10 * 60_000)) return json({ error: 'Juda ko‘p urinish.' }, 429);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Obuna ma’lumoti noto‘g‘ri.' }, 400);
  const { subscription: sub, device, replaces } = parsed.data;

  const { data: id, error } = await me.db.rpc('register_web_push' as never, {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.keys.p256dh,
    p_auth: sub.keys.auth,
    p_device_name: device ?? null,
    p_user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  } as never);
  if (error) return notReady(error) ? json({ error: 'Push bildirishnomalar serverda hali yoqilmagan.' }, 503) : json({ error: 'Saqlab bo‘lmadi.' }, 500);
  if (replaces && replaces !== sub.endpoint) await me.db.rpc('unregister_web_push' as never, { p_endpoint: replaces } as never);

  const res = json({ ok: true });
  res.cookies.set(PUSH_COOKIE, String(id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 86_400 });
  return res;
}

/** Turns push off for this device. */
export async function DELETE(request: NextRequest) {
  const me = await signedIn(request);
  if (!me) return json({ error: 'Avval tizimga kiring.' }, 401);
  const parsed = z.object({ endpoint: z.url().max(1024) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Noto‘g‘ri so‘rov.' }, 400);
  const { error } = await me.db.rpc('unregister_web_push' as never, { p_endpoint: parsed.data.endpoint } as never);
  if (error && !notReady(error)) return json({ error: 'O‘chirib bo‘lmadi.' }, 500);
  const res = json({ ok: true });
  res.cookies.delete(PUSH_COOKIE);
  return res;
}
