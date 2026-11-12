import 'server-only';

import { agencyDayRange, agencyDateKey } from '@/lib/time';

import { aiRoutes, usageToday } from './ai';
import type { Frame } from './core';
import { agentIgConfig } from './connect';
import { db, loadSettings, signed } from './server';

/** Sahifalar uchun ko'rinishlar: materiallar (profil nomi va kichik rasmlar bilan), holat sanoqlari, ulanishlar. */

export type ItemView = {
  id: string;
  profileId: string;
  profileName: string;
  username: string | null;
  kind: 'story' | 'post';
  targetDate: string;
  scheduledAt: string;
  status: string;
  title: string;
  format: string;
  provider: string | null;
  thumbs: string[];
  lastError: string | null;
  qaPassed: boolean | null;
};

const SELECT =
  'id, profile_id, kind, target_date, scheduled_at, status, last_error, profile:agent_profiles!inner(name, instagram_username, status), version:agent_versions!agent_items_current_version_fk(idea, frames, qa, provider)';

type Row = {
  id: string;
  profile_id: string;
  kind: string;
  target_date: string;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  profile: { name: string; instagram_username: string | null; status: string };
  version: { idea: Record<string, unknown>; frames: Frame[]; qa: { passed?: boolean }; provider: string } | null;
};

export async function toViews(rows: Row[], thumbs = 3): Promise<ItemView[]> {
  const paths = rows.flatMap((r) => (r.version?.frames ?? []).slice(0, thumbs).map((f) => f.path));
  const urls = await signed(paths);
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    profileName: r.profile.name,
    username: r.profile.instagram_username,
    kind: r.kind as 'story' | 'post',
    targetDate: r.target_date,
    scheduledAt: r.scheduled_at,
    status: r.status,
    title: String(r.version?.idea?.title ?? ''),
    format: String(r.version?.idea?.format ?? ''),
    provider: r.version?.provider ?? null,
    thumbs: (r.version?.frames ?? []).slice(0, thumbs).map((f) => urls[f.path]).filter(Boolean),
    lastError: r.last_error,
    qaPassed: r.version ? !!r.version.qa?.passed : null,
  }));
}

export async function itemsWhere(filter: { statuses?: string[]; profileId?: string; from?: string; to?: string; kind?: string; limit?: number; order?: 'asc' | 'desc' }) {
  let q = db().from('agent_items').select(SELECT).neq('profile.status', 'archived');
  if (filter.statuses) q = q.in('status', filter.statuses);
  if (filter.profileId) q = q.eq('profile_id', filter.profileId);
  if (filter.kind) q = q.eq('kind', filter.kind);
  if (filter.from) q = q.gte('target_date', filter.from);
  if (filter.to) q = q.lte('target_date', filter.to);
  const { data } = await q.order('scheduled_at', { ascending: filter.order !== 'desc' }).limit(filter.limit ?? 100);
  return toViews((data ?? []) as unknown as Row[]);
}

export async function overview() {
  const today = agencyDateKey();
  const { from, to } = agencyDayRange(today);
  const [settings, profiles, pending, todayItems, upcoming, problems, publishedToday, usage, cost] = await Promise.all([
    loadSettings(),
    db().from('agent_profiles').select('id, name, instagram_username, status, auto_publish, approval_mode, stories_per_day, story_time, post_time').neq('status', 'archived').order('name'),
    itemsWhere({ statuses: ['pending_approval'], limit: 12 }),
    itemsWhere({ from: today, to: today, limit: 40 }),
    itemsWhere({ statuses: ['approved', 'publishing', 'partially_published'], limit: 12 }),
    itemsWhere({ statuses: ['failed', 'needs_reschedule', 'limit_reached', 'qa_failed'], limit: 12, order: 'desc' }),
    db().from('agent_items').select('id', { count: 'exact', head: true }).in('status', ['published', 'simulated']).gte('published_at', from).lt('published_at', to),
    usageToday(),
    db().from('agent_usage').select('cost_usd').gte('created_at', from).lt('created_at', to),
  ]);
  const conns = await db().from('agent_ig_connections').select('profile_id, status, username');
  const costToday = (cost.data ?? []).reduce((s, r) => s + (r.cost_usd === null ? 0 : Number(r.cost_usd)), 0);
  const unknownCost = (cost.data ?? []).some((r) => r.cost_usd === null);
  return {
    today,
    settings,
    profiles: profiles.data ?? [],
    connections: conns.data ?? [],
    pending,
    todayItems,
    upcoming,
    problems,
    publishedToday: publishedToday.count ?? 0,
    usage,
    costToday,
    unknownCost,
  };
}

export function connectionsStatus() {
  const r = aiRoutes();
  const ig = agentIgConfig();
  return {
    idea: r.idea,
    write: r.write,
    research: r.research,
    instagramApp: ig.configured,
    redirectUri: ig.redirectUri,
  };
}
