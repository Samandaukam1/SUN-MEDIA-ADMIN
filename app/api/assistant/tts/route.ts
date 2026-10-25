import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { corsHeaders, rateLimited } from '@/lib/assistant/request';

export const runtime = 'nodejs';

const body = z.object({ text: z.string().trim().min(1).max(900) });

/** Voices per script: Uzbek Latin by default, Russian when the reply is Cyrillic, English when it is plain ASCII prose. */
function voiceFor(text: string): { lang: string; voice: string } {
  if (/[Ѐ-ӿ]/.test(text)) {
    // Uzbek Cyrillic has ў қ ғ ҳ; otherwise it is Russian.
    if (/[ўқғҳЎҚҒҲ]/.test(text)) return { lang: 'uz-UZ', voice: process.env.ASSISTANT_VOICE || 'uz-UZ-SardorNeural' };
    return { lang: 'ru-RU', voice: process.env.ASSISTANT_VOICE_RU || 'ru-RU-DmitryNeural' };
  }
  const uzbekHints = /(o‘|o'|g‘|g'|sh|ch|\b(va|bilan|uchun|siz|biz|qanday|kerak|bo‘ladi|xizmat|narx)\b)/i;
  if (!uzbekHints.test(text) && /\b(the|and|you|we|is|are|with)\b/i.test(text)) return { lang: 'en-US', voice: process.env.ASSISTANT_VOICE_EN || 'en-US-AndrewMultilingualNeural' };
  return { lang: 'uz-UZ', voice: process.env.ASSISTANT_VOICE || 'uz-UZ-SardorNeural' };
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST { text } → audio/mpeg, spoken by Azure Neural TTS (Uzbek: uz-UZ-SardorNeural). 204 when no Azure key is set:
 * the widget then falls back to the browser's own voice.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return new NextResponse(null, { status: 204, headers });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Matn noto‘g‘ri.' }, { status: 400, headers });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`tts:${ip}`, 60, 10 * 60_000)) return NextResponse.json({ error: 'Limit' }, { status: 429, headers });

  // Links and markdown are for the eyes only.
  const spoken = parsed.data.text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]/g, '')
    .trim();
  const { lang, voice } = voiceFor(spoken);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${process.env.ASSISTANT_RATE || '+2%'}" pitch="${process.env.ASSISTANT_PITCH || '+12%'}">${escapeXml(spoken)}</prosody></voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'sunmedia-assistant',
    },
    body: ssml,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return new NextResponse(null, { status: 204, headers });
  return new NextResponse(await res.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
