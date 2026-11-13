import 'server-only';

import { aiConfig, checkModel, respond, type AiResult, type AiUsage } from '@/lib/brief/openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyDateKey, agencyDayRange } from '@/lib/time';

import { imageConfig, type ImageUsage } from './images';

/**
 * The agent's AI — OpenAI only (no Telegram, no other provider):
 *   content  (OPENAI_CONTENT_MODEL,  default gpt-6-luna)  — plans, captions, edit classification, quick checks;
 *   strategy (OPENAI_STRATEGY_MODEL, default gpt-6.1-sol) — the creative package, trend research, evaluation;
 *   images   (OPENAI_IMAGE_MODEL / OPENAI_IMAGE_EDIT_MODEL) — see images.ts.
 * Every call is recorded in agent_usage (tokens, images, cost when the price is configured); a daily cap on text calls
 * and the image budgets (insights.ts → budgetCheck) stop runaway spending.
 */

export class AgentAiOffline extends Error {
  constructor() {
    super('OPENAI_API_KEY o‘rnatilmagan — AI ishlamaydi.');
  }
}
export class AgentLimitError extends Error {}
export class AgentAiError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

export type Tier = 'content' | 'strategy';
export const aiOnline = () => !!aiConfig().key;
export const modelOf = (tier: Tier) => aiConfig().models[tier];

const db = () => createAdminClient();

export async function recordUsage(a: { profileId: string | null; itemId?: string | null; purpose: string; kind: 'text' | 'image' | 'image_edit' | 'vision' | 'research'; model: string; usage?: AiUsage | ImageUsage; images?: number; searches?: number }) {
  await db()
    .from('agent_usage')
    .insert({
      profile_id: a.profileId,
      item_id: a.itemId ?? null,
      purpose: a.purpose.slice(0, 40),
      provider: 'openai',
      model: a.model.slice(0, 80),
      kind: a.kind,
      input_tokens: a.usage?.input ?? 0,
      output_tokens: a.usage?.output ?? 0,
      images: a.images ?? 0,
      web_searches: a.searches ?? 0,
      cost_usd: a.usage?.costUsd ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function textCallsToday(): Promise<number> {
  const { from, to } = agencyDayRange(agencyDateKey());
  const { count } = await db().from('agent_usage').select('id', { count: 'exact', head: true }).neq('kind', 'image').neq('kind', 'image_edit').gte('created_at', from).lt('created_at', to);
  return count ?? 0;
}

async function checkTextLimit() {
  const { data } = await db().from('agent_settings').select('daily_ai_limit').eq('id', 1).maybeSingle();
  const limit = data?.daily_ai_limit ?? 150;
  if ((await textCallsToday()) >= limit) throw new AgentLimitError(`Kunlik AI matn chaqiruvlari limiti (${limit}) tugadi. Sozlamalarda oshirish mumkin.`);
}

const retryable = (r: AiResult<unknown>) => !r.ok && ['timeout', 'rate', 'server', 'incomplete'].includes(r.kind);

/** One structured call; the result is validated by `parse` (AI output is untrusted until it passes). */
export async function agentJson<T>(a: {
  tier: Tier;
  profileId: string | null;
  itemId?: string | null;
  purpose: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (x: unknown) => T | null;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<{ data: T; model: string }> {
  if (!aiOnline()) throw new AgentAiOffline();
  await checkTextLimit();
  const r = await respond<T>({
    purpose: a.tier,
    instructions: a.system,
    input: a.user,
    schemaName: a.schemaName,
    schema: a.schema,
    parse: a.parse,
    maxOutputTokens: a.maxOutputTokens ?? 8000,
    timeoutMs: a.timeoutMs ?? 120_000,
  });
  await recordUsage({ profileId: a.profileId, itemId: a.itemId, purpose: a.purpose, kind: 'text', model: modelOf(a.tier), usage: r.ok ? r.usage : r.usage });
  if (!r.ok) throw new AgentAiError(`AI (${modelOf(a.tier)}): ${r.message}`, retryable(r));
  return { data: r.data, model: r.model };
}

/** Looks at rendered images (small JPEGs) and answers in a schema — the AI half of the quality check. */
export async function agentVision<T>(a: {
  profileId: string;
  itemId: string;
  system: string;
  user: string;
  images: Buffer[];
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (x: unknown) => T | null;
}): Promise<{ data: T; model: string }> {
  if (!aiOnline()) throw new AgentAiOffline();
  await checkTextLimit();
  const content = [
    { type: 'input_text', text: a.user },
    ...a.images.map((b) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${b.toString('base64')}`, detail: 'high' })),
  ];
  const r = await respond<T>({
    purpose: 'content',
    instructions: a.system,
    input: [{ role: 'user', content }],
    schemaName: a.schemaName,
    schema: a.schema,
    parse: a.parse,
    maxOutputTokens: 6000,
    timeoutMs: 120_000,
  });
  await recordUsage({ profileId: a.profileId, itemId: a.itemId, purpose: 'qa_vision', kind: 'vision', model: modelOf('content'), usage: r.ok ? r.usage : r.usage });
  if (!r.ok) throw new AgentAiError(`AI sifat tekshiruvi: ${r.message}`, retryable(r));
  return { data: r.data, model: r.model };
}

// ---------------------------------------------------------------------------------------------------------------
// Trend research: OpenAI web search. A finding is kept only with a source URL the search itself returned.
// ---------------------------------------------------------------------------------------------------------------
export type Finding = {
  title: string;
  source_url: string;
  source_title: string;
  platform: string;
  format: string;
  visual_direction: string;
  why: string;
  adaptation: string;
  freshness: 'fresh' | 'recent' | 'evergreen' | 'unknown';
  confidence: number;
};

/** Every URL the response cited or the search consulted. */
export function sourcesOf(body: Record<string, unknown>): Set<string> {
  const urls = new Set<string>();
  for (const item of (body.output as Record<string, unknown>[] | undefined) ?? []) {
    if (item.type === 'web_search_call') {
      const action = (item.action ?? {}) as { sources?: { url?: string }[] };
      for (const s of action.sources ?? []) if (s.url) urls.add(s.url);
    }
    if (item.type === 'message')
      for (const c of (item.content as { annotations?: { type?: string; url?: string }[] }[] | undefined) ?? [])
        for (const an of c.annotations ?? []) if (an.type === 'url_citation' && an.url) urls.add(an.url);
  }
  return urls;
}

/** A URL counts as verified when it matches a returned source (same host and path; query and tracking ignored). */
export function verifiedUrl(url: string, sources: Set<string>): boolean {
  const key = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return null;
    }
  };
  const k = key(url);
  if (!k) return false;
  for (const s of sources) if (key(s) === k) return true;
  return false;
}

export function parseFindings(input: unknown): Finding[] | null {
  if (typeof input !== 'string') return null;
  const text = input;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
  const list = (raw as { findings?: unknown[] })?.findings;
  if (!Array.isArray(list)) return null;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return list
    .slice(0, 12)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const fr = str(o.freshness, 20);
      const conf = typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.5;
      return {
        title: str(o.title, 200),
        source_url: str(o.source_url, 1000),
        source_title: str(o.source_title, 300),
        platform: str(o.platform, 60),
        format: str(o.format, 80),
        visual_direction: str(o.visual_direction, 600),
        why: str(o.why, 1000),
        adaptation: str(o.adaptation, 1000),
        freshness: (['fresh', 'recent', 'evergreen'].includes(fr) ? fr : 'unknown') as Finding['freshness'],
        confidence: conf,
      };
    })
    .filter((f) => f.title && /^https?:\/\//.test(f.source_url));
}

export async function agentResearch(a: { profileId: string; system: string; user: string; country?: string }): Promise<{ kept: (Finding & { verified: boolean })[]; dropped: number; model: string; sources: number }> {
  if (!aiOnline()) throw new AgentAiOffline();
  await checkTextLimit();
  let body: Record<string, unknown> = {};
  const r = await respond<Finding[]>({
    purpose: 'strategy',
    instructions: a.system,
    input: a.user,
    schemaName: 'trends',
    schema: null,
    format: 'text',
    parse: parseFindings,
    tools: [{ type: 'web_search', user_location: { type: 'approximate', country: a.country ?? 'UZ' } }],
    include: ['web_search_call.action.sources'],
    onBody: (b) => (body = b),
    maxOutputTokens: 12_000,
    timeoutMs: 200_000,
  });
  const searches = ((body.output as { type?: string }[] | undefined) ?? []).filter((o) => o.type === 'web_search_call').length;
  await recordUsage({ profileId: a.profileId, purpose: 'trend_research', kind: 'research', model: modelOf('strategy'), usage: r.ok ? r.usage : r.usage, searches });
  if (!r.ok) throw new AgentAiError(`Trend tadqiqoti: ${r.message}`, retryable(r));
  const sources = sourcesOf(body);
  const kept = r.data.map((f) => ({ ...f, verified: verifiedUrl(f.source_url, sources) }));
  // Unverified sources are not stored as facts: dropped (and counted, so the report says how many).
  return { kept: kept.filter((f) => f.verified), dropped: kept.filter((f) => !f.verified).length, model: r.model, sources: sources.size };
}

// ---------------------------------------------------------------------------------------------------------------
// Model availability (settings page): nothing generated.
// ---------------------------------------------------------------------------------------------------------------
export async function modelsStatus(sunny?: { primary: string; complex: string }) {
  const cfg = aiConfig();
  const img = imageConfig();
  if (!cfg.key) return { configured: false, models: [] as { role: string; model: string; ok: boolean; message: string }[] };
  const list = [
    ...(sunny ? [{ role: 'Sunny (kundalik)', model: sunny.primary }, { role: 'Sunny (murakkab so‘rov)', model: sunny.complex }] : []),
    { role: 'Kontent (matn, reja)', model: cfg.models.content },
    { role: 'Strategiya (kreativ paket, tadqiqot)', model: cfg.models.strategy },
    { role: 'Rasm (tejamkor / muvozanatli)', model: img.economy },
    { role: 'Rasm (premium)', model: img.premium },
    { role: 'Rasm (tez / tahrir)', model: img.fast },
  ];
  const models = await Promise.all(list.map(async (m) => ({ ...m, ...(await checkModel(m.model)) })));
  return { configured: true, models: models.map((m) => ({ role: m.role, model: m.model, ok: m.ok, message: m.message })) };
}
