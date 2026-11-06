/**
 * Profile statistics from measured observations only (pure; unit-tested). A provider's start_count, remains or
 * "Completed" are order facts, not measurements of the profile, and are never mixed in here. Changes are net changes
 * between two real observations — they do not say who followed or left, nor which order caused what.
 */

import { agencyDateKey } from '@/lib/time';

export type Observation = {
  id: string;
  observed_at: string;
  followers: number | null;
  following: number | null;
  media_count: number | null;
  display_name: string | null;
  source: 'manual' | 'instagram_api';
  origin: string;
  note: string | null;
};

export type FollowerPoint = { at: string; followers: number; source: Observation['source'] };

/** Observations with a follower count (0 is a real zero; null — not obtained — is skipped), oldest first. */
export function followerSeries(obs: Observation[]): FollowerPoint[] {
  return obs
    .filter((o) => o.followers !== null && Number.isFinite(o.followers))
    .map((o) => ({ at: o.observed_at, followers: o.followers as number, source: o.source }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export type ProfileStats = {
  first: FollowerPoint | null;
  latest: FollowerPoint | null;
  /** latest − first; null with fewer than two observations. */
  overall: number | null;
  /** The last observed day against the previous observed day (each day's last observation, Tashkent days). */
  lastDay: { day: string; previousDay: string; change: number } | null;
  days: { day: string; followers: number; change: number | null }[];
};

export function profileStats(obs: Observation[]): ProfileStats {
  const s = followerSeries(obs);
  const byDay = new Map<string, FollowerPoint>();
  for (const p of s) byDay.set(agencyDateKey(new Date(p.at)), p);
  const days = [...byDay.entries()].map(([day, p], i, all) => ({ day, followers: p.followers, change: i ? p.followers - all[i - 1][1].followers : null }));
  const last = days.length > 1 ? days[days.length - 1] : null;
  return {
    first: s[0] ?? null,
    latest: s[s.length - 1] ?? null,
    overall: s.length > 1 ? s[s.length - 1].followers - s[0].followers : null,
    lastDay: last && last.change !== null ? { day: last.day, previousDay: days[days.length - 2].day, change: last.change } : null,
    days,
  };
}

/**
 * The profile around an order's period: the last observation at or before it started and the first at or after it
 * ended (or the latest one while it runs). Context only — other orders and natural follows / unfollows overlap.
 */
export function periodContext(obs: Observation[], fromIso: string, toIso: string | null) {
  const s = followerSeries(obs);
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : null;
  const before = [...s].reverse().find((p) => Date.parse(p.at) <= from) ?? null;
  const after = to !== null ? (s.find((p) => Date.parse(p.at) >= to) ?? null) : (s.filter((p) => Date.parse(p.at) > from).pop() ?? null);
  return { before, after, change: before && after ? after.followers - before.followers : null };
}
