/**
 * Performance learning (pure): manually entered, verified metrics → what has worked for this client. A group is only
 * judged with enough material (MIN_SAMPLE pieces); otherwise it says so instead of overfitting to one lucky post.
 */

export const MIN_SAMPLE = 3;

export type MetricRow = {
  itemId: string;
  kind: string;
  format: string | null;
  objective: string | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  leads: number | null;
};

export type GroupStat = { key: string; n: number; reach: number | null; engagement: number | null; leads: number | null };
export type Insights = {
  byFormat: GroupStat[];
  byObjective: GroupStat[];
  byKind: GroupStat[];
  recommendations: { text: string; basis: string }[];
  enough: boolean;
};

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((n, x) => n + (x ?? 0), 0) : null);

/** Interactions per reach (likes + comments + shares + saves) / reach — only where reach was recorded. */
export function engagementRate(r: MetricRow): number | null {
  if (!r.reach) return null;
  const inter = [r.likes, r.comments, r.shares, r.saves].reduce<number>((n, x) => n + (x ?? 0), 0);
  return inter / r.reach;
}

function group(rows: MetricRow[], keyOf: (r: MetricRow) => string | null): GroupStat[] {
  // Several metric rows for one item: the latest one counts (rows come newest first).
  const latest = new Map<string, MetricRow>();
  for (const r of rows) if (!latest.has(r.itemId)) latest.set(r.itemId, r);
  const groups = new Map<string, MetricRow[]>();
  for (const r of latest.values()) {
    const k = keyOf(r);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const rates = list.map(engagementRate).filter((x): x is number => x !== null);
      const reach = sum(list.map((r) => r.reach));
      return {
        key,
        n: list.length,
        reach: reach === null ? null : Math.round(reach / list.length),
        engagement: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 1000) / 10 : null,
        leads: sum(list.map((r) => r.leads)),
      };
    })
    .sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1));
}

export function buildInsights(rows: MetricRow[], labels: Record<string, string> = {}): Insights {
  const byFormat = group(rows, (r) => r.format);
  const byObjective = group(rows, (r) => r.objective);
  const byKind = group(rows, (r) => r.kind);
  const judged = byFormat.filter((g) => g.n >= MIN_SAMPLE && g.engagement !== null);
  const recommendations: Insights['recommendations'] = [];
  if (judged.length >= 2) {
    const best = judged[0];
    const worst = judged[judged.length - 1];
    if (best.engagement! > worst.engagement! * 1.3) {
      recommendations.push({ text: `“${labels[best.key] ?? best.key}” formatini ko‘proq ishlating (yangi burchak bilan)`, basis: `${best.n} ta material, o‘rtacha jalb ${best.engagement}%` });
      recommendations.push({ text: `“${labels[worst.key] ?? worst.key}” formatini kamaytiring yoki boshqacha yondashing`, basis: `${worst.n} ta material, o‘rtacha jalb ${worst.engagement}%` });
    }
  }
  const leadGroups = byObjective.filter((g) => g.n >= MIN_SAMPLE && (g.leads ?? 0) > 0).sort((a, b) => (b.leads ?? 0) / b.n - (a.leads ?? 0) / a.n);
  if (leadGroups[0]) recommendations.push({ text: `So‘rov olib kelgan maqsad: “${labels[leadGroups[0].key] ?? leadGroups[0].key}”`, basis: `${leadGroups[0].n} ta materialda ${leadGroups[0].leads} ta so‘rov` });
  return { byFormat, byObjective, byKind, recommendations, enough: judged.length >= 2 };
}

// ---------------------------------------------------------------------------------------------------------------
// Budget (pure): may a paid generation start? Cost limits apply when costs are known; image counts always.
// ---------------------------------------------------------------------------------------------------------------
export type BudgetState = {
  profile: { monthImages: number; monthCost: number | null; imageLimit: number; budgetUsd: number | null; emergency: boolean };
  agency: { todayImages: number; monthImages: number; monthCost: number | null; dailyLimit: number; monthlyLimit: number; budgetUsd: number | null };
};

/**
 * One job's own guards: paid pictures one post may use (regenerations and edits included), the estimated cost one job
 * may reach, and the agency's daily money cap. The first two the admin may lift for one post on purpose
 * (`allowOver`); the money caps never.
 */
export type JobGuard = { itemImages: number; itemLimit: number; estimate: number | null; maxJobCost: number | null; todayCost: number | null; dailyBudget: number | null; allowOver: boolean };

const usd = (n: number) => `$${n.toFixed(2)}`;

export function budgetCheck(s: BudgetState, imagesNeeded: number, job?: JobGuard): { ok: true; warnings: string[] } | { ok: false; reason: string; overridable?: boolean } {
  if (s.profile.emergency) return { ok: false, reason: 'Mijoz uchun favqulodda to‘xtatish yoqilgan.' };
  if (job && job.dailyBudget !== null && job.todayCost !== null && job.todayCost >= job.dailyBudget) return { ok: false, reason: `Agentlikning kunlik AI budjeti (${usd(job.dailyBudget)}) tugadi.` };
  if (job && !job.allowOver && job.itemImages + imagesNeeded > job.itemLimit)
    return { ok: false, overridable: true, reason: `Bu material uchun rasm chegarasi (${job.itemLimit}) yetmaydi: ishlatilgan ${job.itemImages}, kerak ${imagesNeeded}${job.estimate !== null ? ` (taxminan ${usd(job.estimate)})` : ''}. Davom ettirish uchun admin ruxsat berishi kerak.` };
  if (job && !job.allowOver && job.maxJobCost !== null && job.estimate !== null && job.estimate > job.maxJobCost)
    return { ok: false, overridable: true, reason: `Taxminiy narx ${usd(job.estimate)} — bitta ish chegarasidan (${usd(job.maxJobCost)}) yuqori. Davom ettirish uchun admin ruxsat berishi kerak.` };
  if (s.profile.monthImages + imagesNeeded > s.profile.imageLimit) return { ok: false, reason: `Mijozning oylik rasm limiti (${s.profile.imageLimit}) yetmaydi: ishlatilgan ${s.profile.monthImages}, kerak ${imagesNeeded}.` };
  if (s.agency.todayImages + imagesNeeded > s.agency.dailyLimit) return { ok: false, reason: `Agentlikning kunlik rasm limiti (${s.agency.dailyLimit}) yetmaydi.` };
  if (s.agency.monthImages + imagesNeeded > s.agency.monthlyLimit) return { ok: false, reason: `Agentlikning oylik rasm limiti (${s.agency.monthlyLimit}) yetmaydi.` };
  if (s.profile.budgetUsd !== null && s.profile.monthCost !== null && s.profile.monthCost >= s.profile.budgetUsd) return { ok: false, reason: `Mijozning oylik budjeti ($${s.profile.budgetUsd}) tugadi.` };
  if (s.agency.budgetUsd !== null && s.agency.monthCost !== null && s.agency.monthCost >= s.agency.budgetUsd) return { ok: false, reason: `Agentlikning oylik budjeti ($${s.agency.budgetUsd}) tugadi.` };
  const warnings: string[] = [];
  if (s.profile.monthImages + imagesNeeded > s.profile.imageLimit * 0.8) warnings.push('Mijozning oylik rasm limitining 80% dan oshdi.');
  if (s.profile.budgetUsd !== null && s.profile.monthCost !== null && s.profile.monthCost > s.profile.budgetUsd * 0.8) warnings.push('Mijozning oylik budjetining 80% dan oshdi.');
  if (s.agency.budgetUsd !== null && s.agency.monthCost !== null && s.agency.monthCost > s.agency.budgetUsd * 0.8) warnings.push('Agentlik oylik budjetining 80% dan oshdi.');
  return { ok: true, warnings };
}
