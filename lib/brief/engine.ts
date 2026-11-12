/**
 * The deterministic question engine (pure; unit-tested). Given the bank, the classification and the answers so far it
 * picks the most valuable next question: earliest open stage first, then priority — skipping what does not apply
 * (industry, sub-industry, conditions), what is already known, and what would make the interview too long. It works
 * the same with or without the AI; AI suggestions enter only as validated extra questions under their own cap.
 */

import { BASE, CLARIFY } from './bank/base';
import { ALL_INDUSTRY } from './bank/industry';
import { MODULES, WEBSITE } from './bank/website';
import { industryOf } from './industries';
import { STAGES, type AnswerValue, type Answers, type Cond, type Option, type Question, type Stage } from './types';

/** How many questions a stage may take (clarifications are not counted; AI questions have their own cap). */
export const STAGE_BUDGET: Record<Stage, number> = { identity: 7, industry: 7, marketing: 6, website_gate: 1, website: 14, wrapup: 2 };
export const MAX_AI_QUESTIONS = 3;
/** A hard ceiling, whatever happens. */
export const MAX_QUESTIONS = 48;

export const CLARIFY_QUESTIONS = CLARIFY.map((c) => c.question);

export const builtinBank = (): Question[] => [...BASE, ...ALL_INDUSTRY, ...WEBSITE, ...CLARIFY_QUESTIONS];

/** Managers' edits and additions (newest version per key) over the built-in library; an inactive version hides it. */
export function mergeBank(builtin: Question[], edits: Question[]): Question[] {
  const latest = new Map<string, Question>();
  for (const e of edits) if (!latest.has(e.key) || latest.get(e.key)!.version < e.version) latest.set(e.key, e);
  const out = builtin.map((b) => {
    const e = latest.get(b.key);
    return e && e.version > b.version ? { ...e, source: 'bank' as const } : b;
  });
  for (const e of latest.values()) if (!builtin.some((b) => b.key === e.key)) out.push({ ...e, source: 'bank' });
  return out.filter((x) => x.active !== false);
}

export type EngineCtx = {
  bank: Question[];
  answers: Answers;
  /** Keys in the order they were answered (back navigation walks this). */
  order: string[];
  /** Classification from the client's own words when "Boshqa yo‘nalish" was chosen. */
  classified?: { industry: string; sub: string | null } | null;
  /** Validated AI questions for this session (asked at most once each). */
  ai?: Question[];
  /** Facts already known before the interview (e.g. the company name the manager typed). */
  known?: string[];
};

// ------------------------------------------------------------------------------------------------ answers

const choices = (v: AnswerValue | undefined) => v?.choice ?? [];
const isGiven = (v: AnswerValue | undefined) => !!v && !v.skipped;

/** The clarifications' resolutions applied over the answers as given (which stay untouched in storage). */
export function effectiveAnswers(bank: Question[], answers: Answers): Answers {
  const out: Answers = { ...answers };
  for (const q of bank) {
    if (q.source !== 'rule') continue;
    const chosen = choices(answers[q.key])[0];
    const opt = q.options?.find((o) => o.key === chosen);
    if (opt?.resolves) Object.assign(out, opt.resolves);
  }
  return out;
}

export function industryOfAnswers(answers: Answers, classified?: EngineCtx['classified']): { industry: string | null; sub: string | null } {
  const picked = choices(answers['id.industry'])[0] ?? null;
  if (!picked) return { industry: null, sub: null };
  if (picked === 'other') return classified ? { industry: classified.industry, sub: classified.sub } : { industry: 'other', sub: null };
  return { industry: picked, sub: choices(answers['id.sub'])[0] ?? null };
}

// ------------------------------------------------------------------------------------------------ conditions

export function evalCond(c: Cond | undefined, answers: Answers, industry: string | null, sub: string | null): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => evalCond(x, answers, industry, sub));
  if ('any' in c) return c.any.some((x) => evalCond(x, answers, industry, sub));
  if ('not' in c) return !evalCond(c.not, answers, industry, sub);
  if ('industry' in c) return !!industry && c.industry.includes(industry);
  if ('sub' in c) return !!sub && c.sub.includes(sub);
  const v = answers[c.q];
  if (c.answered !== undefined) return isGiven(v) === c.answered;
  if (!isGiven(v)) return false;
  if (c.unknown) return !!v.unknown;
  if (c.none) return !!v.none;
  if (c.in) return choices(v).some((k) => c.in!.includes(k));
  const n = typeof v.number === 'number' ? v.number : choices(v).length;
  if (c.gte !== undefined && !(n >= c.gte)) return false;
  if (c.lte !== undefined && !(n <= c.lte)) return false;
  return true;
}

// ------------------------------------------------------------------------------------------------ options

const OTHER_KEY = 'other';

/** The options this client sees for a question (dynamic lists resolved, industry-specific options filtered). */
export function optionsFor(q: Question, bank: Question[], answers: Answers, industry: string | null): Option[] {
  let list: Option[];
  if (q.optionsSource === 'subIndustries') list = (industryOf(industry)?.subs ?? []).filter((s) => s.key !== 'other').map((s) => ({ key: s.key, label: s.label }));
  else if (q.optionsFrom) {
    const source = q.optionsFrom === '@modules' ? MODULES.find((m) => isGiven(answers[m.key])) : bank.find((b) => b.key === q.optionsFrom);
    if (!source) return [];
    const from = optionsFor(source, bank, answers, industry);
    const chosen = choices(answers[source.key]);
    list = from.filter((o) => chosen.includes(o.key)).map(({ key, label, req }) => ({ key, label, req }));
    const other = answers[source.key]?.other;
    if (other && chosen.includes(OTHER_KEY)) list.push({ key: OTHER_KEY, label: other });
  } else list = q.options ?? [];
  return list.filter((o) => !o.industries || (!!industry && o.industries.includes(industry)));
}

/** Labels of an answer, as the manager reads them. */
export function answerLabels(q: Pick<Question, 'type' | 'unit'>, options: Option[], v: AnswerValue | undefined): string[] {
  if (!v) return [];
  if (v.skipped) return ['Javob berilmadi'];
  if (v.unknown) return ['Bilmayman'];
  if (v.none) return ['Hozircha mavjud emas'];
  if (v.text !== undefined) return [v.text];
  if (v.number !== undefined) return [`${v.number}${q.unit ? ` ${q.unit}` : ''}`];
  const out = choices(v).map((k) => (k === OTHER_KEY ? `Boshqa: ${v.other ?? ''}` : (options.find((o) => o.key === k)?.label ?? k)));
  return v.note ? [...out, `Izoh: ${v.note}`] : out;
}

/** "{{a|b}}" → the first answered key's chosen label(s), so a question can refer to what was said. */
export function interpolate(text: string, bank: Question[], answers: Answers, industry: string | null): string {
  return text.replace(/\{\{([\w.|]+)\}\}/g, (_, keys: string) => {
    for (const key of keys.split('|')) {
      const q = bank.find((b) => b.key === key);
      if (q && isGiven(answers[key])) return answerLabels(q, optionsFor(q, bank, answers, industry), answers[key]).join(', ').toLowerCase();
    }
    return 'bir nechta';
  });
}

// ------------------------------------------------------------------------------------------------ selection

export type Next =
  | { done: false; question: Question; options: Option[]; text: string; stage: Stage; progress: Progress }
  | { done: true; progress: Progress };
export type Progress = { answered: number; estimate: number; stage: Stage; stageIndex: number };

const stageIndex = (s: Stage) => STAGES.indexOf(s);

type Candidate = { q: Question; options: Option[] };

function candidates(ctx: EngineCtx): { list: Candidate[]; industry: string | null; eff: Answers } {
  const eff = effectiveAnswers(ctx.bank, ctx.answers);
  const { industry, sub } = industryOfAnswers(ctx.answers, ctx.classified);
  const known = new Set(ctx.known ?? []);
  for (const key of Object.keys(ctx.answers)) {
    const q = ctx.bank.find((b) => b.key === key) ?? ctx.ai?.find((b) => b.key === key);
    if (q && isGiven(ctx.answers[key])) for (const f of q.uncovers) known.add(f);
  }
  const triggered = new Set(CLARIFY.filter((c) => evalCond(c.trigger, ctx.answers, industry, sub)).map((c) => c.question.key));

  const list: Candidate[] = [];
  for (const q of [...ctx.bank, ...(ctx.ai ?? [])]) {
    if (q.active === false || ctx.answers[q.key]) continue;
    if (q.source === 'rule') {
      if (!triggered.has(q.key)) continue;
    } else {
      if ((q.stage === 'industry' || q.stage === 'website') && !industry) continue;
      if (!q.industries.includes('*') && (!industry || !q.industries.includes(industry))) continue;
      if (q.subs && (!sub || !q.subs.includes(sub))) continue;
      if (!evalCond(q.when, eff, industry, sub)) continue;
      if (q.skipIf && evalCond(q.skipIf, eff, industry, sub)) continue;
      if (q.uncovers.length && q.uncovers.every((f) => known.has(f))) continue;
      // A module question belongs to its family only.
      if (q.key.startsWith('ws.modules.') && !q.industries.includes(industry ?? '')) continue;
    }
    const needsOptions = q.type === 'single' || q.type === 'multi' || q.type === 'rank' || q.type === 'yesno';
    const options = needsOptions ? optionsFor(q, ctx.bank, eff, industry) : [];
    if (needsOptions && options.length === 0) continue;
    list.push({ q, options });
  }
  return { list, industry, eff };
}

function asked(ctx: EngineCtx, pred: (q: Question) => boolean): number {
  return ctx.order.filter((k) => {
    const q = ctx.bank.find((b) => b.key === k) ?? ctx.ai?.find((b) => b.key === k);
    return q && pred(q);
  }).length;
}

export function nextQuestion(ctx: EngineCtx): Next {
  const { list, industry, eff } = candidates(ctx);
  const answered = ctx.order.length;
  const aiAsked = asked(ctx, (q) => q.source === 'ai');
  const usedIn = (s: Stage) => asked(ctx, (q) => q.stage === s && q.source !== 'rule' && q.source !== 'ai');

  const open = list.filter(({ q }) => {
    if (q.source === 'rule') return true;
    if (q.source === 'ai') return aiAsked < MAX_AI_QUESTIONS;
    return usedIn(q.stage) < STAGE_BUDGET[q.stage];
  });
  const progressAt = (stage: Stage): Progress => {
    let remaining = 0;
    for (const s of STAGES.slice(stageIndex(stage))) remaining += Math.min(STAGE_BUDGET[s] - Math.min(usedIn(s), STAGE_BUDGET[s]), open.filter((c) => c.q.stage === s).length);
    return { answered, estimate: answered + remaining, stage, stageIndex: stageIndex(stage) };
  };
  if (!open.length || answered >= MAX_QUESTIONS) return { done: true, progress: { answered, estimate: answered, stage: 'wrapup', stageIndex: STAGES.length - 1 } };

  // Clarifications first (a contradiction must be settled before building on it), then the earliest stage.
  const rank = (c: Candidate) => [c.q.source === 'rule' ? 0 : 1, stageIndex(c.q.stage), -c.q.priority] as const;
  const sorted = [...open].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const pick = sorted[0];
  return {
    done: false,
    question: pick.q,
    options: pick.options,
    text: interpolate(pick.q.text, ctx.bank, eff, industry),
    stage: pick.q.stage,
    progress: progressAt(pick.q.stage),
  };
}

/** The question the client sees again when going back from `current` (the previous answered one). */
export function previousKey(order: string[], current: string | null): string | null {
  if (!order.length) return null;
  if (!current) return order[order.length - 1];
  const i = order.indexOf(current);
  return i > 0 ? order[i - 1] : i === -1 ? order[order.length - 1] : null;
}

/**
 * Answers that no longer apply after an earlier answer changed (e.g. the industry): dropped from the active set so
 * the flow re-adapts. They are returned so the caller can keep them in the audit trail, never silently lost.
 */
export function prune(ctx: EngineCtx): { answers: Answers; order: string[]; dropped: string[] } {
  const answers: Answers = {};
  const order: string[] = [];
  const dropped: string[] = [];
  for (const key of ctx.order) {
    const view = nextQuestionAllowing({ ...ctx, answers, order }, key, ctx.answers[key]);
    if (view) {
      answers[key] = ctx.answers[key];
      order.push(key);
    } else dropped.push(key);
  }
  return { answers, order, dropped };
}

/**
 * Would `key` be a valid question to have asked given only the answers before it — and does its stored answer still
 * fit the options it would have now (e.g. a sub-industry of the previous industry)? (No budget check.)
 */
function nextQuestionAllowing(ctx: EngineCtx, key: string, value: AnswerValue): boolean {
  const { list } = candidates(ctx);
  const c = list.find((x) => x.q.key === key);
  if (!c) return false;
  if (value.unknown || value.none || value.skipped || !value.choice) return true;
  return validateAnswer(c.q, c.options, value).ok;
}

// ------------------------------------------------------------------------------------------------ validation

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export const cleanText = (s: unknown, max: number) =>
  typeof s === 'string'
    ? s
        .replace(CONTROL, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

export type Validation = { ok: true; value: AnswerValue } | { ok: false; error: string };

/** Server-side check of one answer against the question as shown (options included). Never trusts the browser. */
export function validateAnswer(q: Question, options: Option[], raw: unknown): Validation {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const note = cleanText(v.note, 500) || undefined;
  if (v.unknown === true) return q.allowUnknown ? { ok: true, value: { unknown: true, ...(note ? { note } : {}) } } : { ok: false, error: 'Bu savolga javob tanlang.' };
  if (v.none === true) return q.allowNone ? { ok: true, value: { none: true } } : { ok: false, error: 'Bu savolga javob tanlang.' };
  if (v.skipped === true) return q.required ? { ok: false, error: 'Bu savol muhim — javob tanlang yoki “Bilmayman”ni bosing.' } : { ok: true, value: { skipped: true } };

  if (q.type === 'text') {
    const text = cleanText(v.text, q.max ?? 500);
    if (text.length < 2) return { ok: false, error: 'Qisqacha yozing (kamida 2 belgi).' };
    return { ok: true, value: { text } };
  }
  if (q.type === 'number') {
    const n = typeof v.number === 'number' ? v.number : Number(String(v.number ?? '').replace(/[\s,]/g, ''));
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Butun son kiriting.' };
    if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) return { ok: false, error: `Son ${q.min ?? 0}–${q.max ?? '∞'} oralig‘ida bo‘lsin.` };
    return { ok: true, value: { number: n } };
  }

  const raw_choice = Array.isArray(v.choice) ? v.choice.filter((x): x is string => typeof x === 'string') : [];
  const choice = [...new Set(raw_choice)];
  const keys = new Set(options.map((o) => o.key));
  const other = cleanText(v.other, 300);
  for (const k of choice) {
    if (k === OTHER_KEY && q.allowOther && !keys.has(OTHER_KEY)) continue;
    if (!keys.has(k)) return { ok: false, error: 'Tanlangan javob ro‘yxatda yo‘q. Sahifani yangilang.' };
  }
  if (choice.includes(OTHER_KEY) && !keys.has(OTHER_KEY) && other.length < 2) return { ok: false, error: '“Boshqa” uchun qisqacha yozing.' };
  if (!choice.length) return { ok: false, error: q.type === 'multi' || q.type === 'rank' ? 'Kamida bittasini tanlang.' : 'Bittasini tanlang.' };
  if ((q.type === 'single' || q.type === 'yesno') && choice.length !== 1) return { ok: false, error: 'Faqat bittasini tanlang.' };
  const max = q.max ?? options.length + 1;
  if (choice.length > max) return { ok: false, error: `Ko‘pi bilan ${max} ta tanlang.` };
  const exclusive = options.filter((o) => o.exclusive).map((o) => o.key);
  if (choice.length > 1 && choice.some((k) => exclusive.includes(k))) return { ok: false, error: 'Bu javobni boshqalari bilan birga tanlab bo‘lmaydi.' };
  const value: AnswerValue = { choice };
  if (choice.includes(OTHER_KEY) && !keys.has(OTHER_KEY)) value.other = other;
  if (note) value.note = note;
  return { ok: true, value };
}

export { OTHER_KEY };
