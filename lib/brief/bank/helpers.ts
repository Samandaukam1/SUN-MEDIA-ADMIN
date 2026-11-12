import type { Cond, Option, Question } from '../types';

type Def = Omit<Question, 'version' | 'required' | 'priority' | 'uncovers' | 'category' | 'industries'> &
  Partial<Pick<Question, 'required' | 'priority' | 'uncovers' | 'category' | 'industries'>>;

/** Count / amount ranges ("2–3 ta", "50 mln gacha"): a free "Boshqa" adds nothing there. */
const rangeLike = (o: Option[] | undefined) => !!o?.length && o.every((x) => /^(one|none|\d|lt\d|gt\d)/.test(x.key));

/** A curated question with sensible defaults (version 1, required, mid priority, uncovers its own key). */
export const q = (d: Def): Question => ({
  version: 1,
  required: true,
  priority: 50,
  category: d.stage,
  industries: ['*'],
  uncovers: [d.key],
  aiAdaptable: false,
  active: true,
  source: 'curated',
  // Choice questions take the client's own words beside the options, unless it is a range, a derived list or a rule.
  allowOther:
    (d.type === 'single' || d.type === 'multi' || d.type === 'rank') && !d.optionsFrom && !rangeLike(d.options) && d.stage !== 'website_gate' && d.source !== 'rule',
  ...d,
});

/** Options from "key|Label" strings (a third part is a hint). */
export const opts = (...items: string[]): Option[] =>
  items.map((s) => {
    const [key, label, hint] = s.split('|');
    return hint ? { key, label, hint } : { key, label };
  });

/** Website modules: "key|Label" → an option that asks for that requirement. */
export const mods = (...items: string[]): Option[] =>
  items.map((s) => {
    const [key, label] = s.split('|');
    return { key, label, req: { id: key, title: label } };
  });

export const YES_NO: Option[] = opts('yes|Ha', 'no|Yo‘q');

export const is = (key: string, ...values: string[]): Cond => ({ q: key, in: values });
export const answered = (key: string): Cond => ({ q: key, answered: true });
export const all = (...c: Cond[]): Cond => ({ all: c });
export const any = (...c: Cond[]): Cond => ({ any: c });
export const not = (c: Cond): Cond => ({ not: c });
export const industry = (...keys: string[]): Cond => ({ industry: keys });
export const sub = (...keys: string[]): Cond => ({ sub: keys });

/** The website flow is open: a new site or an update was asked for (directly or after a clarification). */
export const WANTS_SITE: Cond = { q: 'web.need', in: ['new', 'update'] };
