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
  stream: z.boolean().optional(),
});

function failure(error: unknown): { status: number; error: string } {
  if (error instanceof AiNotConfiguredError) return { status: 503, error: 'Yordamchi hali ulanmagan.' };
  return { status: 502, error: error instanceof AiFailedError ? error.message : 'Xatolik yuz berdi.' };
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST { messages: [{ role, text }] } → { reply, actions }. The conversation lives in the browser/app, not here.
 * With `stream: true` the reply arrives as it is written, one JSON object per line:
 * { t: 'delta', text } …, then { t: 'done', reply, actions } or { t: 'error', error }.
 */
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

  if (!parsed.data.stream) {
    try {
      const result = await assistantReply(history, ctx, name, { signal: request.signal });
      return NextResponse.json({ ...result, audience: ctx.audience }, { headers });
    } catch (error) {
      const { status, error: message } = failure(error);
      return NextResponse.json({ error: message }, { status, headers });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'));
        } catch {
          // the visitor left; the abort signal stops the model too
        }
      };
      try {
        const result = await assistantReply(history, ctx, name, { onText: (text) => send({ t: 'delta', text }), signal: request.signal });
        send({ t: 'done', ...result, audience: ctx.audience });
      } catch (error) {
        send({ t: 'error', error: failure(error).error });
      }
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });
  return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' } });
}
