import 'server-only';

import { createClient as createSupabase, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { getPublicEnv } from '@/lib/env';
import { gateSecret, visitorKey } from '@/lib/site/gate-token';
import { createClient } from '@/lib/supabase/server';
import { myContextSchema } from '@/types/app';
import type { Database } from '@/types/database';
import type { AssistantContext } from './tools';

/**
 * Who sent this request. The mobile app sends its Supabase access token (Authorization: Bearer); the website uses its
 * session cookie; anyone else is a public visitor. Every work query then runs as that person, under RLS.
 */
export async function assistantContext(request: NextRequest): Promise<{ ctx: AssistantContext; name: string | null; ipKey: string }> {
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const secret = gateSecret();
  const vKey = secret ? await visitorKey(secret, ip) : null;
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 300);
  const base: AssistantContext = { audience: 'public', db: null, userId: null, visitorKey: vKey, userAgent, permissions: [], owner: false };

  let db: SupabaseClient<Database> | null = null;
  let userId: string | null = null;
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  try {
    if (bearer) {
      const { url, key } = getPublicEnv();
      const client = createSupabase<Database>(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await client.auth.getUser(bearer);
      if (data.user) {
        db = client;
        userId = data.user.id;
      }
    } else if (request.cookies.getAll().some((c) => c.name.startsWith('sb-')) && sameSite(request)) {
      const client = await createClient();
      const { data } = await client.auth.getClaims();
      if (data?.claims?.sub) {
        db = client as unknown as SupabaseClient<Database>;
        userId = data.claims.sub;
      }
    }
  } catch {
    db = null;
  }

  if (!db || !userId) return { ctx: base, name: null, ipKey: vKey ?? ip };
  const { data, error } = await db.rpc('get_my_context');
  const parsed = error ? null : myContextSchema.safeParse(data);
  if (!parsed?.success || parsed.data.status !== 'active' || !parsed.data.kind) return { ctx: base, name: null, ipKey: vKey ?? ip };
  const me = parsed.data;
  const audience = me.kind === 'staff' ? 'staff' : 'client';
  const name = me.profile?.full_name ? `${me.profile.full_name}${me.roles[0] ? ` (${me.roles[0].name})` : ''}${audience === 'client' && me.clients[0] ? `, ${me.clients[0].name}` : ''}` : null;
  const owner = me.roles.some((r) => r.key === 'system_owner');
  return { ctx: { ...base, audience, db, userId, permissions: me.permissions, owner }, name, ipKey: userId };
}

/**
 * The browser's session cookie counts only for requests from the site itself: another site cannot make Sunny act for a
 * signed-in visitor (cross-site requests are answered as a public visitor). The app uses its token, not cookies.
 */
export function sameSite(request: Pick<NextRequest, 'headers'>): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** A small per-instance limiter: enough to stop one visitor from running up the AI bill. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  return recent.length > limit;
}

/** Origins (besides this site) allowed to call the API from a browser, e.g. the Expo web build. */
export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (process.env.ASSISTANT_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
