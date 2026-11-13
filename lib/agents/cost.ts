/**
 * Where each frame's background comes from — the decision that sets most of a post's cost (pure, unit-tested).
 *
 * Measured in the live smoke test: one AI background (1024×1536, medium) = ~1 130 image output tokens ≈ $0.036, while
 * planning, copy and the AI review of a whole carousel cost ≈ $0.02. A 4-slide carousel with an AI picture per slide
 * was ≈ $0.17. Most Instagram graphics do not need a new picture for every slide, so:
 *
 *  - template  — a brand background drawn locally (brand colours, light, grain): no API call, $0.
 *  - reuse     — a softened, re-framed variant of this post's first AI picture: no API call, $0; keeps one look.
 *  - ai        — a new picture from the image model, only where a scene adds real value.
 *
 * Modes (per client, Brand DNA → Xarajat rejimi):
 *  - economy  — templates and the client's real photos; at most one AI picture per post, and only for a scene family,
 *               at preview quality.
 *  - balanced — (default) an AI picture only for scene families; a carousel gets one (slide 1), the middle slides
 *               reuse it and the CTA slide is a brand composition; typographic / price / minimal designs are templates.
 *  - premium  — a new AI picture for every frame with the premium model (the 1.0 behaviour), chosen on purpose.
 *
 * Original logos and product photos are always composited on top (never drawn by AI) in every mode.
 */

export type CostMode = 'economy' | 'balanced' | 'premium';
export const COST_MODES: CostMode[] = ['economy', 'balanced', 'premium'];
export const COST_MODE_LABEL: Record<CostMode, string> = { economy: 'Tejamkor', balanced: 'Muvozanatli', premium: 'Premium' };

/** Typography, price, minimal and info designs: a brand composition does the job better than a generated scene. */
export const TEMPLATE_FAMILIES = new Set(['editorial', 'promo_poster', 'minimal_luxury', 'infographic']);

export type BgSource = { kind: 'ai' } | { kind: 'reuse'; from: number; variant: number } | { kind: 'template'; variant: number };

export function renderPlan(a: { kind: 'story' | 'carousel'; frames: number; mode: CostMode; family: string; productFrames?: boolean[]; seed?: number }): BgSource[] {
  const n = Math.max(1, a.frames);
  const seed = Math.abs(Math.floor(a.seed ?? 0));
  const template = (i: number): BgSource => ({ kind: 'template', variant: (seed + i) % 4 });
  if (a.mode === 'premium') return Array.from({ length: n }, () => ({ kind: 'ai' }));
  const scene = !TEMPLATE_FAMILIES.has(a.family);
  const product = (i: number) => !!a.productFrames?.[i];
  // The one picture of the post: the first frame without a product photo (a product sits on a brand composition).
  const hero = scene ? [...Array(n).keys()].find((i) => !product(i)) : undefined;
  return Array.from({ length: n }, (_, i): BgSource => {
    if (hero === undefined || product(i)) return template(i);
    if (i === hero) return { kind: 'ai' };
    // Carousel: the closing CTA slide is a clean brand composition; the slides between reuse the hero picture.
    if (a.kind === 'carousel' && i === n - 1 && n > 2) return template(i);
    return { kind: 'reuse', from: hero, variant: i };
  });
}

/** How many paid pictures a plan needs. */
export const aiFrames = (plan: BgSource[]) => plan.filter((p) => p.kind === 'ai').length;

/** Quality per mode: preview quality for Economy, the configured quality otherwise (Premium keeps the client's). */
export function qualityFor(mode: CostMode, cfg: { quality: 'low' | 'medium' | 'high'; previewQuality: 'low' | 'medium' | 'high' }, clientQuality: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  return mode === 'economy' ? cfg.previewQuality : mode === 'premium' ? clientQuality : cfg.quality;
}

/**
 * Estimated cost of the pictures a job still has to make, from what this model really cost per picture recently (the
 * recorded usage), or null when nothing is known yet — never a made-up number.
 */
export function estimateImages(count: number, recentPerImage: number | null): number | null {
  if (!count) return 0;
  return recentPerImage === null ? null : Number((count * recentPerImage).toFixed(4));
}

// ---------------------------------------------------------------------------------------------------------------
// The month's cost report per client (pure): what was paid for, by which model, and what was made without the API.
// ---------------------------------------------------------------------------------------------------------------
export type UsageRow = { profile_id: string | null; item_id: string | null; kind: string; model: string; images: number; cost_usd: number | string | null; input_tokens: number; output_tokens: number };
export type FrameRow = { profile_id: string; change_kind: string; bg_models: string[] };
export type ClientCost = {
  profileId: string;
  images: number;
  edits: number;
  regenerations: number;
  requests: number;
  freeFrames: number;
  models: string[];
  imageCost: number | null;
  textCost: number | null;
  total: number | null;
  perImage: number | null;
  budget: number | null;
  remaining: number | null;
  imageLimit: number;
  warn: string | null;
};

const money = (v: number | string | null) => (v === null ? null : Number(v));
const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

export function costReport(usage: UsageRow[], versions: FrameRow[], profiles: { id: string; monthly_budget_usd: number | string | null; monthly_image_limit: number }[]) {
  const by = new Map<string, ClientCost>();
  const get = (id: string) => {
    let c = by.get(id);
    if (!c) {
      const p = profiles.find((x) => x.id === id);
      c = { profileId: id, images: 0, edits: 0, regenerations: 0, requests: 0, freeFrames: 0, models: [], imageCost: null, textCost: null, total: null, perImage: null, budget: p ? money(p.monthly_budget_usd) : null, remaining: null, imageLimit: p?.monthly_image_limit ?? 0, warn: null };
      by.set(id, c);
    }
    return c;
  };
  const items = new Map<string, { profileId: string; cost: number; images: number }>();
  for (const r of usage) {
    if (!r.profile_id) continue;
    const c = get(r.profile_id);
    const cost = money(r.cost_usd);
    if (r.kind === 'image' || r.kind === 'image_edit') {
      c.requests++;
      if (r.kind === 'image') c.images += r.images;
      else c.edits += r.images;
      if (!c.models.includes(r.model)) c.models.push(r.model);
      c.imageCost = add(c.imageCost, cost);
    } else c.textCost = add(c.textCost, cost);
    if (r.item_id) {
      const it = items.get(r.item_id) ?? { profileId: r.profile_id, cost: 0, images: 0 };
      it.cost += cost ?? 0;
      it.images += r.images;
      items.set(r.item_id, it);
    }
  }
  for (const v of versions) {
    const c = get(v.profile_id);
    if (v.change_kind === 'regenerate') c.regenerations++;
    // Free frames are counted where they were made (a new generation), not again in every layout edit.
    if (v.change_kind === 'generate' || v.change_kind === 'regenerate') c.freeFrames += v.bg_models.filter((m) => m === 'template' || m.startsWith('reuse')).length;
  }
  for (const c of by.values()) {
    c.total = c.imageCost === null && c.textCost === null ? null : (c.imageCost ?? 0) + (c.textCost ?? 0);
    const paid = c.images + c.edits;
    c.perImage = c.imageCost !== null && paid ? Number((c.imageCost / paid).toFixed(4)) : null;
    c.remaining = c.budget !== null && c.total !== null ? Number((c.budget - c.total).toFixed(4)) : null;
    c.warn =
      c.budget !== null && c.total !== null && c.total >= c.budget * 0.8
        ? c.total >= c.budget
          ? 'Oylik budjet tugadi'
          : 'Oylik budjetning 80% dan oshdi'
        : c.imageLimit && paid >= c.imageLimit * 0.8
          ? paid >= c.imageLimit
            ? 'Oylik rasm limiti tugadi'
            : 'Rasm limitining 80% dan oshdi'
          : null;
  }
  const top = [...items.entries()]
    .map(([itemId, v]) => ({ itemId, ...v }))
    .filter((x) => x.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);
  return { clients: [...by.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)), top };
}
