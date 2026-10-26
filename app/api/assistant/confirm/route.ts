import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { openToken, runAction } from '@/lib/assistant/agent';
import { assistantContext, corsHeaders, rateLimited } from '@/lib/assistant/request';
import { gateSecret } from '@/lib/site/gate-token';

export const runtime = 'nodejs';

const body = z.object({ token: z.string().min(10).max(8000) });

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST { token } → { ok, message, link? }: the person pressed "Tasdiqlash" on a card Sunny showed. The token names the
 * action and its exact input, signed for this person; the action then runs with their own session, like any other.
 */
export async function POST(request: NextRequest) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'no-store' };
  const parsed = body.safeParse(await request.json().catch(() => null));
  const secret = gateSecret();
  if (!parsed.success || !secret) return NextResponse.json({ ok: false, message: 'Tasdiq noto‘g‘ri.' }, { status: 400, headers });

  const { ctx } = await assistantContext(request);
  if (ctx.audience !== 'staff' || !ctx.db || !ctx.userId) return NextResponse.json({ ok: false, message: 'Avval tizimga kiring.' }, { status: 401, headers });
  if (rateLimited(`act:${ctx.userId}`, 40, 10 * 60_000)) return NextResponse.json({ ok: false, message: 'Juda ko‘p amal: bir necha daqiqadan so‘ng davom eting.' }, { status: 429, headers });

  const pending = openToken(secret, parsed.data.token, ctx.userId);
  if ('error' in pending) return NextResponse.json({ ok: false, message: pending.error }, { status: 409, headers });

  const out = await runAction(pending.name, pending.input, { db: ctx.db, userId: ctx.userId, permissions: ctx.permissions, owner: ctx.owner }, { confirmed: true });
  if (out.ok) for (const path of out.revalidate ?? []) revalidatePath(path);
  return NextResponse.json({ ok: out.ok, name: pending.name, message: out.message, link: out.link ?? null }, { headers });
}
