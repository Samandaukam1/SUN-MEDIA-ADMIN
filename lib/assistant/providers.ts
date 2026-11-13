import 'server-only';

import { AiFailedError } from '@/lib/ai';
import { geminiChat, geminiKey, type ModelUsage } from './gemini';
import { openaiChat, openaiKey, type RoundTiming } from './openai';
import type { Effort } from './sunny';
import { toolsFor, type AssistantAction, type AssistantContext, type runTool } from './tools';

/**
 * Sunny's AI providers behind one interface, so the assistant (tools, permissions, confirmations, personality, voice,
 * the 3D robot) never depends on which model answers. Sunny 2.0: OpenAI is the brain (OPENAI_API_KEY, models from
 * sunny.ts settings). Gemini and Claude are no longer in the reply path; they answer only if the owner lists them
 * explicitly in ASSISTANT_PROVIDERS (e.g. "openai,gemini"). Gemini's free speech recognition (voice) is separate and
 * unaffected (see gemini.ts / the STT route).
 */
export type ChatTurn = { role: 'user' | 'assistant'; text: string };
export type ProviderInput = {
  system: string;
  history: ChatTurn[];
  ctx: AssistantContext;
  /** Runs one tool for the model (permissions are checked there, with the person's own session). */
  step: (tool: string, input: Record<string, unknown>) => ReturnType<typeof runTool>;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** Each model call's token counts, as the provider reported them (cost accounting). */
  onUsage?: (u: ModelUsage) => void;
  /** Which OpenAI model answers and its limits (model routing in sunny.ts). */
  route: { model: string; fallback?: string; effort: Effort; maxTokens: number; maxTokensData: number; cacheKey: string };
  /** Each model round's timing (speed metrics). */
  onRound?: (t: RoundTiming) => void;
};
export type AiProvider = {
  id: 'gemini' | 'anthropic' | 'openai';
  ready: () => boolean;
  reply: (input: ProviderInput) => Promise<{ reply: string; actions: AssistantAction[] }>;
};

/** Collects what the tools did (the widget shows it as chips and confirmation cards). */
function collector() {
  const actions: AssistantAction[] = [];
  return {
    actions,
    add(result: Awaited<ReturnType<typeof runTool>>) {
      if (result.action) actions.push(result.action);
      if (result.actions) actions.push(...result.actions);
    },
  };
}

const gemini: AiProvider = {
  id: 'gemini',
  ready: () => !!geminiKey(),
  async reply({ system, history, ctx, step, signal, onText, onUsage }) {
    const done = collector();
    const reply = await geminiChat(
      system,
      history,
      toolsFor(ctx),
      async (tool, input) => {
        const result = await step(tool, input);
        done.add(result);
        return result.content;
      },
      // Internal answers list people and numbers: they get more room than a sales reply.
      { onText, signal, maxTokens: ctx.audience === 'staff' ? 1600 : 900, onUsage },
    );
    return { reply, actions: done.actions };
  },
};

const anthropic: AiProvider = {
  id: 'anthropic',
  ready: () => !!process.env.ANTHROPIC_API_KEY,
  async reply({ system, history, ctx, step, signal, onText, onUsage }) {
    const result = await claudeReply(process.env.ANTHROPIC_API_KEY!, system, history, ctx, step, signal, onUsage);
    // Claude answers in one piece.
    onText?.(result.reply);
    return result;
  },
};

const openai: AiProvider = {
  id: 'openai',
  ready: () => !!openaiKey(),
  async reply({ system, history, ctx, step, signal, onText, onUsage, route, onRound }) {
    const done = collector();
    const reply = await openaiChat(
      system,
      history,
      toolsFor(ctx),
      async (tool, input) => {
        const result = await step(tool, input);
        done.add(result);
        return result.content;
      },
      { ...route, onText, signal, onUsage, onRound },
    );
    return { reply, actions: done.actions };
  },
};

const ALL: AiProvider[] = [openai, gemini, anthropic];

/** The providers that can answer now, in the configured order (OpenAI only by default). */
export function configuredProviders(): AiProvider[] {
  const order = (process.env.ASSISTANT_PROVIDERS || 'openai').split(',').map((s) => s.trim());
  return order.map((id) => ALL.find((p) => p.id === id)).filter((p): p is AiProvider => !!p && p.ready());
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
type Message = { role: 'user' | 'assistant'; content: string | Block[] };

async function claudeReply(
  key: string,
  system: string,
  history: ChatTurn[],
  ctx: AssistantContext,
  step: ProviderInput['step'],
  signal?: AbortSignal,
  onUsage?: ProviderInput['onUsage'],
): Promise<{ reply: string; actions: AssistantAction[] }> {
  const actions: AssistantAction[] = [];
  const model = process.env.ASSISTANT_MODEL || process.env.AI_MODEL || 'claude-sonnet-5-5';
  const tools = toolsFor(ctx);
  const messages: Message[] = history.map((t) => ({ role: t.role, content: t.text }));

  for (let round = 0; round < 8; round++) {
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: ctx.audience === 'staff' ? 1400 : 700,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
      });
    } catch {
      throw new AiFailedError('Ulanishda xato. Birozdan so‘ng qayta urinib ko‘ring.');
    }
    if (!response.ok) {
      console.error('[assistant] Claude', response.status, (await response.text().catch(() => '')).slice(0, 400));
      if (response.status === 429 || response.status >= 500) throw new AiFailedError(`Hozir band ekanman, bir daqiqadan so‘ng yozing. (C${response.status})`);
      throw new AiFailedError(`So‘rovni bajarib bo‘lmadi. (C${response.status})`);
    }
    const data = (await response.json()) as { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    const u = data.usage;
    if (u) onUsage?.({ model, input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0, cached: u.cache_read_input_tokens ?? 0, thoughts: 0 });
    const uses = data.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    const text = data.content
      .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (data.stop_reason !== 'tool_use' || uses.length === 0) return { reply: text, actions };

    messages.push({ role: 'assistant', content: data.content });
    const results: Block[] = [];
    for (const use of uses) {
      const result = await step(use.name, use.input ?? {});
      if (result.action) actions.push(result.action);
      if (result.actions) actions.push(...result.actions);
      results.push({ type: 'tool_result', tool_use_id: use.id, content: result.content });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Kechirasiz, javobni tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.', actions };
}
