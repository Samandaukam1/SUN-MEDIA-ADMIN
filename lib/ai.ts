import 'server-only';

import { aiReady as openaiReady, respond } from '@/lib/brief/openai';

/**
 * The studio's AI ("Mijoz tahlili" by hand, the Instagram screenshots), called from the server only: OpenAI (Responses
 * API, OPENAI_ANALYSIS_MODEL) when OPENAI_API_KEY is set — the same prompt and pictures — otherwise Claude (Anthropic
 * Messages API, ANTHROPIC_API_KEY, AI_MODEL). Keys stay in the server environment and never reach the browser.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI_NOT_CONFIGURED');
  }
}

export class AiFailedError extends Error {}

export type AiContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } };

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || openaiReady();
}

/** The same request through OpenAI: system → instructions, text and pictures → one user message; JSON answer. */
async function askOpenAi(system: string, content: AiContent[], maxTokens: number): Promise<{ text: string; model: string }> {
  const parts = content.map((c) =>
    c.type === 'text' ? { type: 'input_text', text: c.text } : { type: 'input_image', image_url: `data:${c.source.media_type};base64,${c.source.data}` },
  );
  const r = await respond<unknown>({
    purpose: 'analysis',
    instructions: `${system}\nJavob faqat bitta JSON obyekt bo‘lsin.`,
    input: [{ role: 'user', content: parts }],
    schemaName: 'studio',
    schema: null,
    parse: (d) => (d && typeof d === 'object' ? d : null),
    // Reasoning models think within the output budget: leave them room.
    maxOutputTokens: Math.max(maxTokens * 3, 12_000),
    timeoutMs: 105_000,
  });
  if (!r.ok) {
    if (r.kind === 'config') throw new AiNotConfiguredError();
    throw new AiFailedError(r.message);
  }
  return { text: JSON.stringify(r.data), model: r.model };
}

export async function askClaude({ system, content, maxTokens = 4000 }: { system: string; content: AiContent[]; maxTokens?: number }): Promise<{ text: string; model: string }> {
  if (openaiReady()) return askOpenAi(system, content, maxTokens);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiNotConfiguredError();
  const model = process.env.AI_MODEL || 'claude-sonnet-5-5';
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    throw new AiFailedError('AI xizmatiga ulanib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AiFailedError('AI kaliti noto‘g‘ri yoki faol emas.');
    if (response.status === 429) throw new AiFailedError('AI xizmati band (limit). Bir daqiqadan so‘ng qayta urinib ko‘ring.');
    if (response.status === 529 || response.status >= 500) throw new AiFailedError('AI xizmati hozir band. Birozdan so‘ng qayta urinib ko‘ring.');
    throw new AiFailedError('AI so‘rovni qabul qilmadi.');
  }
  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  return { text, model };
}

/** The JSON object in a reply (tolerates text or a code fence around it). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiFailedError('AI javobi tushunarsiz bo‘ldi. Qayta urinib ko‘ring.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiFailedError('AI javobi tushunarsiz bo‘ldi. Qayta urinib ko‘ring.');
  }
}
