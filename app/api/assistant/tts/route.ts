import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { corsHeaders, rateLimited } from '@/lib/assistant/request';
import { synthesize } from '@/lib/assistant/tts';
import { moodOf, MOODS } from '@/lib/assistant/voice-profile';

export const runtime = 'nodejs';
export const maxDuration = 60;

const body = z.object({
  text: z.string().trim().min(1).max(900),
  stream: z.boolean().optional(),
  /** The reply's mood (Sunny 3.0) or an older widget style ('qitmir' | 'bright' | 'soft' | 'steady'). */
  style: z.enum(['qitmir', 'bright', 'soft', 'steady', ...MOODS]).optional(),
  mood: z.enum(MOODS).optional(),
});

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST { text, mood?, stream? } → Sunny's voice (Azure neural, the mood as SSML prosody; Gemini's free TTS only as a
 * fallback). With `stream: true` raw PCM (`audio/pcm;rate=…`) arrives while it is generated. 204 when there is nothing to
 * say, the voice is switched off, or the month's free quota is used up (the widget then stays in text, never silently
 * paying more). `X-Sunny-Voice` says why for the widget's own decisions.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Matn noto‘g‘ri.' }, { status: 400, headers });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`tts:${ip}`, 60, 10 * 60_000)) return NextResponse.json({ error: 'Limit' }, { status: 429, headers });

  const mood = parsed.data.mood ?? moodOf(parsed.data.style === 'steady' ? 'neutral' : parsed.data.style);
  const r = await synthesize({ text: parsed.data.text, mood, stream: !!parsed.data.stream, signal: request.signal });
  if (r.kind === 'none') return new NextResponse(null, { status: 204, headers: { ...headers, 'X-Sunny-Voice': r.reason } });
  const out = {
    ...headers,
    'Content-Type': r.type,
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    'X-Sunny-Voice': r.cached ? 'cache' : r.provider,
    ...(r.firstByteMs !== null ? { 'Server-Timing': `tts;dur=${r.firstByteMs}` } : {}),
  };
  return Buffer.isBuffer(r.body) ? new NextResponse(new Uint8Array(r.body), { headers: out }) : new Response(r.body as ReadableStream<Uint8Array>, { headers: out });
}
