import 'server-only';

import { AiFailedError } from '@/lib/ai';
import type { ModelUsage } from './gemini';
import type { Effort } from './sunny';

/**
 * Sunny's brain on the OpenAI Responses API, streamed: `onText` gets every piece of the reply as soon as the model
 * writes it. Function calling runs Sunny's own allowlisted tools (`run`), whose permissions are checked with the
 * person's session — the model never touches the database. OPENAI_API_KEY is read here, on the server, and never
 * leaves it (not logged, not sent to the browser). Nothing is stored at OpenAI (`store: false`).
 *
 * Speed: one request per model round, a deadline for the first event (a stuck call is not waited on), a stable
 * instruction prefix with a `prompt_cache_key` so repeated questions reuse OpenAI's prompt cache, and no reasoning by
 * default. A model the key cannot use (404/403) is skipped for a while and the fallback model answers.
 */

const ENDPOINT = 'https://api.openai.com/v1/responses';
export const openaiKey = () => process.env.OPENAI_API_KEY?.trim() || '';

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
type Item = Record<string, unknown> & { type?: string };
type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
type Final = { status?: string; output?: Item[]; usage?: Usage; error?: { message?: string; code?: string } | null; incomplete_details?: { reason?: string } | null };
type Event = { type: string; delta?: string; item?: Item; response?: Final; message?: string; code?: string; error?: { message?: string; code?: string } };

export type RoundTiming = { model: string; firstEventMs: number | null; ms: number };
export type OpenAiOptions = {
  model: string;
  /** Answers instead when `model` is unavailable to this key (e.g. the advanced model not enabled). */
  fallback?: string;
  effort: Effort;
  maxTokens: number;
  /** Output room once a tool returned data (lists of people, tasks): such answers are longer. */
  maxTokensData: number;
  cacheKey: string;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
  onUsage?: (u: ModelUsage) => void;
  onRound?: (t: RoundTiming) => void;
  fetchImpl?: typeof fetch;
};

// Per server instance: models the key cannot use, and the reasoning settings a model refused (so they are not retried).
const unavailable = new Map<string, number>();
const noEffort = new Set<string>();
const noInclude = new Set<string>();
const noCacheKey = new Set<string>();

/** Sunny's tool definitions (JSON schema) → OpenAI function tools. Free-form (non-strict): the tools validate input. */
export function functionTools(tools: ToolDef[]) {
  return tools.map((t) => {
    const schema = t.input_schema ?? {};
    const parameters = { type: 'object', properties: (schema.properties as Record<string, unknown>) ?? {}, ...(Array.isArray(schema.required) && schema.required.length ? { required: schema.required } : {}) };
    return { type: 'function' as const, name: t.name, description: t.description, parameters, strict: false };
  });
}

/** Server-sent events → parsed JSON events. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<Event> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const parse = (block: string): Event | null => {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return null;
    try {
      return JSON.parse(data) as Event;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      for (let i = buffer.indexOf('\n\n'); i >= 0; i = buffer.indexOf('\n\n')) {
        const ev = parse(buffer.slice(0, i));
        buffer = buffer.slice(i + 2);
        if (ev) yield ev;
      }
    }
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

/** Items of one round as the next request's input: reasoning kept whole (encrypted), ids dropped elsewhere. */
function carry(items: Item[]): Item[] {
  return items
    .filter((it) => it.type === 'function_call' || it.type === 'message' || (it.type === 'reasoning' && typeof it.encrypted_content === 'string'))
    .map((it) => {
      if (it.type === 'reasoning') return it;
      const { id: _id, status: _status, ...rest } = it;
      void _id;
      void _status;
      return rest;
    });
}

const NO_REPLY = 'Kechirasiz, javobni tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.';
const STILL_WORKS = 'vazifalarim, keldim, brifing, s’yomkalar';

/**
 * One reply with function calling. `run` executes a tool (with the person's permissions) and returns its text result.
 * Returns everything that was streamed. Throws AiFailedError with a short, honest Uzbek message (no internals).
 */
export async function openaiChat(system: string, history: { role: 'user' | 'assistant'; text: string }[], tools: ToolDef[], run: (name: string, input: Record<string, unknown>) => Promise<string>, o: OpenAiOptions): Promise<string> {
  const key = openaiKey();
  if (!key) throw new AiFailedError('AI ulanmagan — administrator OPENAI_API_KEY ni sozlashi kerak.');
  const doFetch = o.fetchImpl ?? fetch;
  const input: Item[] = history.map((t) => ({ role: t.role, content: t.text }));
  const fnTools = functionTools(tools);
  let model = (unavailable.get(o.model) ?? 0) > Date.now() && o.fallback ? o.fallback : o.model;
  let reply = '';
  let gap = false;
  let usedTool = false;
  let retried = false;
  const emit = (text: string) => {
    if (!text) return;
    // Text written before a tool call and the answer after it are separate paragraphs.
    if (gap && reply) {
      reply += '\n\n';
      o.onText?.('\n\n');
    }
    gap = false;
    reply += text;
    o.onText?.(text);
  };

  for (let round = 0; round < 7; round++) {
    if (o.signal?.aborted) break;
    const started = Date.now();
    const ctl = new AbortController();
    // No first event in 12 s: the call is stuck, not slow. 45 s for a whole round.
    const firstTimer = setTimeout(() => ctl.abort(), 12_000);
    const totalTimer = setTimeout(() => ctl.abort(), 45_000);
    const signal = o.signal ? AbortSignal.any([o.signal, ctl.signal]) : ctl.signal;
    const reasoning = o.effort && !noEffort.has(model) ? { reasoning: { effort: o.effort } } : {};
    const include = !noInclude.has(model) && !noEffort.has(model) ? { include: ['reasoning.encrypted_content'] } : {};
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions: system,
          input,
          ...(fnTools.length ? { tools: fnTools } : {}),
          stream: true,
          store: false,
          max_output_tokens: usedTool ? o.maxTokensData : o.maxTokens,
          ...(noCacheKey.has(model) ? {} : { prompt_cache_key: o.cacheKey }),
          ...reasoning,
          ...include,
        }),
        signal,
      });
    } catch {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      if (o.signal?.aborted) break;
      if (!reply && !retried) {
        retried = true;
        continue;
      }
      throw new AiFailedError('AI xizmatiga ulanib bo‘lmadi (tarmoq sekin yoki javob kechikdi). Qayta urinib ko‘ring. (ONET)');
    }

    if (!res.ok || !res.body) {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      const detail = (await res.text().catch(() => '')).slice(0, 600);
      // Status and OpenAI's own message only: never the request (it holds the conversation) and never the key.
      console.error('[assistant] OpenAI', model, res.status, detail.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-…').slice(0, 300));
      if (res.status === 400 && /reasoning|effort/i.test(detail) && o.effort && !noEffort.has(model)) {
        noEffort.add(model);
        continue;
      }
      if (res.status === 400 && /prompt_cache_key/i.test(detail) && !noCacheKey.has(model)) {
        noCacheKey.add(model);
        continue;
      }
      if (res.status === 400 && /include|encrypted_content/i.test(detail) && !noInclude.has(model)) {
        noInclude.add(model);
        continue;
      }
      if ((res.status === 404 || res.status === 403) && o.fallback && model !== o.fallback) {
        unavailable.set(model, Date.now() + 30 * 60_000);
        model = o.fallback;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && !retried && !reply) {
        retried = true;
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      if (res.status === 401) throw new AiFailedError('AI kaliti noto‘g‘ri yoki faol emas — administrator tekshirishi kerak. (O401)');
      if (res.status === 404 || res.status === 403) throw new AiFailedError(`Tanlangan AI modeli bu kalitga ochiq emas — administrator sozlamani tekshirsin. (O${res.status})`);
      if (res.status === 429) throw new AiFailedError(`AI hozir band yoki limitga yetdi — bir daqiqadan so‘ng qayta yozing. Aniq buyruqlar (${STILL_WORKS}) ishlayveradi. (O429)`);
      if (res.status >= 500) throw new AiFailedError(`AI xizmati hozir javob bermayapti — birozdan so‘ng urinib ko‘ring. Aniq buyruqlar (${STILL_WORKS}) ishlayveradi. (O${res.status})`);
      throw new AiFailedError(`So‘rovni AI qabul qilmadi — savolni qisqaroq yozib ko‘ring. (O${res.status})`);
    }

    let firstEventMs: number | null = null;
    let final: Final | null = null;
    const items: Item[] = [];
    let wrote = false;
    try {
      for await (const ev of events(res.body)) {
        if (firstEventMs === null) {
          firstEventMs = Date.now() - started;
          clearTimeout(firstTimer);
        }
        if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
          wrote = true;
          emit(ev.delta);
        } else if (ev.type === 'response.output_item.done' && ev.item) items.push(ev.item);
        else if (ev.type === 'response.completed' || ev.type === 'response.incomplete' || ev.type === 'response.failed') final = ev.response ?? null;
        else if (ev.type === 'error') throw new Error(ev.message ?? ev.error?.message ?? 'stream error');
      }
    } catch (error) {
      if (o.signal?.aborted) break;
      console.error('[assistant] OpenAI stream broke', model, error instanceof Error ? error.message.slice(0, 200) : 'error');
      // Half an answer is still an answer; with nothing written yet, the person is told plainly.
      if (wrote || reply) return reply.trim();
      throw new AiFailedError('AI javobi uzilib qoldi. Qayta urinib ko‘ring. (ONET)');
    } finally {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      o.onRound?.({ model, firstEventMs, ms: Date.now() - started });
      const u = final?.usage;
      if (u) {
        const reasoningTokens = u.output_tokens_details?.reasoning_tokens ?? 0;
        o.onUsage?.({ model, input: u.input_tokens ?? 0, output: Math.max(0, (u.output_tokens ?? 0) - reasoningTokens), cached: u.input_tokens_details?.cached_tokens ?? 0, thoughts: reasoningTokens });
      }
    }

    if (final?.status === 'failed') {
      if (reply) return reply.trim();
      throw new AiFailedError('AI so‘rovni bajara olmadi. Qayta urinib ko‘ring. (OFAIL)');
    }
    const output = final?.output?.length ? final.output : items;
    const calls = output.filter((it) => it.type === 'function_call' && typeof it.name === 'string' && typeof it.call_id === 'string');
    // Cut at the length limit: what was written stands (the person can ask to continue).
    if (!calls.length || final?.status === 'incomplete') return reply.trim() || NO_REPLY;

    input.push(...carry(output));
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(call.arguments ?? '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        // malformed arguments: the tool gets none and answers with what it needs
      }
      const out = await run(String(call.name), args);
      input.push({ type: 'function_call_output', call_id: String(call.call_id), output: out });
    }
    usedTool = true;
    gap = true;
  }
  return reply.trim() || NO_REPLY;
}
