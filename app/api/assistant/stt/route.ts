import { NextResponse, type NextRequest } from 'next/server';

import { geminiKey, geminiTranscribe } from '@/lib/assistant/gemini';
import { corsHeaders, rateLimited } from '@/lib/assistant/request';
import { sttAllowed, sttSettings } from '@/lib/assistant/voice-profile';
import { monthSttMs, recordVoice } from '@/lib/assistant/voice-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 3 * 1024 * 1024;
const LANGS = ['uz-UZ', 'ru-RU', 'en-US'];
const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|flac|x-m4a)$/;

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Azure short-audio recognition (REST): only WAV / OGG-Opus are accepted there; anything else goes to Gemini. */
async function azureTranscribe(audio: Buffer, mime: string, lang: string, signal: AbortSignal): Promise<string | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const type = mime === 'audio/ogg' ? 'audio/ogg; codecs=opus' : mime === 'audio/wav' || mime === 'audio/x-wav' ? 'audio/wav; codecs=audio/pcm; samplerate=16000' : null;
  if (!key || !region || !type) return null;
  const res = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=simple`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': type, Accept: 'application/json' },
    body: new Uint8Array(audio),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { RecognitionStatus?: string; DisplayText?: string } | null;
  if (data?.RecognitionStatus === 'NoMatch' || data?.RecognitionStatus === 'InitialSilenceTimeout') return '';
  return data?.RecognitionStatus === 'Success' ? (data.DisplayText ?? '') : null;
}

/**
 * POST audio/* (≤ 3 MB, ?lang=uz-UZ) → { text }. The widget's ears where the browser has no Uzbek recognition (Safari,
 * iPhone, Firefox); Chrome / Edge / Android recognise Uzbek themselves for free. Providers (SUNNY_STT_PROVIDER): gemini
 * (free tier, default), azure (F0: 5 audio hours a month; WAV / OGG only, otherwise Gemini), off. Recognition time is
 * counted against the monthly cap: over it the widget falls back to typing, never to a paid service on its own.
 */
export async function POST(request: NextRequest) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'no-store' };
  const settings = sttSettings(process.env);
  if (settings.provider === 'off' || (!geminiKey() && !process.env.AZURE_SPEECH_KEY)) return new NextResponse(null, { status: 204, headers });

  const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!AUDIO.test(mime)) return NextResponse.json({ error: 'Audio formati noto‘g‘ri.' }, { status: 415, headers });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return NextResponse.json({ error: 'Yozuv juda uzun.' }, { status: 413, headers });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`stt:${ip}`, 40, 10 * 60_000)) return NextResponse.json({ error: 'Juda ko‘p so‘rov. Birozdan so‘ng urinib ko‘ring.' }, { status: 429, headers });

  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length || audio.length > MAX_BYTES) return NextResponse.json({ error: 'Yozuv bo‘sh yoki juda uzun.' }, { status: 413, headers });
  // The widget sends how long it recorded; otherwise estimated from its 24 kbit/s recording (3 bytes per ms).
  const told = Number(request.headers.get('x-audio-ms'));
  const ms = Number.isFinite(told) && told > 0 ? Math.min(told, 120_000) : Math.round(audio.length / 3);
  if (!sttAllowed(settings, await monthSttMs(), ms)) return NextResponse.json({ error: 'Bu oy uchun ovozni tanish limiti tugadi — yozib yuboring.' }, { status: 429, headers });
  const lang = LANGS.find((l) => l === request.nextUrl.searchParams.get('lang')) ?? 'uz-UZ';

  let text: string | null = null;
  let provider = 'gemini';
  if (settings.provider === 'azure') {
    text = await azureTranscribe(audio, mime, lang, request.signal);
    if (text !== null) provider = 'azure';
  }
  if (text === null && geminiKey()) text = await geminiTranscribe(audio, mime, lang, request.signal);
  if (text === null) return NextResponse.json({ error: 'Ovozni matnga aylantirib bo‘lmadi.' }, { status: 502, headers });
  await recordVoice('stt', provider, 0, ms);
  return NextResponse.json({ text: text.slice(0, 2000) }, { headers });
}
