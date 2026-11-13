/**
 * OpenAI list prices, USD per 1M tokens, standard tier — copied from the official pricing page
 * (https://developers.openai.com/api/docs/pricing, read 2026-11-13). Used to turn the token counts OpenAI reports into
 * an estimated cost; a model that is not in this table and has no env override is recorded without a cost (never a
 * guessed one). Overrides, if OpenAI changes a price: OPENAI_PRICE_<MODEL>_IN / _CACHED / _OUT, with the model id in
 * upper case and every non-alphanumeric character as "_" (e.g. OPENAI_PRICE_GPT_6_LUNA_IN=0.1).
 *
 * Image models bill text input, image input and image output differently; on the page gpt-image-2, gpt-image-2.5-*
 * and gpt-image-2.6-* have the same per-token prices — switching between them does not by itself change the cost.
 */

export type TextPrice = { input: number; cached: number; output: number };
export type ImagePrice = { textInput: number; imageInput: number; output: number };

export const TEXT_PRICES: Record<string, TextPrice> = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
};

const IMAGE_LIST: ImagePrice = { textInput: 5, imageInput: 8, output: 30 };
export const IMAGE_PRICES: Record<string, ImagePrice> = {
  'gpt-image-2': IMAGE_LIST,
  'gpt-image-2.5-sunburst': IMAGE_LIST,
  'gpt-image-2.5-flare': IMAGE_LIST,
  'gpt-image-2.6-sunburst': IMAGE_LIST,
  'gpt-image-2.6-flare': IMAGE_LIST,
};

type Env = Record<string, string | undefined>;
const envKey = (model: string, part: string) => `OPENAI_PRICE_${model.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${part}`;
const num = (v: string | undefined) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

export function textPrice(model: string, env: Env = process.env): TextPrice | null {
  const base = TEXT_PRICES[model];
  const input = num(env[envKey(model, 'IN')]) ?? base?.input ?? null;
  const output = num(env[envKey(model, 'OUT')]) ?? base?.output ?? null;
  if (input === null || output === null) return null;
  return { input, output, cached: num(env[envKey(model, 'CACHED')]) ?? base?.cached ?? input };
}

/** Estimated USD of one text call (cached input billed at the cached rate; reasoning tokens are output tokens). */
export function textCost(model: string, u: { input: number; output: number; cached?: number }, env: Env = process.env): number | null {
  const p = textPrice(model, env);
  if (!p) return null;
  const cached = Math.min(Math.max(0, u.cached ?? 0), Math.max(0, u.input));
  return round((Math.max(0, u.input) - cached) * p.input + cached * p.cached + Math.max(0, u.output) * p.output);
}

/** Estimated USD of one image call, from the usage OpenAI returns (text / image input split when it is reported). */
export function imageCost(model: string, u: { input: number; output: number; textInput?: number | null; imageInput?: number | null }, env: Env = process.env): number | null {
  const base = IMAGE_PRICES[model];
  const textIn = num(env[envKey(model, 'TEXT_IN')]) ?? base?.textInput ?? null;
  const imageIn = num(env[envKey(model, 'IMAGE_IN')]) ?? base?.imageInput ?? null;
  const out = num(env[envKey(model, 'OUT')]) ?? base?.output ?? null;
  if (textIn === null || imageIn === null || out === null) return null;
  const imgIn = Math.max(0, u.imageInput ?? 0);
  const txtIn = u.textInput ?? Math.max(0, u.input - imgIn);
  return round(Math.max(0, txtIn) * textIn + imgIn * imageIn + Math.max(0, u.output) * out);
}

const round = (perMillion: number) => Number((perMillion / 1e6).toFixed(6));
