import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { assistantContext, rateLimited } from '@/lib/assistant/request';
import { synthesize } from '@/lib/assistant/tts';
import { MOODS } from '@/lib/assistant/voice-profile';

export const runtime = 'nodejs';
export const maxDuration = 30;

const body = z.object({
  text: z.string().trim().min(1).max(600),
  mood: z.enum(MOODS),
  voice: z.string().regex(/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/).optional(),
  rate: z.number().int().min(-50).max(60).optional(),
  pitch: z.number().int().min(-50).max(60).optional(),
  intensity: z.number().int().min(1).max(3).optional(),
});

/**
 * Voice Test Studio (system owner only): the real voice with the settings being tried — the same synthesis as Sunny's
 * replies (mood SSML, pronunciation fixes, quota), as an mp3. Counted in the month's usage like any other speech.
 * `X-Sunny-Spoken` (URI-encoded) shows exactly what the voice read after normalisation.
 */
export async function POST(request: NextRequest) {
  const { ctx } = await assistantContext(request);
  if (ctx.audience !== 'staff' || !ctx.owner) return NextResponse.json({ error: 'Faqat tizim egasi uchun.' }, { status: 403 });
  if (rateLimited(`studio:${ctx.userId}`, 120, 10 * 60_000)) return NextResponse.json({ error: 'Juda ko‘p sinov. Birozdan so‘ng.' }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'So‘rov noto‘g‘ri.' }, { status: 400 });
  const { text, mood, ...override } = parsed.data;
  const r = await synthesize({ text, mood, stream: false, signal: request.signal, override });
  if (r.kind === 'none') {
    const why = { empty: 'O‘qiladigan matn yo‘q.', off: 'Ovoz o‘chirilgan.', quota: 'Bu oyning bepul ovoz limiti tugadi.', failed: 'Ovoz xizmati javob bermadi (Azure kaliti yoki mintaqa).', aborted: 'To‘xtatildi.' }[r.reason];
    return NextResponse.json({ error: why, reason: r.reason }, { status: 409 });
  }
  const bytes = Buffer.isBuffer(r.body) ? r.body : Buffer.from(await new Response(r.body).arrayBuffer());
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': r.type,
      'Cache-Control': 'no-store',
      'X-Sunny-Provider': r.provider,
      'X-Sunny-Voice-Name': r.voice,
      'X-Sunny-Cached': r.cached ? '1' : '0',
      'X-Sunny-First-Byte': String(r.firstByteMs ?? ''),
      'X-Sunny-Spoken': encodeURIComponent(r.spoken.slice(0, 600)),
    },
  });
}
