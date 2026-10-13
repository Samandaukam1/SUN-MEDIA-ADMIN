/**
 * Partner cabinet numbers. Everything is computed from the published monthly rows of one brand, for one period,
 * the same way for the cards and the charts. A value nobody entered stays null ("Ma’lumot kiritilmagan");
 * a real 0 stays 0. No pure functions here touch the network, so they are unit-tested directly.
 */

export type Currency = 'UZS' | 'USD';

export type MetricRow = {
  account_id: string;
  period_start: string;
  period_end: string;
  followers_start: number | null;
  followers_end: number | null;
  reach: number | null;
  views: number | null;
  profile_visits: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reels_count: number | null;
  posts_count: number | null;
  stories_count: number | null;
  ad_spend: number | null;
  ad_currency: Currency;
  leads: number | null;
  source: 'manual' | 'api';
  synced_at: string | null;
  updated_at: string;
};

export type Money = Partial<Record<Currency, number>>;

export type Totals = {
  views: number | null;
  reach: number | null;
  profile_visits: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  interactions: number | null;
  engagement_rate: number | null;
  followers: number | null;
  followers_growth: number | null;
  reels: number | null;
  posts: number | null;
  stories: number | null;
  leads: number | null;
  ad_spend: Money | null;
  cpl: Money | null;
  months_with_data: number;
};

const MONTH_KEY = /^(\d{4})-(\d{2})(?:-01)?$/;

/** "2026-08" or "2026-08-01" → "2026-08-01"; anything else → null. */
export function monthStart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = MONTH_KEY.exec(value);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 120; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(month: string): string {
  return SHORT[Number(month.slice(5, 7)) - 1];
}

/** "Avgust 2026" or "Mart – Avgust 2026" or "Noyabr 2025 – Fevral 2026". */
export function periodLabel(from: string, to: string): string {
  if (from === to) return monthName(from);
  const [fy] = from.split('-');
  const [ty] = to.split('-');
  return fy === ty ? `${MONTHS[Number(from.slice(5, 7)) - 1]} – ${monthName(to)}` : `${monthName(from)} – ${monthName(to)}`;
}

export type Period = { from: string; to: string; length: number; previous: { from: string; to: string } };

export const MAX_PERIOD_MONTHS = 24;

/**
 * The period asked for in the URL (?dan=2026-03&gacha=2026-08 or ?oy=2026-08), clamped to [earliest … current month]
 * and to 24 months. Default: the last 6 months up to the current one. `previous` is the same length right before it.
 */
export function resolvePeriod(params: { oy?: unknown; dan?: unknown; gacha?: unknown }, current: string): Period {
  let from: string | null;
  let to: string | null;
  const single = monthStart(params.oy);
  if (single) {
    from = single;
    to = single;
  } else {
    from = monthStart(params.dan);
    to = monthStart(params.gacha);
  }
  if (!to || to > current) to = current;
  if (!from) from = shiftMonth(to, -5);
  if (from > to) [from, to] = [to, from];
  const earliest = shiftMonth(to, -(MAX_PERIOD_MONTHS - 1));
  if (from < earliest) from = earliest;
  const length = monthsBetween(from, to).length;
  return { from, to, length, previous: { from: shiftMonth(from, -length), to: shiftMonth(from, -1) } };
}

/** Sum of the values that exist; null when none exists (a real 0 is kept). */
export function sumKnown(values: (number | null | undefined)[]): number | null {
  let total: number | null = null;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
    total = (total ?? 0) + Number(v);
  }
  return total;
}

function moneyTotals(rows: MetricRow[], pick: (r: MetricRow) => number | null): Money | null {
  const out: Money = {};
  for (const r of rows) {
    const v = pick(r);
    if (v === null || v === undefined) continue;
    out[r.ad_currency] = (out[r.ad_currency] ?? 0) + Number(v);
  }
  return Object.keys(out).length ? out : null;
}

/** Totals of a set of monthly rows (any number of accounts and months). */
export function totals(rows: MetricRow[]): Totals {
  const col = (k: keyof MetricRow) => rows.map((r) => r[k] as number | null);
  const likes = sumKnown(col('likes'));
  const comments = sumKnown(col('comments'));
  const shares = sumKnown(col('shares'));
  const saves = sumKnown(col('saves'));
  const reach = sumKnown(col('reach'));
  const interactions = sumKnown([likes, comments, shares, saves]);

  // Followers now: each account's latest known month-end count, added up across accounts.
  const latest = new Map<string, MetricRow>();
  for (const r of rows) {
    if (r.followers_end === null || r.followers_end === undefined) continue;
    const seen = latest.get(r.account_id);
    if (!seen || r.period_start > seen.period_start) latest.set(r.account_id, r);
  }
  const followers = latest.size ? sumKnown([...latest.values()].map((r) => r.followers_end)) : null;
  const growth = sumKnown(
    rows.map((r) => (r.followers_start !== null && r.followers_end !== null ? Number(r.followers_end) - Number(r.followers_start) : null)),
  );

  // Cost per lead only from months where both the spend and the leads were entered, per currency.
  const paired = rows.filter((r) => r.ad_spend !== null && r.leads !== null);
  const pairedSpend = moneyTotals(paired, (r) => r.ad_spend);
  let cpl: Money | null = null;
  if (pairedSpend) {
    cpl = {};
    for (const currency of Object.keys(pairedSpend) as Currency[]) {
      const leads = sumKnown(paired.filter((r) => r.ad_currency === currency).map((r) => r.leads));
      if (leads && leads > 0) cpl[currency] = pairedSpend[currency]! / leads;
    }
    if (!Object.keys(cpl).length) cpl = null;
  }

  return {
    views: sumKnown(col('views')),
    reach,
    profile_visits: sumKnown(col('profile_visits')),
    likes,
    comments,
    shares,
    saves,
    interactions,
    engagement_rate: reach && reach > 0 && interactions !== null ? Math.round((interactions / reach) * 10000) / 100 : null,
    followers,
    followers_growth: growth,
    reels: sumKnown(col('reels_count')),
    posts: sumKnown(col('posts_count')),
    stories: sumKnown(col('stories_count')),
    leads: sumKnown(col('leads')),
    ad_spend: moneyTotals(rows, (r) => r.ad_spend),
    cpl,
    months_with_data: new Set(rows.map((r) => r.period_start)).size,
  };
}

/** One point per month of the period, from the same rows as the cards; a month without data is null (a gap). */
export function monthlySeries(rows: MetricRow[], months: string[]): { month: string; totals: Totals | null }[] {
  return months.map((month) => {
    const inMonth = rows.filter((r) => r.period_start === month);
    return { month, totals: inMonth.length ? totals(inMonth) : null };
  });
}

/** Percent change against the named previous period; null whenever either side is unknown or the base is 0. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function filterRows(rows: MetricRow[], from: string, to: string, accountId?: string | null): MetricRow[] {
  return rows.filter((r) => r.period_start >= from && r.period_start <= to && (!accountId || r.account_id === accountId));
}

const group = (n: number, digits = 0) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ /g, ' ');

/** 1 234 567 · 12,4 ming · 524 ming · 1,04 mln — short forms only for big numbers on cards (full value in the title). */
export function formatNumber(n: number, compact = false): string {
  const a = Math.abs(n);
  if (compact && a >= 1_000_000) return `${group(n / 1_000_000, a >= 10_000_000 ? 1 : 2)} mln`;
  if (compact && a >= 100_000) return `${group(Math.round(n / 1000))} ming`;
  if (compact && a >= 10_000) return `${group(n / 1000, 1)} ming`;
  return group(n, Number.isInteger(n) ? 0 : 1);
}

export function formatMoney(money: Money): string {
  return (Object.keys(money) as Currency[])
    .sort()
    .map((c) => (c === 'USD' ? `$${group(money[c]!, money[c]! % 1 ? 2 : 0)}` : `${group(Math.round(money[c]!))} so‘m`))
    .join(' + ');
}
