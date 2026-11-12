import 'server-only';

import { geminiKey } from '@/lib/assistant/gemini';
import { createAdminClient } from '@/lib/supabase/admin';
import { agencyDayRange, agencyDateKey } from '@/lib/time';

import { estimateCost } from './core';

/**
 * Agents uchun AI: ikki bosqich, ikki narx.
 *   g'oyalar ("idea")  — ko'p variant, arzon: Gemini (AI Studio bepul tarifi) yoki Claude Haiku 5.5;
 *   yakuniy matn ("write") — sifat: Claude Sonnet 5.5 yoki (kalit bo'lmasa) Gemini.
 * AGENTS_AI = auto | anthropic | gemini. Modellarni AGENTS_IDEA_MODEL / AGENTS_WRITE_MODEL / AGENTS_GEMINI_MODEL bilan o'zgartirish mumkin.
 * Har chaqiruv agent_usage ga yoziladi (token, taxminiy narx); kunlik limitdan oshsa to'xtaydi.
 * Hech qanday kalit yo'q bo'lsa — AgentAiOffline: pipeline lokal (shablon) matnga o'tadi va buni ochiq belgilaydi.
 */

export class AgentAiOffline extends Error {
  constructor() {
    super('AI ulanmagan');
  }
}
export class AgentLimitError extends Error {}
export class AgentAiError extends Error {}

type Stage = 'idea' | 'write' | 'research';
export type Route = { provider: 'anthropic' | 'gemini'; model: string };

const anthropicKey = () => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
const mode = () => (process.env.AGENTS_AI ?? 'auto').trim().toLowerCase();

export function aiRoutes(): Record<Stage, Route | null> {
  const a = !!anthropicKey();
  const g = !!geminiKey();
  const gemini: Route = { provider: 'gemini', model: process.env.AGENTS_GEMINI_MODEL?.trim() || 'gemini-3.8-flash' };
  const haiku: Route = { provider: 'anthropic', model: process.env.AGENTS_IDEA_MODEL?.trim() || 'claude-haiku-5-5' };
  const sonnet: Route = { provider: 'anthropic', model: process.env.AGENTS_WRITE_MODEL?.trim() || 'claude-sonnet-5-5' };
  const m = mode();
  if (m === 'anthropic') return { idea: a ? haiku : null, write: a ? sonnet : null, research: a ? sonnet : null };
  if (m === 'gemini') return { idea: g ? gemini : null, write: g ? gemini : null, research: g ? gemini : null };
  return {
    idea: g ? gemini : a ? haiku : null,
    write: a ? sonnet : g ? gemini : null,
    research: a ? sonnet : g ? gemini : null,
  };
}

export async function usageToday(): Promise<number> {
  const { from, to } = agencyDayRange(agencyDateKey());
  const { count } = await createAdminClient().from('agent_usage').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to);
  return count ?? 0;
}

async function checkLimit() {
  const { data } = await createAdminClient().from('agent_settings').select('daily_ai_limit').eq('id', 1).maybeSingle();
  const limit = data?.daily_ai_limit ?? 150;
  if ((await usageToday()) >= limit) throw new AgentLimitError(`Kunlik AI chaqiruvlar limiti (${limit}) tugadi. Sozlamalarda oshirish mumkin.`);
}

async function record(profileId: string | null, purpose: string, route: Route, input: number, output: number, searches = 0) {
  await createAdminClient()
    .from('agent_usage')
    .insert({
      profile_id: profileId,
      purpose,
      provider: route.provider,
      model: route.model,
      input_tokens: input,
      output_tokens: output,
      web_searches: searches,
      cost_usd: route.provider === 'anthropic' ? estimateCost(route.model, input, output, searches) : null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** JSON ob'ekt (matn ichida kod bloki bo'lsa ham). */
function parseJson(text: string): unknown {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new AgentAiError('AI javobi JSON emas.');
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    throw new AgentAiError('AI javobi JSON emas.');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Claude (Messages API, server tomonida; loyihadagi boshqa chaqiruvlar kabi to'g'ridan-to'g'ri HTTP)
// ---------------------------------------------------------------------------------------------------------------
type ClaudeBlock = { type: string; text?: string; citations?: { url?: string; title?: string }[] | null; [k: string]: unknown };
type ClaudeResponse = {
  content: ClaudeBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } };
};

async function claude(route: Route, body: Record<string, unknown>, timeoutMs: number): Promise<ClaudeResponse> {
  const sonnetLine = /^claude-(sonnet|opus|fable)-5/.test(route.model);
  const send = async (withFallback: boolean) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        // Xavfsizlik filtri rad etsa, server o'zi mos modelga o'tadi (refusal fallback).
        ...(withFallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
      },
      body: JSON.stringify({ model: route.model, ...body, ...(withFallback ? { fallbacks: 'default' } : {}) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  let res: Response;
  try {
    res = await send(sonnetLine);
    if (res.status === 400 && sonnetLine) {
      const detail = await res.clone().text();
      if (/fallback/i.test(detail)) res = await send(false);
    }
  } catch {
    throw new AgentAiError('Claude bilan ulanib bo‘lmadi (tarmoq yoki vaqt tugadi).');
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error('[agents] Claude', res.status, detail);
    if (res.status === 401 || res.status === 403) throw new AgentAiError('Claude API kaliti noto‘g‘ri yoki ruxsat yo‘q.');
    if (res.status === 429) throw new AgentAiError('Claude limiti (429) — keyinroq qayta uriniladi.');
    if (res.status >= 500) throw new AgentAiError('Claude xizmati vaqtincha band — keyinroq qayta uriniladi.');
    throw new AgentAiError(`Claude so‘rovni qabul qilmadi (${res.status}).`);
  }
  const data = (await res.json()) as ClaudeResponse;
  if (data.stop_reason === 'refusal') throw new AgentAiError('Claude bu so‘rovni rad etdi (xavfsizlik filtri). Profil ma’lumotlarini tekshiring.');
  if (data.stop_reason === 'max_tokens') throw new AgentAiError('AI javobi uzilib qoldi — qayta urinib ko‘ring.');
  return data;
}

const claudeUsage = (d: ClaudeResponse) => ({
  input: (d.usage?.input_tokens ?? 0) + (d.usage?.cache_read_input_tokens ?? 0) + (d.usage?.cache_creation_input_tokens ?? 0),
  output: d.usage?.output_tokens ?? 0,
  searches: d.usage?.server_tool_use?.web_search_requests ?? 0,
});

// ---------------------------------------------------------------------------------------------------------------
// Gemini (generateContent, JSON javob)
// ---------------------------------------------------------------------------------------------------------------
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

async function gemini(route: Route, body: Record<string, unknown>, timeoutMs: number): Promise<GeminiResponse> {
  const models = [route.model, 'gemini-3.6-flash', 'gemini-3.8-flash-lite'].filter((m, i, all) => all.indexOf(m) === i);
  let last = '';
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AgentAiError('Gemini bilan ulanib bo‘lmadi (tarmoq yoki vaqt tugadi).');
    }
    if (res.ok) {
      route.model = model;
      return (await res.json()) as GeminiResponse;
    }
    last = `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
    // Model yo'q yoki bepul kvota tugagan — keyingisi.
    if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
    if (res.status === 400 || res.status === 403) break;
  }
  console.error('[agents] Gemini', last);
  if (/^429/.test(last)) throw new AgentAiError('Gemini bepul kvotasi hozircha tugagan — keyinroq qayta uriniladi.');
  if (/^(400|403)/.test(last) && /API key/i.test(last)) throw new AgentAiError('Gemini API kaliti noto‘g‘ri.');
  throw new AgentAiError('Gemini so‘rovni bajara olmadi.');
}

const geminiText = (d: GeminiResponse) => (d.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
const geminiUsage = (d: GeminiResponse) => ({ input: d.usageMetadata?.promptTokenCount ?? 0, output: (d.usageMetadata?.candidatesTokenCount ?? 0) + (d.usageMetadata?.thoughtsTokenCount ?? 0) });

// ---------------------------------------------------------------------------------------------------------------
// Ommaviy funksiyalar
// ---------------------------------------------------------------------------------------------------------------
export type JsonResult = { data: unknown; provider: string; model: string };

/** Tuzilgan JSON javob (Claude'da structured outputs, Gemini'da application/json). */
export async function agentJson(a: { stage: 'idea' | 'write'; profileId: string; purpose: string; system: string; user: string; schema: Record<string, unknown> }): Promise<JsonResult> {
  const route = aiRoutes()[a.stage];
  if (!route) throw new AgentAiOffline();
  await checkLimit();
  const r = { ...route };
  if (r.provider === 'anthropic') {
    const d = await claude(
      r,
      {
        max_tokens: a.stage === 'idea' ? 6000 : 12000,
        system: [{ type: 'text', text: a.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: a.user }],
        // G'oyada ko'proq "o'ylash" ijodkorlikni oshiradi, matnda — o'rtacha (narx/sifat muvozanati).
        output_config: { effort: a.stage === 'idea' ? 'low' : 'medium', format: { type: 'json_schema', schema: a.schema } },
      },
      110_000,
    );
    const u = claudeUsage(d);
    await record(a.profileId, a.purpose, r, u.input, u.output);
    const text = d.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    return { data: parseJson(text), provider: 'anthropic', model: r.model };
  }
  const d = await gemini(
    r,
    {
      systemInstruction: { parts: [{ text: a.system }] },
      contents: [{ role: 'user', parts: [{ text: `${a.user}\n\nJavob faqat shu JSON sxemaga mos ob’ekt bo‘lsin:\n${JSON.stringify(a.schema)}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: a.stage === 'idea' ? 1.15 : 0.9, maxOutputTokens: 8192 },
    },
    90_000,
  );
  const u = geminiUsage(d);
  await record(a.profileId, a.purpose, r, u.input, u.output);
  return { data: parseJson(geminiText(d)), provider: 'gemini', model: r.model };
}

export type Research = { text: string; sources: { url: string; title: string }[]; provider: string; model: string };

/** Soha kuzatuvi: internetdan qidirib, manbalari bilan qisqa xulosa (haftada bir marta). */
export async function agentResearch(a: { profileId: string; system: string; user: string }): Promise<Research> {
  const route = aiRoutes().research;
  if (!route) throw new AgentAiOffline();
  await checkLimit();
  const r = { ...route };
  if (r.provider === 'anthropic') {
    const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: a.user }];
    let d: ClaudeResponse | null = null;
    let input = 0;
    let output = 0;
    let searches = 0;
    // Server vositasi uzoq ishlasa "pause_turn" qaytaradi — javobni qaytarib davom ettiramiz (ko'pi bilan 3 marta).
    for (let i = 0; i < 3; i++) {
      d = await claude(
        r,
        {
          max_tokens: 6000,
          system: a.system,
          messages,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4, user_location: { type: 'approximate', country: 'UZ', city: 'Tashkent', timezone: 'Asia/Tashkent' } }],
          output_config: { effort: 'low' },
        },
        120_000,
      );
      const u = claudeUsage(d);
      input += u.input;
      output += u.output;
      searches += u.searches;
      if (d.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: d.content });
    }
    await record(a.profileId, 'research', r, input, output, searches);
    const texts = (d?.content ?? []).filter((b) => b.type === 'text');
    const sources = new Map<string, string>();
    for (const b of texts) for (const c of b.citations ?? []) if (c.url && /^https?:\/\//.test(c.url)) sources.set(c.url, c.title ?? c.url);
    return { text: texts.map((b) => b.text ?? '').join('').trim(), sources: [...sources].map(([url, title]) => ({ url, title })).slice(0, 12), provider: 'anthropic', model: r.model };
  }
  const d = await gemini(
    r,
    { systemInstruction: { parts: [{ text: a.system }] }, contents: [{ role: 'user', parts: [{ text: a.user }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.6 } },
    90_000,
  );
  const u = geminiUsage(d);
  await record(a.profileId, 'research', r, u.input, u.output);
  const sources = (d.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ url: c.web?.uri ?? '', title: c.web?.title ?? '' }))
    .filter((s) => /^https?:\/\//.test(s.url))
    .slice(0, 12);
  return { text: geminiText(d).trim(), sources, provider: 'gemini', model: r.model };
}
