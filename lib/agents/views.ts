import 'server-only';

import { agencyDateKey } from '@/lib/time';

import { aiOnline } from './ai';
import { costReport, type FrameRow, type UsageRow } from './cost';
import type { Frame } from './core';
import { imagesReady } from './images';
import { db, loadSettings, signed } from './server';

/** Read models for the panel pages: items with client and thumbnails (small JPEGs, signed), counters, jobs, usage. */

export type ItemView = {
  id: string;
  profileId: string;
  profileName: string;
  username: string | null;
  kind: 'story' | 'carousel' | 'post';
  slot: number;
  targetDate: string;
  scheduledAt: string;
  status: string;
  title: string;
  objective: string;
  format: string;
  versionNo: number | null;
  thumbs: string[];
  slides: number;
  lastError: string | null;
  qaPassed: boolean | null;
};

const SELECT =
  'id, profile_id, kind, slot, target_date, scheduled_at, status, last_error, plan, profile:agent_profiles!inner(name, instagram_username, status), version:agent_versions!agent_items_current_version_fk(version_no, idea, frames, qa)';

type Row = {
  id: string;
  profile_id: string;
  kind: string;
  slot: number;
  target_date: string;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  plan: Record<string, unknown> | null;
  profile: { name: string; instagram_username: string | null; status: string };
  version: { version_no: number; idea: Record<string, unknown>; frames: Frame[]; qa: { passed?: boolean } } | null;
};

export async function toViews(rows: Row[], thumbs = 4): Promise<ItemView[]> {
  const paths = rows.flatMap((r) => (r.version?.frames ?? []).slice(0, thumbs).map((f) => f.thumb ?? f.path));
  const urls = await signed(paths);
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    profileName: r.profile.name,
    username: r.profile.instagram_username,
    kind: r.kind as ItemView['kind'],
    slot: r.slot,
    targetDate: r.target_date,
    scheduledAt: r.scheduled_at,
    status: r.status,
    title: String(r.version?.idea?.title ?? r.plan?.concept ?? ''),
    objective: String(r.version?.idea?.objective ?? r.plan?.objective ?? ''),
    format: String(r.version?.idea?.format ?? r.plan?.format ?? ''),
    versionNo: r.version?.version_no ?? null,
    thumbs: (r.version?.frames ?? []).slice(0, thumbs).map((f) => urls[f.thumb ?? f.path]).filter(Boolean),
    slides: r.version?.frames?.length ?? 0,
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

const monthStart = () => {
  const d = agencyDateKey().slice(0, 7);
  return new Date(Date.parse(`${d}-01T00:00:00Z`) - 5 * 3600_000).toISOString();
};

export async function usageMonth() {
  const { data } = await db().from('agent_usage').select('profile_id, kind, images, input_tokens, output_tokens, cost_usd, web_searches').gte('created_at', monthStart()).limit(20000);
  const rows = data ?? [];
  const cost = rows.some((r) => r.cost_usd !== null) ? rows.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0) : null;
  const byProfile = new Map<string, { images: number; calls: number; cost: number | null }>();
  for (const r of rows) {
    const k = r.profile_id ?? '—';
    const cur = byProfile.get(k) ?? { images: 0, calls: 0, cost: null };
    cur.images += r.images;
    if (r.kind !== 'image' && r.kind !== 'image_edit') cur.calls++;
    if (r.cost_usd !== null) cur.cost = (cur.cost ?? 0) + Number(r.cost_usd);
    byProfile.set(k, cur);
  }
  return {
    images: rows.reduce((n, r) => n + r.images, 0),
    calls: rows.filter((r) => r.kind !== 'image' && r.kind !== 'image_edit').length,
    tokens: rows.reduce((n, r) => n + r.input_tokens + r.output_tokens, 0),
    searches: rows.reduce((n, r) => n + r.web_searches, 0),
    cost,
    byProfile,
  };
}

export async function overview() {
  const today = agencyDateKey();
  const in3 = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [profiles, stories, carousels, pending, ready, failedJobs, running, usage, settings] = await Promise.all([
    db().from('agent_profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db().from('agent_items').select('status').eq('kind', 'story').eq('target_date', today),
    db().from('agent_items').select('id', { count: 'exact', head: true }).eq('kind', 'carousel').gte('target_date', today).lte('target_date', in3),
    db().from('agent_items').select('id', { count: 'exact', head: true }).in('status', ['pending_approval', 'qa_failed']),
    db().from('agent_items').select('id', { count: 'exact', head: true }).in('status', ['approved', 'export_ready']),
    db().from('agent_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', since),
    db().from('agent_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running']),
    usageMonth(),
    loadSettings(),
  ]);
  const st = stories.data ?? [];
  return {
    activeClients: profiles.count ?? 0,
    storiesToday: st.length,
    storiesReady: st.filter((x) => ['pending_approval', 'approved', 'export_ready', 'exported', 'published_manual'].includes(x.status)).length,
    carouselsPlanned: carousels.count ?? 0,
    pending: pending.count ?? 0,
    ready: ready.count ?? 0,
    failedJobs: failedJobs.count ?? 0,
    activeJobs: running.count ?? 0,
    usage,
    settings,
    ai: { text: aiOnline(), images: imagesReady() },
  };
}

export type JobView = { id: string; kind: string; status: string; progress: string | null; error: string | null; attempts: number; created_at: string; updated_at: string; item_id: string | null; profileName: string; itemKind: string | null; itemDate: string | null };

export async function jobsList(statuses?: string[], limit = 100): Promise<JobView[]> {
  let q = db().from('agent_jobs').select('id, kind, status, progress, error, attempts, created_at, updated_at, item_id, profile:agent_profiles(name), item:agent_items(kind, target_date)');
  if (statuses?.length) q = q.in('status', statuses);
  const { data } = await q.order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    progress: j.progress,
    error: j.error,
    attempts: j.attempts,
    created_at: j.created_at,
    updated_at: j.updated_at,
    item_id: j.item_id,
    profileName: (j.profile as { name?: string } | null)?.name ?? '—',
    itemKind: (j.item as { kind?: string } | null)?.kind ?? null,
    itemDate: (j.item as { target_date?: string } | null)?.target_date ?? null,
  }));
}

/** Sozlamalar → the month's cost per client (agent_usage as OpenAI reported it, priced from the list prices). */
export async function costMonth() {
  const since = monthStart();
  const [usage, versions, profiles] = await Promise.all([
    db().from('agent_usage').select('profile_id, item_id, kind, model, images, cost_usd, input_tokens, output_tokens').gte('created_at', since).limit(20000),
    db().from('agent_versions').select('change_kind, frames, item:agent_items!inner(profile_id)').gte('created_at', since).limit(5000),
    db().from('agent_profiles').select('id, name, monthly_budget_usd, monthly_image_limit, cost_mode'),
  ]);
  const frames: FrameRow[] = (versions.data ?? []).map((v) => ({
    profile_id: (v.item as unknown as { profile_id: string }).profile_id,
    change_kind: v.change_kind,
    bg_models: ((v.frames as unknown as { bg_model?: string | null }[]) ?? []).map((f) => f.bg_model ?? ''),
  }));
  const report = costReport((usage.data ?? []) as UsageRow[], frames, profiles.data ?? []);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  return { ...report, names };
}
