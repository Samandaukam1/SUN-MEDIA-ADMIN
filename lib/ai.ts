import 'server-only';

/**
 * Claude (Anthropic Messages API), called from the server only. The key lives in the server environment
 * (ANTHROPIC_API_KEY) and never reaches the browser. AI_MODEL may override the model.
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
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function askClaude({ system, content, maxTokens = 4000 }: { system: string; content: AiContent[]; maxTokens?: number }): Promise<{ text: string; model: string }> {
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
