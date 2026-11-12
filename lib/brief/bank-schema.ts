/**
 * The shape a manager's question edit must have (pure; shared by the editor's server action and the bank loader, which
 * re-checks every stored version — a malformed row is ignored, never shown to a client).
 */

import { z } from 'zod';

import { INDUSTRIES } from './industries';
import { STAGES, type Cond, type Question } from './types';

const key = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,3}$/, 'Kalit: kichik lotin harflari, nuqta bilan (masalan, cl.new_question)').max(80);
const label = z.string().trim().min(1).max(120);

const cond: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(cond).max(8) }),
    z.object({ any: z.array(cond).max(8) }),
    z.object({ not: cond }),
    z.object({ industry: z.array(z.string().max(40)).max(16) }),
    z.object({ sub: z.array(z.string().max(40)).max(16) }),
    z.object({
      q: key,
      in: z.array(z.string().max(60)).max(20).optional(),
      answered: z.boolean().optional(),
      unknown: z.boolean().optional(),
      none: z.boolean().optional(),
      gte: z.number().optional(),
      lte: z.number().optional(),
    }),
  ]),
);

const option = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label,
  hint: z.string().trim().max(160).optional(),
  exclusive: z.boolean().optional(),
  industries: z.array(z.string().max(40)).max(16).optional(),
  req: z.object({ id: z.string().regex(/^[a-z0-9_]{1,60}$/), title: z.string().trim().min(2).max(160), level: z.enum(['must', 'should', 'nice']).optional() }).optional(),
});

const industryKeys = new Set(['*', ...INDUSTRIES.map((i) => i.key)]);

export const questionSchema = z
  .object({
    key,
    version: z.number().int().min(1).max(10000),
    stage: z.enum(STAGES as [string, ...string[]]),
    industries: z.array(z.string()).min(1).max(16).refine((a) => a.every((x) => industryKeys.has(x)), 'Noma’lum soha'),
    subs: z.array(z.string().max(40)).max(16).optional(),
    category: z.string().trim().min(1).max(60),
    text: z.string().trim().min(8).max(240),
    description: z.string().trim().max(300).optional(),
    type: z.enum(['single', 'multi', 'yesno', 'range', 'rank', 'text', 'number']),
    options: z.array(option).max(20).optional(),
    optionsFrom: z.string().max(80).optional(),
    optionsSource: z.literal('subIndustries').optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().max(20).optional(),
    allowOther: z.boolean().optional(),
    allowUnknown: z.boolean().optional(),
    allowNone: z.boolean().optional(),
    required: z.boolean(),
    priority: z.number().int().min(1).max(100),
    purpose: z.string().trim().min(4).max(300),
    uncovers: z.array(z.string().max(60)).max(6),
    when: cond.optional(),
    skipIf: cond.optional(),
    aiAdaptable: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.key.startsWith('clarify.') || q.key.startsWith('ai.')) ctx.addIssue({ code: 'custom', message: 'Aniqlashtirish va AI savollari tahrirlanmaydi.', path: ['key'] });
    const choice = q.type === 'single' || q.type === 'multi' || q.type === 'rank';
    if (choice && !q.optionsFrom && !q.optionsSource && (q.options?.length ?? 0) < 2) ctx.addIssue({ code: 'custom', message: 'Kamida 2 ta variant kerak.', path: ['options'] });
    const keys = (q.options ?? []).map((o) => o.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Variant kalitlari takrorlanmasin.', path: ['options'] });
  });

/** A stored definition → a question, or null when it does not pass. */
export function parseStoredQuestion(definition: unknown, version: number, active: boolean): Question | null {
  const r = questionSchema.safeParse({ ...(definition as object), version, active });
  return r.success ? ({ ...(r.data as unknown as Question), source: 'bank' } satisfies Question) : null;
}
