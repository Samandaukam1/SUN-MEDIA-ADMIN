/**
 * Smart delegation (§30): who fits a piece of work, from the system's own facts only — the skills recorded for each
 * person, work of the same kind they finished, earlier work for the same client, their open and overdue tasks, that
 * day's deadlines and shootings, and whether they work that day at all. No invented metrics and nothing personal:
 * every reason is a fact the manager can check in the panel, and the decision stays with the manager. Pure functions.
 */

export type TaskType = 'shooting' | 'editing' | 'design' | 'copywriting' | 'publishing' | 'review' | 'strategy' | 'meeting' | 'other';

/** The skill that does each kind of work: the owner's workflow role first, then words in the skill's name. */
const SKILL_FOR: Record<TaskType, { role?: string; words: RegExp } | null> = {
  shooting: { role: 'operator', words: /operator|fotograf|videograf|syomka|s.yomka/ },
  editing: { role: 'editor', words: /montaj|editor|muharrir/ },
  copywriting: { role: 'scriptwriter', words: /ssenar|kopirayt|copywrit|matn/ },
  design: { words: /dizayn|design/ },
  publishing: { words: /smm|kontent|content/ },
  strategy: { words: /smm|target|strateg|marketolog/ },
  review: null,
  meeting: null,
  other: null,
};

export const TASK_WORD: Record<TaskType, string> = {
  shooting: 's’yomka',
  editing: 'montaj',
  design: 'dizayn',
  copywriting: 'ssenariy/matn',
  publishing: 'post joylash',
  review: 'tekshiruv',
  strategy: 'strategiya',
  meeting: 'uchrashuv',
  other: 'shu turdagi',
};

export type Skill = { name: string; workflow_role: string | null };

/** Does a recorded skill (or, more weakly, the job title) match this kind of work? */
export function fits(type: TaskType, skills: Skill[], title: string | null): { skill: string | null; title: boolean } {
  const want = SKILL_FOR[type];
  if (!want) return { skill: null, title: false };
  const skill = skills.find((s) => (want.role && s.workflow_role === want.role) || want.words.test(s.name.toLowerCase()));
  return { skill: skill?.name ?? null, title: !!title && want.words.test(title.toLowerCase()) };
}

export type Candidate = {
  id: string;
  name: string;
  title: string | null;
  /** The matching recorded skill, if any. */
  skill: string | null;
  /** The job title names this kind of work (weaker than a recorded skill). */
  titleFit: boolean;
  /** Tasks of this kind they finished in the last 90 days. */
  done: number;
  /** Tasks for this client in the last 180 days. */
  sameClient: number;
  open: number;
  overdue: number;
  /** Open tasks due on the day of the work. */
  dueThatDay: number;
  /** Shootings they are on that day. */
  shootingsThatDay: number;
  /** Why they are not available that day (vacation, day off…), or null. */
  away: string | null;
};

export type Ranked = { ism: string; id: string; lavozim: string | null; mos: boolean; band: string | null; sabablar: string[] };

/**
 * Candidates in order, each with the facts behind its place. The order is a transparent rule of thumb: a recorded skill
 * and experience of the same kind count for, open, overdue and same-day work counts against; anyone away that day goes
 * last. No score is shown — only the facts.
 */
export function rankCandidates(list: Candidate[], type: TaskType, client: string | null = null): Ranked[] {
  const kind = TASK_WORD[type];
  const weight = (c: Candidate) =>
    (c.skill ? 3 : c.titleFit ? 1.5 : 0) +
    Math.min(c.done, 6) * 0.5 +
    Math.min(c.sameClient, 4) * 0.5 -
    c.open * 0.4 -
    c.overdue * 0.8 -
    c.dueThatDay * 0.7 -
    c.shootingsThatDay * 1.5;
  const sorted = [...list].sort((a, b) => Number(!!a.away) - Number(!!b.away) || weight(b) - weight(a) || a.open - b.open || a.name.localeCompare(b.name));
  const anyFit = sorted.some((c) => !c.away && (c.skill || c.titleFit || c.done));
  return sorted.map((c, i) => {
    const why: string[] = [];
    if (c.skill) why.push(`ko‘nikmasi: ${c.skill}`);
    else if (c.titleFit) why.push(`lavozimi: ${c.title}`);
    if (c.done) why.push(`so‘nggi 90 kunda ${c.done} ta ${kind} vazifasini yakunlagan`);
    if (c.sameClient && client) why.push(`${client} bilan ${c.sameClient} ta vazifada ishlagan`);
    why.push(c.open ? `ochiq vazifalari: ${c.open}${c.overdue ? ` (${c.overdue} tasi muddati o‘tgan)` : ''}` : 'ochiq vazifasi yo‘q');
    if (c.dueThatDay) why.push(`o‘sha kuni yana ${c.dueThatDay} ta vazifa muddati`);
    if (c.shootingsThatDay) why.push(`o‘sha kuni ${c.shootingsThatDay} ta s’yomkada`);
    return {
      ism: c.name,
      id: c.id,
      lavozim: c.title,
      mos: i === 0 && !c.away && (anyFit ? !!(c.skill || c.titleFit || c.done) : true),
      band: c.away,
      sabablar: why,
    };
  });
}
