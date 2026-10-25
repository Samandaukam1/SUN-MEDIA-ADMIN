import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { geminiKey, geminiSpeech, geminiSpeechStream } from '@/lib/assistant/gemini';
import { corsHeaders, rateLimited } from '@/lib/assistant/request';
import { speakable, textLanguage, type SpeechLang } from '@/lib/assistant/speech';

export const runtime = 'nodejs';
export const maxDuration = 60;

const body = z.object({ text: z.string().trim().min(1).max(900), stream: z.boolean().optional() });

/** The voice for the reply's language: Uzbek (Latin or Cyrillic) by default, Russian, or English. */
function voiceFor(text: string): { lang: SpeechLang; voice: string } {
  const { lang } = textLanguage(text);
  if (lang === 'ru-RU') return { lang, voice: process.env.ASSISTANT_VOICE_RU || 'ru-RU-DmitryNeural' };
  if (lang === 'en-US') return { lang, voice: process.env.ASSISTANT_VOICE_EN || 'en-US-AndrewMultilingualNeural' };
  return { lang, voice: process.env.ASSISTANT_VOICE || 'uz-UZ-SardorNeural' };
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST { text } → audio (Azure Neural TTS: uz-UZ-SardorNeural; without Azure, Gemini TTS). 204 when neither is set or
 * both fail: the widget then uses a browser voice in that language, or stays silent rather than read Uzbek in another
 * language's voice. With `stream: true` the answer is raw PCM (`audio/pcm;rate=…`) sent while it is generated.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if ((!key || !region) && !geminiKey()) return new NextResponse(null, { status: 204, headers });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Matn noto‘g‘ri.' }, { status: 400, headers });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`tts:${ip}`, 60, 10 * 60_000)) return NextResponse.json({ error: 'Limit' }, { status: 429, headers });

  const { lang, voice } = voiceFor(parsed.data.text);
  // Links and markdown are for the eyes only; numbers, dates and the brand are written the way they are said.
  const spoken = speakable(parsed.data.text, lang);
  if (!spoken) return new NextResponse(null, { status: 204, headers });
  const stream = !!parsed.data.stream;
  const audioHeaders = (type: string) => ({ ...headers, 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });

  // Free option: Gemini TTS (AI Studio key). Over quota or unavailable → 204, the widget falls back.
  if (!key || !region) {
    if (stream) {
      const live = await geminiSpeechStream(spoken, lang, request.signal);
      if (live) return new Response(live.stream, { headers: audioHeaders(`audio/pcm;rate=${live.rate}`) });
      // The listener already stopped Sunny: no second attempt for nobody.
      if (request.signal.aborted) return new NextResponse(null, { status: 204, headers });
    }
    const audio = await geminiSpeech(spoken, lang);
    if (!audio) return new NextResponse(null, { status: 204, headers });
    return new NextResponse(new Uint8Array(audio.body), { headers: audioHeaders(audio.type) });
  }

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${process.env.ASSISTANT_RATE || '+0%'}" pitch="${process.env.ASSISTANT_PITCH || '+0%'}">${escapeXml(spoken)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      // Raw PCM streams straight into the widget's player; the app gets the usual mp3 file.
      'X-Microsoft-OutputFormat': stream ? 'raw-24khz-16bit-mono-pcm' : 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'sunmedia-assistant',
    },
    body: ssml,
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
  }).catch(() => null);
  if (!res?.ok || !res.body) {
    // Azure over its monthly quota or down: Gemini speaks instead (when its key is set) rather than silence.
    if (res) console.error('[assistant] Azure TTS', res.status);
    if (request.signal.aborted || !geminiKey()) return new NextResponse(null, { status: 204, headers });
    const live = stream ? await geminiSpeechStream(spoken, lang, request.signal) : null;
    if (live) return new Response(live.stream, { headers: audioHeaders(`audio/pcm;rate=${live.rate}`) });
    const audio = await geminiSpeech(spoken, lang);
    if (!audio) return new NextResponse(null, { status: 204, headers });
    return new NextResponse(new Uint8Array(audio.body), { headers: audioHeaders(audio.type) });
  }
  if (stream) return new Response(res.body, { headers: audioHeaders('audio/pcm;rate=24000') });
  return new NextResponse(await res.arrayBuffer(), { headers: audioHeaders('audio/mpeg') });
}
