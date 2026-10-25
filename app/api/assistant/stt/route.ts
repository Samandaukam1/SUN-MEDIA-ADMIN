import { NextResponse, type NextRequest } from 'next/server';

import { geminiKey, geminiTranscribe } from '@/lib/assistant/gemini';
import { corsHeaders, rateLimited } from '@/lib/assistant/request';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 3 * 1024 * 1024;
const LANGS = ['uz-UZ', 'ru-RU', 'en-US'];
const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|flac|x-m4a)$/;

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST audio/* (≤ 3 MB, ?lang=uz-UZ) → { text }. The widget's ears where the browser has no Uzbek recognition
 * (Safari, iPhone, Firefox). The recording goes to Gemini only and is not stored. 204 when no Gemini key is set.
 */
export async function POST(request: NextRequest) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'no-store' };
  if (!geminiKey()) return new NextResponse(null, { status: 204, headers });

  const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!AUDIO.test(mime)) return NextResponse.json({ error: 'Audio formati noto‘g‘ri.' }, { status: 415, headers });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return NextResponse.json({ error: 'Yozuv juda uzun.' }, { status: 413, headers });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(`stt:${ip}`, 40, 10 * 60_000)) return NextResponse.json({ error: 'Juda ko‘p so‘rov. Birozdan so‘ng urinib ko‘ring.' }, { status: 429, headers });

  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length || audio.length > MAX_BYTES) return NextResponse.json({ error: 'Yozuv bo‘sh yoki juda uzun.' }, { status: 413, headers });
  const lang = LANGS.find((l) => l === request.nextUrl.searchParams.get('lang')) ?? 'uz-UZ';

  const text = await geminiTranscribe(audio, mime, lang, request.signal);
  if (text === null) return NextResponse.json({ error: 'Ovozni matnga aylantirib bo‘lmadi.' }, { status: 502, headers });
  return NextResponse.json({ text: text.slice(0, 2000) }, { headers });
}
