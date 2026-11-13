import 'server-only';

import { imageCost } from '@/lib/openai-prices';

/**
 * OpenAI Images API (server only): POST /v1/images/generations and /v1/images/edits with the documented parameters
 * (model, prompt, size, quality, output_format, background, moderation, n; edits: images[], mask). GPT image models
 * always return base64. Models come from OPENAI_IMAGE_MODEL (premium) and OPENAI_IMAGE_EDIT_MODEL (fast / edits).
 * One retry on a passing failure; a moderation refusal or a bad request is never retried. Nothing is simulated: a
 * failure is returned as a failure.
 */

export type ImageQuality = 'low' | 'medium' | 'high';
export type ImageUsage = { input: number; output: number; costUsd: number | null };
export type ImageResult =
  | { ok: true; png: Buffer; model: string; usage: ImageUsage; size: string }
  | { ok: false; kind: 'config' | 'model' | 'moderation' | 'rate' | 'timeout' | 'server' | 'bad_request'; message: string };

const ENDPOINT = 'https://api.openai.com/v1/images';

export function imageConfig() {
  const price = (n: string) => {
    const v = Number(process.env[n]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const q = (v: string | undefined, d: ImageQuality): ImageQuality => (v === 'low' || v === 'medium' || v === 'high' ? v : d);
  return {
    key: process.env.OPENAI_API_KEY?.trim() || null,
    // Chosen on purpose (Premium mode); the everyday model for Balanced / Economy. If the economic model is not open to
    // the key, the premium one answers (and the panel shows it).
    premium: process.env.CONTENT_PREMIUM_IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.6-sunburst',
    economy: process.env.CONTENT_IMAGE_MODEL?.trim() || 'gpt-image-2',
    fast: process.env.OPENAI_IMAGE_EDIT_MODEL?.trim() || 'gpt-image-2.6-flare',
    quality: q(process.env.CONTENT_IMAGE_QUALITY?.trim(), 'medium'),
    previewQuality: q(process.env.CONTENT_PREVIEW_QUALITY?.trim(), 'low'),
    // Standard portrait size every GPT image model accepts; the composer crops it to the exact 9:16 / 4:5 canvas.
    size: process.env.OPENAI_IMAGE_SIZE?.trim() || '1024x1536',
    // USD per 1M image tokens, if the owner set them (cost is recorded only when known).
    priceIn: price('OPENAI_IMAGE_PRICE_INPUT_PER_1M'),
    priceOut: price('OPENAI_IMAGE_PRICE_OUTPUT_PER_1M'),
  };
}

export const imagesReady = () => !!imageConfig().key;

/** Tokens as OpenAI reported them; cost from OpenAI's list prices (lib/openai-prices.ts) or the owner's override. */
export function usageOf(body: Record<string, unknown>, model: string): ImageUsage {
  const u = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
  const input = Number.isFinite(u.input_tokens) ? Number(u.input_tokens) : 0;
  const output = Number.isFinite(u.output_tokens) ? Number(u.output_tokens) : 0;
  const { priceIn, priceOut } = imageConfig();
  if (priceIn !== null && priceOut !== null) return { input, output, costUsd: Number(((input * priceIn + output * priceOut) / 1e6).toFixed(6)) };
  const d = u.input_tokens_details ?? {};
  return { input, output, costUsd: imageCost(model, { input, output, textInput: Number.isFinite(d.text_tokens) ? Number(d.text_tokens) : null, imageInput: Number.isFinite(d.image_tokens) ? Number(d.image_tokens) : null }) };
}

type Fetch = typeof fetch;

async function call(
  path: 'generations' | 'edits',
  build: (multipart: boolean) => { body: BodyInit; headers: Record<string, string> },
  model: string,
  size: string,
  { fetchImpl = fetch, timeoutMs = 150_000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) }: { fetchImpl?: Fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<ImageResult> {
  const { key } = imageConfig();
  if (!key) return { ok: false, kind: 'config', message: 'OPENAI_API_KEY o‘rnatilmagan.' };
  const started = Date.now();
  let multipart = false;
  let last: ImageResult = { ok: false, kind: 'server', message: 'Rasm yaratilmadi.' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const left = timeoutMs - (Date.now() - started);
    if (left < 5000) break;
    const { body, headers } = build(multipart);
    let res: Response;
    try {
      res = await fetchImpl(`${ENDPOINT}/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, ...headers }, body, signal: AbortSignal.timeout(left), cache: 'no-store' });
    } catch (e) {
      const timeout = (e as { name?: string })?.name === 'TimeoutError' || (e as { name?: string })?.name === 'AbortError';
      last = { ok: false, kind: timeout ? 'timeout' : 'server', message: timeout ? 'Rasm yaratish vaqti tugadi.' : 'OpenAI bilan aloqa yo‘q.' };
      if (attempt === 0) {
        await sleep(1500);
        continue;
      }
      return last;
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (!res.ok) {
      const err = (json.error ?? {}) as { code?: string; message?: string; type?: string };
      const msg = String(err.message ?? '').slice(0, 300);
      if (res.status === 404 || err.code === 'model_not_found') return { ok: false, kind: 'model', message: `“${model}” modeli akkauntda mavjud emas.` };
      if (res.status === 401 || res.status === 403) return { ok: false, kind: 'config', message: 'OpenAI kaliti noto‘g‘ri yoki bu modelga ruxsat yo‘q.' };
      if (err.code === 'moderation_blocked' || /safety|moderation/i.test(msg)) return { ok: false, kind: 'moderation', message: 'OpenAI xavfsizlik filtri so‘rovni rad etdi — ko‘rsatmani o‘zgartiring.' };
      if (res.status === 400) {
        // The edit endpoint documents a JSON body; some deployments still expect files — try the multipart form once.
        if (path === 'edits' && !multipart && /image|url|multipart|file/i.test(msg)) {
          multipart = true;
          continue;
        }
        return { ok: false, kind: 'bad_request', message: `OpenAI so‘rovni qabul qilmadi: ${msg || res.status}` };
      }
      last = { ok: false, kind: res.status === 429 ? 'rate' : 'server', message: res.status === 429 ? 'OpenAI limiti — birozdan so‘ng.' : `OpenAI xizmatida nosozlik (${res.status}).` };
      if (attempt === 0) {
        await sleep(res.status === 429 ? 4000 : 1500);
        continue;
      }
      return last;
    }
    const b64 = ((json.data as { b64_json?: string }[] | undefined) ?? [])[0]?.b64_json;
    if (!b64) return { ok: false, kind: 'server', message: 'OpenAI rasm qaytarmadi.' };
    return { ok: true, png: Buffer.from(b64, 'base64'), model, usage: usageOf(json, model), size: String(json.size ?? size) };
  }
  return last;
}

export async function generateImage(
  a: { prompt: string; tier: 'premium' | 'fast' | 'economy'; quality: ImageQuality; model?: string },
  opts?: { fetchImpl?: Fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<unknown> },
): Promise<ImageResult> {
  const cfg = imageConfig();
  const model = a.model || (a.tier === 'fast' ? cfg.fast : a.tier === 'economy' ? cfg.economy : cfg.premium);
  const send = (m: string) => {
    const payload = { model: m, prompt: a.prompt.slice(0, 32_000), n: 1, size: cfg.size, quality: a.quality, output_format: 'png', background: 'opaque', moderation: 'auto' };
    return call('generations', () => ({ body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } }), m, cfg.size, opts);
  };
  const r = await send(model);
  // The economic model not open to this key: the premium model draws instead (no image was billed for the refusal).
  if (!r.ok && r.kind === 'model' && a.tier === 'economy' && !a.model && cfg.premium !== model) return send(cfg.premium);
  return r;
}

/** Edits an existing picture (the first image); further images are references. An optional mask limits the area. */
export function editImage(
  a: { prompt: string; images: Buffer[]; mask?: Buffer | null; quality: ImageQuality; model?: string },
  opts?: { fetchImpl?: Fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<unknown> },
): Promise<ImageResult> {
  const cfg = imageConfig();
  const model = a.model || cfg.fast;
  const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
  return call(
    'edits',
    (multipart) => {
      if (!multipart) {
        const payload = {
          model,
          prompt: a.prompt.slice(0, 32_000),
          images: a.images.slice(0, 16).map((b) => ({ image_url: dataUrl(b) })),
          ...(a.mask ? { mask: { image_url: dataUrl(a.mask) } } : {}),
          n: 1,
          size: cfg.size,
          quality: a.quality,
          output_format: 'png',
        };
        return { body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } as Record<string, string> };
      }
      const form = new FormData();
      form.set('model', model);
      form.set('prompt', a.prompt.slice(0, 32_000));
      form.set('n', '1');
      form.set('size', cfg.size);
      form.set('quality', a.quality);
      form.set('output_format', 'png');
      a.images.slice(0, 16).forEach((b, i) => form.append('image[]', new Blob([new Uint8Array(b)], { type: 'image/png' }), `image-${i}.png`));
      if (a.mask) form.set('mask', new Blob([new Uint8Array(a.mask)], { type: 'image/png' }), 'mask.png');
      return { body: form, headers: {} as Record<string, string> };
    },
    model,
    cfg.size,
    opts,
  );
}
