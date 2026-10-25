import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { AiFailedError, AiNotConfiguredError } from '@/lib/ai';
import { assistantReply } from '@/lib/assistant/engine';
import { assistantContext, corsHeaders, rateLimited } from '@/lib/assistant/request';

export const runtime = 'nodejs';
export const maxDuration = 60;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(40),
});

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** POST { messages: [{ role, text }] } → { reply, actions }. The conversation lives in the browser/app, not here. */
export async function POST(request: NextRequest) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'no-store' };
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Xabar noto‘g‘ri.' }, { status: 400, headers });

  // Claude expects the conversation to start with the user: drop a leading greeting from the widget.
  const history = parsed.data.messages.slice(-20);
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') return NextResponse.json({ error: 'Xabar noto‘g‘ri.' }, { status: 400, headers });

  const { ctx, name, ipKey } = await assistantContext(request);
  const limit = ctx.audience === 'public' ? 25 : 80;
  if (rateLimited(`chat:${ipKey}`, limit, 10 * 60_000)) {
    return NextResponse.json({ error: 'Juda ko‘p xabar yubordingiz. Bir necha daqiqadan so‘ng davom etamiz.' }, { status: 429, headers });
  }

  try {
    const result = await assistantReply(history, ctx, name);
    return NextResponse.json({ ...result, audience: ctx.audience }, { headers });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return NextResponse.json({ error: 'Yordamchi hali ulanmagan.' }, { status: 503, headers });
    const message = error instanceof AiFailedError ? error.message : 'Xatolik yuz berdi.';
    return NextResponse.json({ error: message }, { status: 502, headers });
  }
}
