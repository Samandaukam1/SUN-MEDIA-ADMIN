import 'server-only';

import { textCost } from '@/lib/openai-prices';

/**
 * OpenAI Responses API, server-side only. OPENAI_API_KEY never leaves the server; models come from
 * OPENAI_QUESTION_MODEL / OPENAI_ANALYSIS_MODEL. Every call has a timeout, at most one retry on a passing failure, a
 * strict JSON schema for the answer, and reports its token usage. A model that the account cannot use is remembered
 * for a while and skipped — the interview then runs on the curated questions alone.
 */

export type AiPurpose = 'question' | 'analysis' | 'content' | 'strategy';
export type AiUsage = { input: number; output: number; costUsd: number | null };
export type AiResult<T> =
  | { ok: true; data: T; model: string; usage: AiUsage }
  | { ok: false; kind: 'config' | 'model' | 'timeout' | 'rate' | 'server' | 'bad_request' | 'invalid_output' | 'incomplete' | 'refused'; message: string; usage?: AiUsage };

const ENDPOINT = 'https://api.openai.com/v1';
const DEFAULT_MODELS: Record<AiPurpose, string> = { question: 'gpt-6-luna', analysis: 'gpt-6.1-sol', content: 'gpt-6-luna', strategy: 'gpt-6.1-sol' };

export function aiConfig() {
  const key = process.env.OPENAI_API_KEY?.trim() || null;
  const price = (name: string) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    key,
    models: {
      question: process.env.OPENAI_QUESTION_MODEL?.trim() || DEFAULT_MODELS.question,
      analysis: process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_MODELS.analysis,
      // The content agent: captions and plans; deeper strategy and evaluation.
      content: process.env.OPENAI_CONTENT_MODEL?.trim() || process.env.OPENAI_QUESTION_MODEL?.trim() || DEFAULT_MODELS.content,
      strategy: process.env.OPENAI_STRATEGY_MODEL?.trim() || process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_MODELS.strategy,
    } as Record<AiPurpose, string>,
    // USD per 1M tokens, if the owner set them (cost is recorded only when known — never guessed).
    priceIn: price('OPENAI_PRICE_INPUT_PER_1M'),
    priceOut: price('OPENAI_PRICE_OUTPUT_PER_1M'),
  };
}

export const aiReady = () => !!aiConfig().key;

// Models the account answered "not found / no access" for: skipped for 10 minutes (per server instance).
const unavailable = new Map<string, number>();
const UNAVAILABLE_MS = 10 * 60_000;
export const modelBlocked = (model: string) => (unavailable.get(model) ?? 0) > Date.now();

type Fetch = typeof fetch;

/** Is the model usable with this key? (GET /models/{id}; nothing is generated.) */
export async function checkModel(model: string, fetchImpl: Fetch = fetch): Promise<{ ok: boolean; status: number | null; message: string }> {
  const { key } = aiConfig();
  if (!key) return { ok: false, status: null, message: 'OPENAI_API_KEY serverda o‘rnatilmagan.' };
  try {
    const res = await fetchImpl(`${ENDPOINT}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (res.ok) {
      unavailable.delete(model);
      return { ok: true, status: res.status, message: 'Model mavjud.' };
    }
    if (res.status === 404 || res.status === 403) unavailable.set(model, Date.now() + UNAVAILABLE_MS);
    return { ok: false, status: res.status, message: res.status === 401 ? 'Kalit noto‘g‘ri.' : res.status === 404 ? 'Bu model akkauntda mavjud emas.' : res.status === 403 ? 'Bu modelga ruxsat yo‘q.' : `OpenAI javobi: ${res.status}` };
  } catch {
    return { ok: false, status: null, message: 'OpenAI bilan aloqa yo‘q.' };
  }
}

/** Tokens as OpenAI reported them; cost from OpenAI's list prices per model (lib/openai-prices.ts) or the env override. */
const usageOf = (body: Record<string, unknown>, model: string): AiUsage => {
  const u = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  const input = Number.isFinite(u.input_tokens) ? Number(u.input_tokens) : 0;
  const output = Number.isFinite(u.output_tokens) ? Number(u.output_tokens) : 0;
  const { priceIn, priceOut } = aiConfig();
  const costUsd =
    priceIn !== null && priceOut !== null
      ? Number(((input * priceIn + output * priceOut) / 1e6).toFixed(6))
      : textCost(model, { input, output, cached: Number(u.input_tokens_details?.cached_tokens ?? 0) || 0 });
  return { input, output, costUsd };
};

/** The model's text from a Responses API body (message → output_text), or its refusal. */
export function outputText(body: Record<string, unknown>): { text: string | null; refusal: string | null } {
  if (typeof body.output_text === 'string') return { text: body.output_text, refusal: null };
  const out = Array.isArray(body.output) ? body.output : [];
  let text = '';
  let refusal: string | null = null;
  for (const item of out as { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[]) {
    if (item?.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && typeof c.text === 'string') text += c.text;
      if (c.type === 'refusal') refusal = c.refusal ?? 'refused';
    }
  }
  return { text: text || null, refusal };
}

/**
 * One structured call. `parse` validates the JSON against the app's own schema — the model's output is untrusted
 * data until it passes. Retries once (after a short wait) on 429 / 5xx / timeout while time allows.
 */
export async function respond<T>({
  purpose,
  instructions,
  input,
  schemaName,
  schema,
  parse,
  maxOutputTokens = 1200,
  timeoutMs = 12_000,
  fetchImpl = fetch,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  model: modelOverride,
  tools,
  include,
  format,
  onBody,
}: {
  purpose: AiPurpose;
  /** A specific model instead of the purpose's configured one. */
  model?: string;
  /** Responses API tools (e.g. [{ type: 'web_search' }]) and extra output to include. */
  tools?: unknown[];
  include?: string[];
  /** 'text': no response format; `parse` receives the text itself. Default: schema → json_schema, else json_object. */
  format?: 'text';
  /** The whole response body (e.g. to read citations and search sources). */
  onBody?: (body: Record<string, unknown>) => void;
  instructions: string;
  /** Text, or Responses API input items (e.g. a user message with input_text and input_image parts). */
  input: string | unknown[];
  schemaName: string;
  /** A strict JSON schema; null asks for any JSON object (the caller's prompt describes it, `parse` checks it). */
  schema: Record<string, unknown> | null;
  parse: (data: unknown) => T | null;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<unknown>;
}): Promise<AiResult<T>> {
  const { key, models } = aiConfig();
  const model = modelOverride?.trim() || models[purpose];
  if (!key) return { ok: false, kind: 'config', message: 'OPENAI_API_KEY o‘rnatilmagan.' };
  if (modelBlocked(model)) return { ok: false, kind: 'model', message: `“${model}” modeli hozir mavjud emas.` };

  const started = Date.now();
  // Reasoning models spend output tokens on thinking first: a cut-off answer is retried once with twice the room.
  let budget = maxOutputTokens;
  const bodyOf = () =>
    JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: budget,
      store: false,
      ...(format === 'text' ? {} : { text: { format: schema ? { type: 'json_schema', name: schemaName, schema, strict: true } : { type: 'json_object' } } }),
      ...(tools?.length ? { tools } : {}),
      ...(include?.length ? { include } : {}),
    });
  let last: AiResult<T> = { ok: false, kind: 'server', message: 'AI javob bermadi.' };
  let total: AiUsage = { input: 0, output: 0, costUsd: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = timeoutMs - (Date.now() - started);
    if (left < 1500) break;
    let res: Response;
    try {
      res = await fetchImpl(`${ENDPOINT}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: bodyOf(),
        signal: AbortSignal.timeout(left),
        cache: 'no-store',
      });
    } catch (e) {
      const timeout = (e as { name?: string })?.name === 'TimeoutError' || (e as { name?: string })?.name === 'AbortError';
      last = { ok: false, kind: timeout ? 'timeout' : 'server', message: timeout ? 'AI javobi kechikdi.' : 'AI bilan aloqa yo‘q.' };
      if (attempt === 0) await sleep(600);
      continue;
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (!res.ok) {
      const code = ((json.error ?? {}) as { code?: string }).code ?? '';
      if (res.status === 404 || code === 'model_not_found') {
        unavailable.set(model, Date.now() + UNAVAILABLE_MS);
        return { ok: false, kind: 'model', message: `“${model}” modeli akkauntda mavjud emas.` };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, kind: 'config', message: 'OpenAI kaliti noto‘g‘ri yoki ruxsat yo‘q.' };
      if (res.status === 400) return { ok: false, kind: 'bad_request', message: 'AI so‘rovni qabul qilmadi.' };
      last = { ok: false, kind: res.status === 429 ? 'rate' : 'server', message: res.status === 429 ? 'AI limiti — birozdan so‘ng.' : 'AI xizmatida nosozlik.' };
      if (attempt === 0) await sleep(res.status === 429 ? 1200 : 600);
      continue;
    }
    const one = usageOf(json, model);
    total = { input: total.input + one.input, output: total.output + one.output, costUsd: one.costUsd === null ? total.costUsd : (total.costUsd ?? 0) + one.costUsd };
    const usage = total;
    const reason = ((json.incomplete_details ?? {}) as { reason?: string }).reason;
    if (json.status === 'incomplete') {
      last = { ok: false, kind: 'incomplete', message: reason === 'max_output_tokens' ? 'AI javobi chala qoldi (token chegarasi).' : 'AI javobi chala qoldi.', usage };
      if (reason === 'max_output_tokens' && attempt === 0) {
        budget = Math.min(budget * 2, 64_000);
        continue;
      }
      return last;
    }
    onBody?.(json);
    const { text, refusal } = outputText(json);
    if (refusal) return { ok: false, kind: 'refused', message: 'AI bu so‘rovga javob bermadi.', usage };
    if (!text) return { ok: false, kind: 'invalid_output', message: 'AI javobi bo‘sh.', usage };
    if (format === 'text') {
      const parsedText = parse(text);
      if (parsedText === null) return { ok: false, kind: 'invalid_output', message: 'AI javobi tekshiruvdan o‘tmadi.', usage };
      return { ok: true, data: parsedText, model, usage };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, kind: 'invalid_output', message: 'AI javobi JSON emas.', usage };
    }
    const parsed = parse(data);
    if (parsed === null) return { ok: false, kind: 'invalid_output', message: 'AI javobi tekshiruvdan o‘tmadi.', usage };
    return { ok: true, data: parsed, model, usage };
  }
  return last;
}

/** Phone numbers and e-mail addresses are cut from text before it goes to the model. */
export const redact = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[telefon]');
