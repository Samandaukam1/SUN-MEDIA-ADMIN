/**
 * Smart client analysis ("Mijoz tahlili" interviews): the shared vocabulary of the question engine. Pure types —
 * imported by the engine, the server, the manager pages and the tests alike.
 */

export type Stage = 'identity' | 'industry' | 'marketing' | 'website_gate' | 'website' | 'wrapup';
export const STAGES: Stage[] = ['identity', 'industry', 'marketing', 'website_gate', 'website', 'wrapup'];
export const STAGE_LABEL: Record<Stage, string> = {
  identity: 'Biznes bilan tanishuv',
  industry: 'Faoliyat va jarayonlar',
  marketing: 'Marketing va maqsadlar',
  website_gate: 'Sayt',
  website: 'Sayt talablari',
  wrapup: 'Yakun',
};

export type AnswerType = 'single' | 'multi' | 'yesno' | 'range' | 'rank' | 'text' | 'number';

/** Requirement priority a website option carries into the specification (only when the client chose it). */
export type ReqPriority = 'must' | 'should' | 'nice';

export type Option = {
  key: string;
  label: string;
  hint?: string;
  /** Exclusive: picking it clears the others (multi). */
  exclusive?: boolean;
  /** Website discovery: the module this option asks for (and, for detail answers, how firmly). */
  req?: { id: string; title: string; level?: ReqPriority };
  /** Shown only for these industries. */
  industries?: string[];
  /** A clarification's answer: the effective answers it settles (the original answers stay as given). */
  resolves?: Answers;
};

/**
 * Deterministic branching. An answer is "in" when one of the chosen option keys matches; `unknown` / `none` read the
 * client's "Bilmayman" / "Hozircha mavjud emas". Industry and sub-industry come from the classification.
 */
export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { q: string; in?: string[]; answered?: boolean; unknown?: boolean; none?: boolean; gte?: number; lte?: number }
  | { industry: string[] }
  | { sub: string[] };

export type Question = {
  key: string;
  /** Built-in questions are version 1; every edit in the bank adds a version. */
  version: number;
  stage: Stage;
  /** Industry keys this question belongs to; ['*'] for everyone. */
  industries: string[];
  /** Narrower: only these sub-industries (within the industries above). */
  subs?: string[];
  category: string;
  text: string;
  description?: string;
  type: AnswerType;
  options?: Option[];
  /** The options are the chosen options of another (multi) question — e.g. "which of these are essential". */
  optionsFrom?: string;
  /** Options generated from the industry taxonomy (the sub-industry question). */
  optionsSource?: 'subIndustries';
  min?: number;
  max?: number;
  /** For number questions. */
  unit?: string;
  allowOther?: boolean;
  allowUnknown?: boolean;
  allowNone?: boolean;
  required: boolean;
  /** 1–100: higher is asked first within its stage. */
  priority: number;
  /** Why we ask (managers only — never shown to the client). */
  purpose: string;
  /** The facts this answer establishes; a question whose facts are all known already is not asked. */
  uncovers: string[];
  when?: Cond;
  skipIf?: Cond;
  /** The AI may suggest a rewording or a follow-up around it (never replace it). */
  aiAdaptable?: boolean;
  active?: boolean;
  /** Where it came from: built-in library, a manager's edit, the AI (validated), a consistency rule. */
  source?: 'curated' | 'bank' | 'ai' | 'rule';
  /** AI questions: what it referred to and why (managers only). */
  provenance?: { refs: string[]; reasoning: string; confidence: number; model?: string };
};

/** One answer as stored. Free words stay as typed; nothing is invented to fill a gap. */
export type AnswerValue = {
  choice?: string[];
  other?: string;
  text?: string;
  number?: number;
  unknown?: boolean;
  none?: boolean;
  /** An optional question passed over. */
  skipped?: boolean;
  note?: string;
};

export type Answers = Record<string, AnswerValue>;

/** What the client may see of a question: no purpose, priority or rules. */
export type PublicQuestion = Pick<
  Question,
  'key' | 'text' | 'description' | 'type' | 'min' | 'max' | 'unit' | 'allowOther' | 'allowUnknown' | 'allowNone' | 'required'
> & { options: Pick<Option, 'key' | 'label' | 'hint' | 'exclusive'>[]; stage: Stage };

export const toPublic = (q: Question, options: Option[]): PublicQuestion => ({
  key: q.key,
  text: q.text,
  description: q.description,
  type: q.type,
  min: q.min,
  max: q.max,
  unit: q.unit,
  allowOther: q.allowOther,
  allowUnknown: q.allowUnknown,
  allowNone: q.allowNone,
  required: q.required,
  stage: q.stage,
  options: options.map((o) => ({ key: o.key, label: o.label, hint: o.hint, exclusive: o.exclusive })),
});
