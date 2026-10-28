import 'server-only';

import { AiFailedError } from '@/lib/ai';

/**
 * Google Gemini (free tier with an AI Studio key, no card): the assistant's brain when no Claude key is set, its voice
 * when no Azure key is set, and its ears where the browser cannot recognise Uzbek. Key: GEMINI_API_KEY
 * (aistudio.google.com → Get API key).
 */
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: { mimeType?: string; data?: string };
};
type Content = { role: 'user' | 'model'; parts: Part[] };
type UsageMeta = { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
type Chunk = { candidates?: { content?: Content; finishReason?: string }[]; error?: { code?: number; message?: string }; usageMetadata?: UsageMeta };
/** What one model call used, as Gemini reported it (cost accounting). */
export type ModelUsage = { model: string; input: number; output: number; cached: number; thoughts: number };

/**
 * Models that just refused (free quota used up, or missing) are skipped until they are expected back, so a reply does not
 * first wait for a refusal. Per server instance; a cold start simply tries them again.
 */
const resting = new Map<string, number>();
function rest(model: string, status: number, detail: string) {
  const retry = Number(/"retryDelay":\s*"(\d+)/.exec(detail)?.[1]);
  const seconds = status === 404 ? 3600 : status >= 500 ? 60 : /PerDay/i.test(detail) ? Math.max(retry || 0, 1800) : retry > 0 ? retry : 120;
  resting.set(model, Date.now() + Math.min(seconds, 3600) * 1000);
}
function awake(models: (string | undefined)[], { strict = false } = {}): string[] {
  const list = models.filter((m, i, all): m is string => !!m && all.indexOf(m) === i);
  const now = Date.now();
  const ready = list.filter((m) => (resting.get(m) ?? 0) <= now);
  // A reply is worth one more try on a tired model; a voice is not (the widget falls back at once).
  return ready.length || strict ? ready : list;
}

/**
 * The least thinking each model accepts: a sales chat needs a fast first word more than deliberation. Lite models take
 * "minimal", the larger flash models start at "low" (they refuse "minimal"). A model that refuses a setting (400) moves to
 * the next one, ending with the model's own default.
 */
const thinkingStep = new Map<string, number>();
function thinkingFor(model: string): Record<string, unknown> | undefined {
  const ladder: Record<string, unknown>[] = /^gemini-2\.5/.test(model)
    ? [{ thinkingBudget: 0 }]
    : /^gemini-\d.*-lite/.test(model)
      ? [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }]
      : /^gemini-\d/.test(model)
        ? [{ thinkingLevel: 'low' }]
        : [];
  return ladder[thinkingStep.get(model) ?? 0];
}
function refusedThinking(model: string, status: number, detail: string): boolean {
  if (status !== 400 || !/thinking/i.test(detail) || !thinkingFor(model)) return false;
  thinkingStep.set(model, (thinkingStep.get(model) ?? 0) + 1);
  return true;
}

/** Claude-style JSON schema → Gemini function declaration (Gemini rejects an empty `properties`). */
function declaration(t: ToolDef) {
  const props = (t.input_schema.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).length
    ? { name: t.name, description: t.description, parameters: { type: 'object', properties: props, required: (t.input_schema.required as string[]) ?? [] } }
    : { name: t.name, description: t.description };
}

/** Server-sent events → parsed JSON chunks. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<Chunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const parse = (line: string): Chunk | null => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') return null;
    try {
      return JSON.parse(data) as Chunk;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const chunk = parse(buffer.slice(0, i).trim());
        buffer = buffer.slice(i + 1);
        if (chunk) yield chunk;
      }
    }
    const last = parse(buffer.trim());
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

/** A signal that fires on the caller's abort, on `firstMs` without a first chunk, or on `totalMs` overall. */
function deadline(outer: AbortSignal | undefined, firstMs: number, totalMs: number) {
  const ctl = new AbortController();
  const first = setTimeout(() => ctl.abort(), firstMs);
  const total = setTimeout(() => ctl.abort(), totalMs);
  const signal = outer ? AbortSignal.any([outer, ctl.signal]) : ctl.signal;
  const done = () => (clearTimeout(first), clearTimeout(total));
  return { signal, started: () => clearTimeout(first), done, abort: () => (done(), ctl.abort()) };
}

const NO_REPLY = 'Kechirasiz, javobni tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.';
const STILL_WORKS = 'vazifalarim, keldim, brifing, s’yomkalar';

/**
 * One reply from Gemini with function calling, streamed: `onText` gets each piece of text as soon as it is written.
 * `run` executes a tool and returns its text result. Returns the whole reply (everything that was streamed).
 */
export async function geminiChat(
  system: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  tools: ToolDef[],
  run: (name: string, input: Record<string, unknown>) => Promise<string>,
  { onText, signal, maxTokens = 900, onUsage }: { onText?: (delta: string) => void; signal?: AbortSignal; maxTokens?: number; onUsage?: (u: ModelUsage) => void } = {},
): Promise<string> {
  // The configured model first, then the free models fastest first: flash-lite answers in about a second and has the
  // largest free quota; the bigger flash models (20 free requests a day, often "high demand") back it up.
  let models = awake([process.env.ASSISTANT_GEMINI_MODEL, 'gemini-3.8-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash']);
  let modelIndex = 0;
  // "High demand" (503) is temporary: when every model has refused, those are asked once more after a short pause.
  const busy: string[] = [];
  let retried = false;
  // A daily quota is not a per-minute one: the person is told which (and when it comes back).
  let dayQuota = false;
  const onceMore = async () => {
    if (retried || !busy.length || signal?.aborted) return false;
    retried = true;
    models = [...new Set(busy)];
    modelIndex = 0;
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  };
  const contents: Content[] = history.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] }));
  let reply = '';
  let gap = false;
  const emit = (text: string) => {
    if (!text) return;
    // Text written before a tool call and the answer after it are separate paragraphs.
    if (gap && reply) {
      reply += '\n\n';
      onText?.('\n\n');
    }
    gap = false;
    reply += text;
    onText?.(text);
  };
  const nextModel = () => modelIndex < models.length - 1 && !!++modelIndex;

  for (let attempt = 0; attempt < 14; attempt++) {
    if (signal?.aborted) break;
    const model = models[modelIndex];
    const thinkingConfig = thinkingFor(model);
    // Flash-lite starts writing in about a second: no first word in 8 s means it is stuck, not slow.
    const timer = deadline(signal, 8_000, 40_000);
    let res: Response;
    try {
      res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(), 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: tools.map(declaration) }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, ...(thinkingConfig ? { thinkingConfig } : {}) },
        }),
        signal: timer.signal,
      });
    } catch {
      timer.done();
      if (signal?.aborted) break;
      // Slow or unreachable: the next (lighter) free model answers instead.
      console.error('[assistant] Gemini timeout', model);
      // A model that hangs is skipped for a while, so the next questions do not wait on it again.
      resting.set(model, Date.now() + 5 * 60_000);
      if (nextModel() || (await onceMore())) continue;
      throw new AiFailedError('AI xizmatiga ulanib bo‘lmadi (tarmoq sekin yoki javob kechikdi). Qayta urinib ko‘ring. (GNET)');
    }
    if (!res.ok || !res.body) {
      timer.done();
      const detail = (await res.text().catch(() => '')).slice(0, 600);
      console.error('[assistant] Gemini', model, res.status, detail.slice(0, 400));
      if (refusedThinking(model, res.status, detail)) continue;
      if (res.status === 404 || res.status === 429 || res.status >= 500) rest(model, res.status, detail);
      if (res.status === 429 && /PerDay/i.test(detail)) dayQuota = true;
      if (res.status >= 500) busy.push(model);
      // Model missing, over its own quota or overloaded: try the next free model (then the overloaded ones once more).
      if ((res.status === 404 || res.status === 429 || res.status >= 500) && (nextModel() || (await onceMore()))) continue;
      if (res.status === 429 && dayQuota) throw new AiFailedError(`Bugungi bepul AI limiti (Gemini) tugadi — ertaga tiklanadi. Aniq buyruqlar (${STILL_WORKS}) ishlayveradi. (G429)`);
      if (res.status === 429) throw new AiFailedError('AI (Gemini) daqiqalik limitga yetdi — bir daqiqadan so‘ng qayta yozing. (G429)');
      if (res.status === 400 && /API key/i.test(detail)) throw new AiFailedError('AI kaliti noto‘g‘ri — administrator sozlashi kerak. (G400)');
      if (res.status === 401 || res.status === 403) throw new AiFailedError(`AI kaliti faol emas yoki bu hududda ruxsat yo‘q — administrator tekshirishi kerak. (G${res.status})`);
      if (res.status >= 500) throw new AiFailedError(`AI xizmati (Gemini) hozir band — bir daqiqadan so‘ng qayta urinib ko‘ring. Aniq buyruqlar (${STILL_WORKS}) ishlayveradi. (G${res.status})`);
      throw new AiFailedError(`So‘rovni AI qabul qilmadi — savolni qisqaroq yozib ko‘ring. (G${res.status})`);
    }

    const parts: Part[] = [];
    let wrote = false;
    let usage: UsageMeta | null = null;
    try {
      for await (const chunk of events(res.body)) {
        timer.started();
        if (chunk.error) throw new Error(chunk.error.message ?? 'stream error');
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
          parts.push(p);
          if (p.text && !p.thought) {
            wrote = true;
            emit(p.text);
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) break;
      console.error('[assistant] Gemini stream broke', model, error instanceof Error ? error.message : error);
      // Half an answer is still an answer; with nothing written yet, the next model starts over.
      if (wrote) return reply.trim();
      if (nextModel()) continue;
      throw new AiFailedError('AI javobi uzilib qoldi. Qayta urinib ko‘ring. (GNET)');
    } finally {
      timer.done();
      // Every call that produced something is accounted for, as Gemini counted it.
      if (usage) onUsage?.({ model, input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0, cached: usage.cachedContentTokenCount ?? 0, thoughts: usage.thoughtsTokenCount ?? 0 });
    }

    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return reply.trim() || NO_REPLY;

    contents.push({ role: 'model', parts });
    const responses: Part[] = [];
    for (const p of calls) {
      const out = await run(p.functionCall!.name, p.functionCall!.args ?? {});
      responses.push({ functionResponse: { name: p.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: 'user', parts: responses });
    gap = true;
  }
  return reply.trim() || NO_REPLY;
}

/** How Sunny sounds: a teenage boy's voice (about fifteen), bright and clear, a smart digital assistant. */
const VOICE_STYLE: Record<string, string> = {
  'uz-UZ':
    'Read aloud in Uzbek with native Tashkent pronunciation (clear oʻ, gʻ, q, x, h; natural word stress and question intonation), as a friendly, smart teenage boy of about fifteen with a slightly light voice: bright, clear, modern, natural pace',
  'ru-RU': 'Read aloud in Russian as a friendly, smart teenage boy of about fifteen with a slightly light voice: bright, clear, natural pace',
  'en-US': 'Read aloud in English as a friendly, smart teenage boy of about fifteen with a slightly light voice: bright, clear, natural pace',
};
/** Qitmir mode: the same voice and pronunciation, in a livelier mood. */
const QITMIR_MOOD =
  ', in a playful, mischievous mood: a sly smile in the voice, lively, a little dramatic, with short comic pauses — still clear, natural and not squeaky';
const styleFor = (lang: string, playful = false) => (VOICE_STYLE[lang] ?? VOICE_STYLE['uz-UZ']) + (playful ? QITMIR_MOOD : '');
// Free TTS quotas are tiny (10 requests a day per model): models that ran out are not asked again until they reset.
const ttsModels = () => awake([process.env.ASSISTANT_GEMINI_TTS_MODEL, 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'], { strict: true });
const ttsVoice = () => process.env.ASSISTANT_GEMINI_VOICE || 'Puck';
const ttsBody = (text: string, lang: string, playful = false) => ({
  contents: [{ parts: [{ text: `${styleFor(lang, playful)}:\n${text}` }] }],
  generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ttsVoice() } } } },
});

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

const rateOf = (mime: string) => Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;

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

/**
 * Speech while it is being generated: raw 16-bit mono PCM (`rate` Hz), so the widget starts playing on the first chunk
 * instead of waiting for the whole clip. Null when no TTS model streams (the caller then asks for a whole file).
 */
export async function geminiSpeechStream(text: string, lang: string, signal?: AbortSignal, playful = false): Promise<{ stream: ReadableStream<Uint8Array>; rate: number } | null> {
  const key = geminiKey();
  if (!key) return null;
  for (const model of ttsModels()) {
    const timer = deadline(signal, 15_000, 60_000);
    const res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(ttsBody(text, lang, playful)),
      signal: timer.signal,
    }).catch(() => null);
    if (!res?.ok || !res.body) {
      timer.done();
      const detail = (await res?.text().catch(() => '')) ?? '';
      console.error('[assistant] Gemini TTS stream', model, res?.status, detail.slice(0, 300));
      if (res && (res.status === 404 || res.status === 429)) rest(model, res.status, detail);
      if (signal?.aborted) return null;
      continue;
    }
    const chunks = events(res.body);
    // The first audio chunk decides: no audio in it means this model does not speak, try the next one.
    let first: { data: string; mime: string } | null = null;
    try {
      while (!first) {
        const next = await chunks.next();
        if (next.done) break;
        first = findAudio(next.value);
      }
    } catch {
      first = null;
    }
    timer.started();
    if (!first) {
      timer.abort();
      if (signal?.aborted) return null;
      continue;
    }
    const head = first;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from(head.data, 'base64')));
        try {
          for await (const chunk of chunks) {
            const audio = findAudio(chunk);
            if (audio) controller.enqueue(new Uint8Array(Buffer.from(audio.data, 'base64')));
          }
        } catch {
          // the caller left or the stream broke: what was sent is still played
        } finally {
          timer.done();
          try {
            controller.close();
          } catch {
            // already cancelled
          }
        }
      },
      // The listener stopped Sunny (or left): stop generating speech nobody will hear.
      cancel: () => timer.abort(),
    });
    return { stream, rate: rateOf(head.mime) };
  }
  return null;
}

/** Speech from Gemini TTS (free tier) as a playable WAV, or null when it is unavailable or over quota. */
export async function geminiSpeech(text: string, lang = 'uz-UZ', playful = false): Promise<{ body: Buffer; type: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  const style = styleFor(lang, playful);
  const [model] = ttsModels();
  if (!model) return null;
  // Newer Interactions API first (Gemini 3 TTS models only: older ones refuse speech annotations); the classic
  // generateContent audio output as a fallback.
  const attempts: [string, unknown][] = [
    ...(/^gemini-3/.test(model)
      ? [
          [
            `${BASE}/interactions`,
            {
              model,
              input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
              response_format: { type: 'audio' },
              generation_config: { speech_config: [{ voice: ttsVoice() }] },
            },
          ] as [string, unknown],
        ]
      : []),
    ...ttsModels().map((m): [string, unknown] => [`${BASE}/models/${m}:generateContent`, ttsBody(text, lang, playful)]),
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
      const detail = (await res?.text().catch(() => '')) ?? '';
      console.error('[assistant] Gemini TTS', url.split('/').pop(), res?.status, detail.slice(0, 300));
      const used = /models\/([^:]+):/.exec(url)?.[1] ?? model;
      if (res && (res.status === 404 || res.status === 429)) rest(used, res.status, detail);
      continue;
    }
    audio = findAudio(await res.json().catch(() => null));
    if (audio) break;
  }
  if (!audio) return null;
  const bytes = Buffer.from(audio.data, 'base64');
  const isWav = bytes.subarray(0, 4).toString('ascii') === 'RIFF';
  if (isWav) return { body: bytes, type: 'audio/wav' };
  if (audio.mime.includes('mpeg') || audio.mime.includes('mp3')) return { body: bytes, type: 'audio/mpeg' };
  return { body: pcmToWav(bytes, rateOf(audio.mime)), type: 'audio/wav' };
}

const HEARD: Record<string, string> = {
  'uz-UZ': 'The speaker talks Uzbek (sometimes mixed with Russian or English words). Write Uzbek in the Latin alphabet with oʻ, gʻ, sh, ch.',
  'ru-RU': 'The speaker talks Russian. Write it in Cyrillic.',
  'en-US': 'The speaker talks English.',
};

/**
 * Speech → text with Gemini, for browsers whose own recognition has no Uzbek (Safari, iPhone, Firefox). The audio is
 * only sent to Gemini and never stored. Empty string when nothing was said, null when no model could listen.
 */
export async function geminiTranscribe(audio: Buffer, mime: string, lang: string, signal?: AbortSignal): Promise<string | null> {
  const key = geminiKey();
  if (!key) return null;
  const prompt = `Transcribe this voice message word for word, exactly as spoken. ${HEARD[lang] ?? HEARD['uz-UZ']} Brand names: SUN MEDIA. Output only the transcript, no quotes, notes or translation. If there is no intelligible speech, output a single dash: -`;
  const models = awake([process.env.ASSISTANT_GEMINI_STT_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash']);
  for (let i = 0, attempt = 0; i < models.length && attempt < 6; attempt++) {
    const model = models[i];
    const thinkingConfig = thinkingFor(model);
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: audio.toString('base64') } }, { text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 500, ...(thinkingConfig ? { thinkingConfig } : {}) },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) {
      if (signal?.aborted) return null;
      i++;
      continue;
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 600);
      console.error('[assistant] Gemini STT', model, res.status, detail.slice(0, 300));
      if (refusedThinking(model, res.status, detail)) continue;
      if (res.status === 404 || res.status === 429 || res.status >= 500) rest(model, res.status, detail);
      i++;
      continue;
    }
    const data = (await res.json().catch(() => null)) as { candidates?: { content?: Content }[] } | null;
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim()
      .replace(/^["«“]|["»”]$/g, '');
    return text === '-' ? '' : text;
  }
  return null;
}
