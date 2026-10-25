import 'server-only';

import { AiFailedError } from '@/lib/ai';

/**
 * Google Gemini (free tier with an AI Studio key, no card): the assistant's brain when no Claude key is set,
 * and its voice when no Azure key is set. Key: GEMINI_API_KEY (aistudio.google.com → Get API key).
 */
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
type Content = { role: 'user' | 'model'; parts: Part[] };

/** Claude-style JSON schema → Gemini function declaration (Gemini rejects an empty `properties`). */
function declaration(t: ToolDef) {
  const props = (t.input_schema.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).length
    ? { name: t.name, description: t.description, parameters: { type: 'object', properties: props, required: (t.input_schema.required as string[]) ?? [] } }
    : { name: t.name, description: t.description };
}

/** One reply from Gemini with function calling; `run` executes a tool and returns its text result. */
export async function geminiChat(
  system: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  tools: ToolDef[],
  run: (name: string, input: Record<string, unknown>) => Promise<string>,
): Promise<string> {
  // The configured model first, then other free models (a retired or renamed model answers 404).
  const models = [process.env.ASSISTANT_GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  );
  let modelIndex = 0;
  const contents: Content[] = history.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] }));

  for (let round = 0; round < 8; round++) {
    const model = models[modelIndex];
    let res: Response;
    try {
      res = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(), 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: tools.map(declaration) }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.6 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new AiFailedError('Ulanishda xato. Birozdan so‘ng qayta urinib ko‘ring. (GNET)');
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 400);
      console.error('[assistant] Gemini', model, res.status, detail);
      // Model missing or over its own quota: try the next free model.
      if ((res.status === 404 || res.status === 429 || res.status >= 500) && modelIndex < models.length - 1) {
        modelIndex++;
        continue;
      }
      if (res.status === 429) throw new AiFailedError('Bugungi bepul limit tugadi. Birozdan so‘ng yozing. (G429)');
      if (res.status === 400 && /API key/i.test(detail)) throw new AiFailedError('AI kaliti noto‘g‘ri. (G400)');
      if (res.status === 403) throw new AiFailedError('AI kaliti faol emas yoki bu hududda ruxsat yo‘q. (G403)');
      throw new AiFailedError(`Hozir band ekanman, bir daqiqadan so‘ng yozing. (G${res.status})`);
    }
    const data = (await res.json()) as { candidates?: { content?: Content }[] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!calls.length) return text;

    contents.push({ role: 'model', parts });
    const responses: Part[] = [];
    for (const p of calls) {
      const out = await run(p.functionCall!.name, p.functionCall!.args ?? {});
      responses.push({ functionResponse: { name: p.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return 'Kechirasiz, javobni tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.';
}

/** Finds the first base64 audio payload anywhere in the TTS response (the shape differs between API versions). */
function findAudio(node: unknown): { data: string; mime: string } | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const mime = String(o.mimeType ?? o.mime_type ?? '');
  if (typeof o.data === 'string' && o.data.length > 200 && (mime.startsWith('audio') || o.type === 'audio' || mime === '')) return { data: o.data, mime };
  for (const v of Object.values(o)) {
    const found = Array.isArray(v) ? v.map(findAudio).find(Boolean) : findAudio(v);
    if (found) return found;
  }
  return null;
}

/** Raw 16-bit 24 kHz mono PCM → a WAV file the browser can play. */
function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Speech from Gemini TTS (free tier) as a playable WAV, or null when it is unavailable or over quota. */
export async function geminiSpeech(text: string): Promise<{ body: Buffer; type: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  const model = process.env.ASSISTANT_GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts';
  const voice = process.env.ASSISTANT_GEMINI_VOICE || 'Puck';
  const style = 'a cheerful, friendly little robot assistant; warm and upbeat, clear pronunciation, natural pace';
  const say = `Say in a ${style} voice: ${text}`;
  // Newer Interactions API first; the classic generateContent audio output as a fallback.
  const attempts: [string, unknown][] = [
    [
      `${BASE}/interactions`,
      {
        model,
        input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      },
    ],
    [
      `${BASE}/models/${model}:generateContent`,
      { contents: [{ parts: [{ text: say }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } },
    ],
    [
      `${BASE}/models/gemini-2.5-flash-preview-tts:generateContent`,
      { contents: [{ parts: [{ text: say }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } },
    ],
  ];
  let audio: { data: string; mime: string } | null = null;
  for (const [url, body] of attempts) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    }).catch(() => null);
    if (!res?.ok) {
      console.error('[assistant] Gemini TTS', url.split('/').pop(), res?.status, (await res?.text().catch(() => ''))?.slice(0, 300));
      continue;
    }
    audio = findAudio(await res.json().catch(() => null));
    if (audio) break;
  }
  if (!audio) return null;
  const bytes = Buffer.from(audio.data, 'base64');
  const isWav = bytes.subarray(0, 4).toString('ascii') === 'RIFF';
  if (isWav) return { body: bytes, type: 'audio/wav' };
  const rate = Number(/rate=(\d+)/.exec(audio.mime)?.[1]) || 24000;
  if (audio.mime.includes('mpeg') || audio.mime.includes('mp3')) return { body: bytes, type: 'audio/mpeg' };
  return { body: pcmToWav(bytes, rate), type: 'audio/wav' };
}
