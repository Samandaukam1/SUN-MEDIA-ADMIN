/**
 * Natural-language edits (pure): an instruction → an edit plan. Three kinds, cheapest first:
 *   layout / text — the deterministic composer re-renders on the same AI background (no image credits);
 *   image_edit    — the image model edits the existing background (supplied as input) for the named slides;
 *   regenerate    — a new background (slide_regen for named slides) or a whole new concept (all slides).
 * The AI classifier proposes; `parseEditPlan` keeps only known operations and real slide numbers. Without AI the
 * keyword rules below decide. A request about one slide never touches the others.
 */
import { z } from 'zod';

import { DEFAULT_LAYOUT, type FrameLayout } from './core';

export type LayoutOp =
  | { op: 'move_text'; to: FrameLayout['textPos'] }
  | { op: 'scale'; target: 'headline' | 'logo' | 'product'; factor: number }
  | { op: 'brightness'; factor: number }
  | { op: 'move_logo'; to: FrameLayout['logoPos'] }
  | { op: 'move_contact'; to: FrameLayout['contactPos'] };

export type EditMode = 'layout' | 'text' | 'image_edit' | 'slide_regen' | 'regenerate';
export type EditPlan = {
  mode: EditMode;
  /** 0-based slide indexes the edit applies to (all slides when the instruction names none). */
  slides: number[];
  ops: LayoutOp[];
  /** What the text rewrite may change (text mode). */
  textTargets: ('headline' | 'body' | 'cta' | 'caption')[];
  /** For image edits / regeneration: the visual change in the admin's words. */
  visual: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "2-slayd", "ikkinchi slaydni", "3 va 4-slaydlar", "slide 2" → 0-based indexes within the carousel. */
export function slidesIn(text: string, count: number): number[] {
  const t = text.toLowerCase();
  const ordinals: Record<string, number> = { birinchi: 1, ikkinchi: 2, uchinchi: 3, 'to‘rtinchi': 4, "to'rtinchi": 4, tortinchi: 4, beshinchi: 5, oltinchi: 6, yettinchi: 7, sakkizinchi: 8, 'to‘qqizinchi': 9, oxirgi: count };
  const found = new Set<number>();
  for (const [w, n] of Object.entries(ordinals)) if (new RegExp(`${w}\\s+(slayd|slide|kadr|rasm)`).test(t)) found.add(n);
  for (const m of t.matchAll(/(\d{1,2})\s*(?:-|–)?\s*(?:chi\s+)?(?:slayd|slide|kadr|rasm)/g)) found.add(Number(m[1]));
  for (const m of t.matchAll(/(?:slayd|slide|kadr)\s*(?:№|#|raqam)?\s*(\d{1,2})/g)) found.add(Number(m[1]));
  const m2 = t.match(/(\d{1,2})\s*(?:va|,|hamda)\s*(\d{1,2})\s*-?\s*(?:slayd|kadr)/);
  if (m2) [m2[1], m2[2]].forEach((n) => found.add(Number(n)));
  return [...found].filter((n) => n >= 1 && n <= count).map((n) => n - 1).sort((a, b) => a - b);
}

/** Keyword rules (also the fallback when the AI is not reachable). */
export function classifyInstruction(text: string, count: number): EditPlan {
  const t = text.toLowerCase().replace(/[ʻʼ’`']/g, '‘');
  const slides = slidesIn(text, count);
  const all = slides.length ? slides : [...Array(count).keys()];
  const plan: EditPlan = { mode: 'layout', slides: all, ops: [], textTargets: [], visual: text.trim() };
  const bigger = /(kattalashtir|kattaroq|kattala|kattaroq qil|zoom|yaqinlashtir)/.test(t);
  const smaller = /(kichraytir|kichikroq|kichiklashtir|kichrayt)/.test(t);
  const factor = bigger ? 1.18 : smaller ? 0.82 : 1;

  if (/(qayta yarat|boshqatdan|yangi variant|butunlay boshqa|regenerat|yangisini)/.test(t)) {
    plan.mode = slides.length ? 'slide_regen' : 'regenerate';
    return plan;
  }
  if (/(olib tashla|o‘chir|yo‘q qil|almashtir|qo‘sh(?!imcha)|orqa fonni .*(o‘zgartir|almashtir)|premium|uslubda|kayfiyat|fasl|qor|kuz|bahor|yoz|odam|osmon)/.test(t) && !/(matn|sarlavha|yozuv|logo|telefon|raqam)/.test(t)) {
    plan.mode = 'image_edit';
    return plan;
  }
  if (/(ochroq|yorqinroq|yorug‘roq)/.test(t) && /(fon|orqa|rasm)/.test(t)) plan.ops.push({ op: 'brightness', factor: 1.18 });
  if (/(qorong‘iroq|to‘qroq|xiraroq)/.test(t) && /(fon|orqa|rasm)/.test(t)) plan.ops.push({ op: 'brightness', factor: 0.82 });
  if (/(logo|logotip)/.test(t)) {
    if (factor !== 1) plan.ops.push({ op: 'scale', target: 'logo', factor });
    if (/(o‘ng(ga)?).*(yuqori|tepa)|(yuqori|tepa).*(o‘ng)/.test(t)) plan.ops.push({ op: 'move_logo', to: 'top-right' });
    else if (/(markaz|o‘rta)/.test(t)) plan.ops.push({ op: 'move_logo', to: 'top-center' });
    else if (/(chap)/.test(t)) plan.ops.push({ op: 'move_logo', to: 'top-left' });
    else if (/(past)/.test(t)) plan.ops.push({ op: 'move_logo', to: 'bottom-right' });
  }
  if (/(mahsulot|tovar|qadoq|butilka|shisha|paket)/.test(t) && factor !== 1) plan.ops.push({ op: 'scale', target: 'product', factor });
  if (/(telefon|raqam|kontakt|aloqa)/.test(t)) {
    if (/(yashir|olib tashla|kerak emas|o‘chir)/.test(t)) plan.ops.push({ op: 'move_contact', to: 'hidden' });
    else if (/(tepa|yuqori)/.test(t)) plan.ops.push({ op: 'move_contact', to: 'top' });
    else plan.ops.push({ op: 'move_contact', to: 'bottom' });
  }
  if (/(matn|sarlavha|yozuv|tekst)/.test(t)) {
    if (/(tepa|yuqori)ga/.test(t) || /tepaga|yuqoriga/.test(t)) plan.ops.push({ op: 'move_text', to: 'top' });
    else if (/(o‘rta|markaz)/.test(t)) plan.ops.push({ op: 'move_text', to: 'middle' });
    else if (/(pastga|pastki)/.test(t)) plan.ops.push({ op: 'move_text', to: 'bottom' });
    if (factor !== 1 && /(sarlavha|matn|yozuv)/.test(t)) plan.ops.push({ op: 'scale', target: 'headline', factor });
  }
  // A wording change (not a move): rewrite the named texts on the same picture.
  if (/(qisqartir|qisqaroq|o‘zgartir|boshqacha yoz|yozib ber|tuzat|imlo|xato|so‘zni|cta|chaqiriq|caption|izoh)/.test(t) && !plan.ops.some((o) => o.op === 'move_text')) {
    plan.mode = 'text';
    plan.textTargets = /caption|izoh|post matni/.test(t) ? ['caption'] : /cta|chaqiriq|tugma/.test(t) ? ['cta'] : /sarlavha/.test(t) ? ['headline'] : ['headline', 'body', 'cta'];
    return plan;
  }
  if (!plan.ops.length) {
    // Nothing deterministic recognised: a visual change of the named (or all) slides.
    plan.mode = 'image_edit';
  }
  return plan;
}

/** Applies layout operations to a frame's layout, within sane bounds. */
export function applyOps(layout: Partial<FrameLayout> | undefined, ops: LayoutOp[]): FrameLayout {
  const out: FrameLayout = { ...DEFAULT_LAYOUT, ...(layout ?? {}) };
  for (const o of ops) {
    if (o.op === 'move_text') out.textPos = o.to;
    if (o.op === 'move_logo') out.logoPos = o.to;
    if (o.op === 'move_contact') out.contactPos = o.to;
    if (o.op === 'brightness') out.bgBrightness = clamp(Math.round(out.bgBrightness * o.factor * 100) / 100, 0.5, 1.6);
    if (o.op === 'scale') {
      const key = o.target === 'headline' ? 'headlineScale' : o.target === 'logo' ? 'logoScale' : 'productScale';
      out[key] = clamp(Math.round(out[key] * o.factor * 100) / 100, 0.5, 1.8);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// AI classification (structured) — validated before use.
// ---------------------------------------------------------------------------------------------------------------
export const EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'slides', 'ops', 'text_targets', 'visual'],
  properties: {
    mode: { type: 'string', enum: ['layout', 'text', 'image_edit', 'slide_regen', 'regenerate'] },
    slides: { type: 'array', items: { type: 'integer' }, maxItems: 10 },
    ops: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'target', 'to', 'factor'],
        properties: {
          op: { type: 'string', enum: ['move_text', 'scale', 'brightness', 'move_logo', 'move_contact'] },
          target: { type: ['string', 'null'], enum: ['headline', 'logo', 'product', null] },
          to: { type: ['string', 'null'], enum: ['top', 'middle', 'bottom', 'top-left', 'top-right', 'top-center', 'bottom-right', 'hidden', null] },
          factor: { type: ['number', 'null'] },
        },
      },
    },
    text_targets: { type: 'array', items: { type: 'string', enum: ['headline', 'body', 'cta', 'caption'] }, maxItems: 4 },
    visual: { type: 'string' },
  },
} as const;

const opSchema = z.object({ op: z.string(), target: z.string().nullable().optional(), to: z.string().nullable().optional(), factor: z.number().nullable().optional() });

/** The AI's plan, kept only where it is valid for this content (slide numbers are 1-based in the AI's answer). */
export function parseEditPlan(raw: unknown, count: number, fallback: EditPlan): EditPlan {
  const r = z
    .object({ mode: z.enum(['layout', 'text', 'image_edit', 'slide_regen', 'regenerate']), slides: z.array(z.number().int()), ops: z.array(opSchema), text_targets: z.array(z.string()), visual: z.string().max(1000) })
    .safeParse(raw);
  if (!r.success) return fallback;
  const slides = [...new Set(r.data.slides.map((n) => n - 1).filter((i) => i >= 0 && i < count))].sort((a, b) => a - b);
  const ops: LayoutOp[] = [];
  for (const o of r.data.ops) {
    if (o.op === 'move_text' && ['top', 'middle', 'bottom'].includes(o.to ?? '')) ops.push({ op: 'move_text', to: o.to as FrameLayout['textPos'] });
    if (o.op === 'move_logo' && ['top-left', 'top-right', 'top-center', 'bottom-right'].includes(o.to ?? '')) ops.push({ op: 'move_logo', to: o.to as FrameLayout['logoPos'] });
    if (o.op === 'move_contact' && ['top', 'bottom', 'hidden'].includes(o.to ?? '')) ops.push({ op: 'move_contact', to: o.to as FrameLayout['contactPos'] });
    if (o.op === 'brightness' && o.factor) ops.push({ op: 'brightness', factor: clamp(o.factor, 0.5, 1.6) });
    if (o.op === 'scale' && o.factor && ['headline', 'logo', 'product'].includes(o.target ?? '')) ops.push({ op: 'scale', target: o.target as 'headline' | 'logo' | 'product', factor: clamp(o.factor, 0.5, 1.8) });
  }
  const mode = r.data.mode;
  if ((mode === 'layout' && !ops.length) || (mode === 'slide_regen' && !slides.length && count > 1)) return fallback;
  const targets = r.data.text_targets.filter((x): x is EditPlan['textTargets'][number] => ['headline', 'body', 'cta', 'caption'].includes(x));
  return { mode, slides: slides.length ? slides : [...Array(count).keys()], ops, textTargets: mode === 'text' ? (targets.length ? targets : ['headline', 'body', 'cta']) : [], visual: r.data.visual || fallback.visual };
}
