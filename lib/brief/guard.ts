/**
 * Guards for everything the AI returns (pure; unit-tested). Its output is untrusted data: a suggested question is
 * accepted only if it is well-formed Uzbek (Latin), relevant, not a duplicate, not sensitive, with real options and
 * within the limits; an analysis keeps a claim "confirmed" only when it cites answers that exist, and loses hype.
 */

import { INDUSTRIES } from './industries';
import type { Option, Question, Stage } from './types';

export const DECISION_ACTIONS = ['ASK', 'SKIP', 'CLARIFY', 'CONTINUE', 'COMPLETE'] as const;
export type Decision = {
  action: (typeof DECISION_ACTIONS)[number];
  question_id: string | null;
  suggested_question: string | null;
  answer_type: 'single' | 'multi' | 'yesno' | 'text' | null;
  selectable_options: string[];
  business_purpose: string;
  relevant_prior_answer_ids: string[];
  reasoning_summary: string;
  confidence: number;
  missing_information_category: string | null;
  target_stage: 'identity' | 'industry' | 'marketing' | 'website' | null;
};

const str = { type: 'string' } as const;
const nstr = { type: ['string', 'null'] } as const;
export const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action',
    'question_id',
    'suggested_question',
    'answer_type',
    'selectable_options',
    'business_purpose',
    'relevant_prior_answer_ids',
    'reasoning_summary',
    'confidence',
    'missing_information_category',
    'target_stage',
  ],
  properties: {
    action: { type: 'string', enum: [...DECISION_ACTIONS] },
    question_id: nstr,
    suggested_question: nstr,
    answer_type: { type: ['string', 'null'], enum: ['single', 'multi', 'yesno', 'text', null] },
    selectable_options: { type: 'array', items: str, maxItems: 8 },
    business_purpose: str,
    relevant_prior_answer_ids: { type: 'array', items: str, maxItems: 8 },
    reasoning_summary: str,
    confidence: { type: 'number' },
    missing_information_category: nstr,
    target_stage: { type: ['string', 'null'], enum: ['identity', 'industry', 'marketing', 'website', null] },
  },
} as const;

export const DECISIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions'],
  properties: { decisions: { type: 'array', items: DECISION_SCHEMA, maxItems: 2 } },
} as const;

export function parseDecision(x: unknown): Decision | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  if (!DECISION_ACTIONS.includes(d.action as Decision['action'])) return null;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string').map((i) => i.trim().slice(0, 120)).slice(0, max) : []);
  const type = ['single', 'multi', 'yesno', 'text'].includes(d.answer_type as string) ? (d.answer_type as Decision['answer_type']) : null;
  const stage = ['identity', 'industry', 'marketing', 'website'].includes(d.target_stage as string) ? (d.target_stage as Decision['target_stage']) : null;
  const confidence = typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? Math.max(0, Math.min(1, d.confidence)) : 0;
  return {
    action: d.action as Decision['action'],
    question_id: s(d.question_id, 80),
    suggested_question: s(d.suggested_question, 300),
    answer_type: type,
    selectable_options: arr(d.selectable_options, 8),
    business_purpose: s(d.business_purpose, 300) ?? '',
    relevant_prior_answer_ids: arr(d.relevant_prior_answer_ids, 8),
    reasoning_summary: s(d.reasoning_summary, 400) ?? '',
    confidence,
    missing_information_category: s(d.missing_information_category, 60),
    target_stage: stage,
  };
}

// ------------------------------------------------------------------------------------------------ question checks

/**
 * Topics never asked in a marketing interview: health details, identity documents, payment secrets, beliefs, private
 * life. Patterns are Uzbek (Latin and Cyrillic stems) and English.
 */
const SENSITIVE = [
  /tashxis|diagnoz|kasallig|kasallik|bemor(ning|lar(ning)?)\s+(ism|familiya|telefon|ma.?lumot)|tibbiy\s+(karta|tarix|yozuv)|retsept|homilador|ruhiy\s+salomat/i,
  /pasport|jshshir|pinfl|inn\s+raqam|shaxsiy\s+raqam|tug.?ilgan\s+sana/i,
  /karta\s+raqam|cvv|parol|pin\s?kod|sms\s?kod|login\s+va\s+parol|bank\s+hisob\s+raqam/i,
  /din(ingiz|iy\s+e.?tiqod)|e.?tiqod|millat(ingiz)?|siyosiy|jinsiy|oilaviy\s+holat|nikoh/i,
  /diagnos|medical record|passport|password|credit card|religion|ethnicity|sexual|political/i,
  /диагноз|паспорт|пароль|религи/i,
];
export const isSensitive = (s: string) => SENSITIVE.some((re) => re.test(s));

const CYRILLIC = /[Ѐ-ӿ]/;
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ’`'‘]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** Token overlap of two texts (Jaccard), for duplicate detection. */
export function similarity(a: string, b: string): number {
  const x = new Set(words(a));
  const y = new Set(words(b));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

export type AiQuestionCheck = { ok: true; question: Question } | { ok: false; reason: string };

/**
 * A validated AI question (or why not). `existing` are the texts already asked or still coming; `answeredKeys` are
 * the answers the AI may refer to; `websiteOpen` lets it ask in the website stage only when that stage is open.
 */
export function checkAiQuestion(
  d: Decision,
  { existing, answeredKeys, websiteOpen, serial }: { existing: string[]; answeredKeys: string[]; websiteOpen: boolean; serial: number },
): AiQuestionCheck {
  if (d.action !== 'ASK' && d.action !== 'CLARIFY') return { ok: false, reason: `action ${d.action}` };
  const text = (d.suggested_question ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 12 || text.length > 220) return { ok: false, reason: 'matn uzunligi' };
  if (!text.endsWith('?')) return { ok: false, reason: 'savol emas' };
  if (CYRILLIC.test(text) || d.selectable_options.some((o) => CYRILLIC.test(o))) return { ok: false, reason: 'lotin yozuvi emas' };
  if (isSensitive(text) || d.selectable_options.some(isSensitive)) return { ok: false, reason: 'maxfiy mavzu' };
  if (!d.answer_type) return { ok: false, reason: 'javob turi yo‘q' };
  if (d.confidence < 0.5) return { ok: false, reason: 'ishonch past' };
  if (!d.business_purpose || d.business_purpose.length < 8) return { ok: false, reason: 'maqsad yo‘q' };
  const dup = existing.find((e) => similarity(e, text) >= 0.55);
  if (dup) return { ok: false, reason: `takror: “${dup.slice(0, 60)}”` };
  const stage: Stage = d.target_stage === 'website' ? 'website' : (d.target_stage ?? 'marketing');
  if (stage === 'website' && !websiteOpen) return { ok: false, reason: 'sayt bo‘limi ochilmagan' };

  let options: Option[] = [];
  if (d.answer_type === 'yesno') options = [{ key: 'yes', label: 'Ha' }, { key: 'no', label: 'Yo‘q' }];
  else if (d.answer_type !== 'text') {
    const seen = new Set<string>();
    for (const raw of d.selectable_options) {
      const label = raw.replace(/\s+/g, ' ').trim();
      const norm = label.toLowerCase();
      if (label.length < 1 || label.length > 90) return { ok: false, reason: 'variant uzunligi' };
      if (/^(boshqa|bilmayman|hech biri)\b/i.test(label)) continue; // added by the interface itself
      if (seen.has(norm)) return { ok: false, reason: 'takroriy variant' };
      seen.add(norm);
      options.push({ key: `o${options.length + 1}`, label });
    }
    if (options.length < 2) return { ok: false, reason: 'variantlar kam' };
  }
  const refs = d.relevant_prior_answer_ids.filter((k) => answeredKeys.includes(k));
  return {
    ok: true,
    question: {
      key: `ai.q${serial}`,
      version: 1,
      stage,
      industries: ['*'],
      category: 'AI aniqlashtirish',
      text,
      type: d.answer_type,
      options,
      max: d.answer_type === 'multi' ? Math.min(options.length, 4) : d.answer_type === 'text' ? 400 : undefined,
      allowOther: d.answer_type !== 'text' && d.answer_type !== 'yesno',
      allowUnknown: true,
      required: false,
      priority: 66,
      purpose: d.business_purpose,
      uncovers: [d.missing_information_category ? `ai:${d.missing_information_category.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)}` : `ai.q${serial}`],
      aiAdaptable: false,
      active: true,
      source: 'ai',
      // Kept with the answer as provenance (never shown to the client).
      provenance: { refs, reasoning: d.reasoning_summary, confidence: d.confidence },
    },
  };
}

// ------------------------------------------------------------------------------------------------ classification

export const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['industry', 'sub_industry', 'confidence', 'reason'],
  properties: {
    industry: { type: 'string', enum: INDUSTRIES.map((i) => i.key) },
    sub_industry: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    reason: str,
  },
} as const;

export function parseClassification(x: unknown): { industry: string; sub: string | null; confidence: number; reason: string } | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  const ind = INDUSTRIES.find((i) => i.key === d.industry);
  if (!ind) return null;
  const sub = ind.subs.find((s) => s.key === d.sub_industry)?.key ?? null;
  const confidence = typeof d.confidence === 'number' ? Math.max(0, Math.min(1, d.confidence)) : 0;
  return { industry: ind.key, sub, confidence, reason: typeof d.reason === 'string' ? d.reason.slice(0, 300) : '' };
}

// ------------------------------------------------------------------------------------------------ analysis

export type Basis = 'confirmed' | 'inferred' | 'unknown';
export type Claim = { text: string; basis: Basis; evidence: string[] };
export const SERVICES = ['SMM', 'Target reklama', 'Video kontent', 'Brending', 'Veb-sayt', 'CRM / avtomatlashtirish'] as const;
export type Service = (typeof SERVICES)[number];

export type Analysis = {
  profile_summary: string;
  how_business_works: Claim[];
  goals: Claim[];
  problems: Claim[];
  marketing_current: Claim[];
  marketing_weaknesses: Claim[];
  marketing_opportunities: Claim[];
  services: { service: Service; reason: string; basis: Basis; evidence: string[] }[];
  website: { objectives: Claim[]; users: Claim[]; pages: string[]; assumptions: string[]; unresolved: string[]; priorities: string[] } | null;
  meeting_questions: string[];
  conclusion: string;
  sanitized?: number;
};

const claim = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'basis', 'evidence'],
  properties: { text: str, basis: { type: 'string', enum: ['confirmed', 'inferred', 'unknown'] }, evidence: { type: 'array', items: str, maxItems: 6 } },
} as const;
const claims = { type: 'array', items: claim, maxItems: 8 } as const;
const strings = { type: 'array', items: str, maxItems: 12 } as const;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'profile_summary',
    'how_business_works',
    'goals',
    'problems',
    'marketing_current',
    'marketing_weaknesses',
    'marketing_opportunities',
    'services',
    'website',
    'meeting_questions',
    'conclusion',
  ],
  properties: {
    profile_summary: str,
    how_business_works: claims,
    goals: claims,
    problems: claims,
    marketing_current: claims,
    marketing_weaknesses: claims,
    marketing_opportunities: claims,
    services: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['service', 'reason', 'basis', 'evidence'],
        properties: { service: { type: 'string', enum: [...SERVICES] }, reason: str, basis: { type: 'string', enum: ['confirmed', 'inferred', 'unknown'] }, evidence: { type: 'array', items: str, maxItems: 6 } },
      },
    },
    website: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['objectives', 'users', 'pages', 'assumptions', 'unresolved', 'priorities'],
          properties: { objectives: claims, users: claims, pages: strings, assumptions: strings, unresolved: strings, priorities: strings },
        },
      ],
    },
    meeting_questions: { type: 'array', items: str, maxItems: 10 },
    conclusion: str,
  },
} as const;

/** Growth promises and invented numbers the report must never carry. */
const HYPE = /\d+\s*(%|foiz|barobar|marta\s+(ko‘p|oshadi|o.?sadi))|kafolat(lanadi|laymiz)?|albatta\s+oshadi|guarantee/i;

/**
 * The analysis as it may be shown: evidence limited to real answer keys; "confirmed" without evidence becomes
 * "inferred"; claims with growth promises or invented percentages are dropped and counted.
 */
export function sanitizeAnalysis(raw: unknown, answerKeys: string[], websiteRequested: boolean): Analysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  let dropped = 0;
  const text = (v: unknown, max = 1200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const keep = (s: string) => {
    if (!s) return false;
    if (HYPE.test(s)) {
      dropped++;
      return false;
    }
    return true;
  };
  const evidence = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === 'string' && answerKeys.includes(k)))].slice(0, 6) : []);
  const basisOf = (b: unknown, ev: string[]): Basis => {
    const x = b === 'confirmed' || b === 'inferred' || b === 'unknown' ? b : 'inferred';
    return x === 'confirmed' && !ev.length ? 'inferred' : x;
  };
  const claimsOf = (v: unknown): Claim[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, 8)
      .map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        const ev = evidence(o.evidence);
        return { text: text(o.text, 400), basis: basisOf(o.basis, ev), evidence: ev };
      })
      .filter((c) => keep(c.text));
  const list = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((s) => text(s, 300)).filter(keep).slice(0, n) : []);
  const services = (Array.isArray(r.services) ? r.services : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const ev = evidence(o.evidence);
      return { service: o.service as Service, reason: text(o.reason, 400), basis: basisOf(o.basis, ev), evidence: ev };
    })
    .filter((s) => SERVICES.includes(s.service) && keep(s.reason))
    .filter((s, i, all) => all.findIndex((x) => x.service === s.service) === i);
  const w = r.website && typeof r.website === 'object' ? (r.website as Record<string, unknown>) : null;
  const summary = text(r.profile_summary, 800);
  const conclusion = text(r.conclusion, 1500);
  return {
    profile_summary: keep(summary) ? summary : '',
    how_business_works: claimsOf(r.how_business_works),
    goals: claimsOf(r.goals),
    problems: claimsOf(r.problems),
    marketing_current: claimsOf(r.marketing_current),
    marketing_weaknesses: claimsOf(r.marketing_weaknesses),
    marketing_opportunities: claimsOf(r.marketing_opportunities),
    services,
    website:
      websiteRequested && w
        ? { objectives: claimsOf(w.objectives), users: claimsOf(w.users), pages: list(w.pages), assumptions: list(w.assumptions), unresolved: list(w.unresolved), priorities: list(w.priorities) }
        : null,
    meeting_questions: list(r.meeting_questions, 10),
    conclusion: keep(conclusion) ? conclusion : '',
    sanitized: dropped,
  };
}
