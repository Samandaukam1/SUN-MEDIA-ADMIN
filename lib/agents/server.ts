import 'server-only';

import { can, requirePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';
import type { StaffContext } from '@/types/app';

import { brandColors, contactsOf, parseDna, type BrandDna, type Contacts } from './brand';
import { contentHash, type Frame } from './core';
import type { MemoryLine, ProfileBrief, RecentItem } from './creative';
import type { BudgetState } from './insights';
import { palette, type Palette } from './layout';

/**
 * Agents server qatlami. Jadvallar faqat service_role uchun ochiq (RLS: hech kim), shuning uchun HAR kirish nuqtasi
 * avval `requireAgents()` (agents.manage) yoki worker'ning bir martalik tokenidan o'tadi.
 */

export const PERMISSION = 'agents.manage';
export const BUCKET = 'agent-media';

type T = Database['public']['Tables'];
export type AgentProfile = T['agent_profiles']['Row'];
export type AgentItem = T['agent_items']['Row'];
export type AgentVersion = T['agent_versions']['Row'];
export type AgentSettings = T['agent_settings']['Row'];
export type AgentAsset = T['agent_assets']['Row'];
export type AgentJob = T['agent_jobs']['Row'];
export type AgentCampaign = T['agent_campaigns']['Row'];

export const requireAgents = (): Promise<StaffContext> => requirePermission(PERMISSION);
export const canAgents = (c: StaffContext) => can(c, PERMISSION);
export const db = () => createAdminClient();

export async function loadSettings(): Promise<AgentSettings> {
  const { data } = await db().from('agent_settings').select('*').eq('id', 1).maybeSingle();
  return (
    data ?? {
      id: 1,
      publishing_enabled: false,
      simulate: true,
      automation_enabled: true,
      monthly_budget_usd: null,
      monthly_image_limit: 600,
      daily_image_limit: 80,
      revision_warn: 5,
      story_safe_top: 250,
      story_safe_bottom: 340,
      prepare_lead_hours: 20,
      late_grace_minutes: 90,
      daily_ai_limit: 150,
      regen_limit: 4,
      research_weekday: 1,
      updated_at: new Date().toISOString(),
    }
  );
}

export function briefOf(p: AgentProfile): ProfileBrief {
  return {
    name: p.name,
    instagram_username: p.instagram_username,
    phone: p.phone,
    telegram: p.telegram,
    address: p.address,
    website: p.website,
    business: p.business,
    products: p.products,
    audience: p.audience,
    region: p.region,
    language: p.language,
    goal: p.goal,
    advantages: p.advantages,
    tone: p.tone,
    instructions: p.instructions,
    facts: p.facts,
    price_source: p.price_source,
    cta: p.cta,
    forbidden: p.forbidden,
    good_examples: p.good_examples,
    bad_examples: p.bad_examples,
    stories_per_day: p.stories_per_day,
  };
}

export async function memoryOf(profileId: string, limit = 80): Promise<MemoryLine[]> {
  const { data } = await db().from('agent_memory').select('kind, content, meta').eq('profile_id', profileId).eq('active', true).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((m) => ({ kind: m.kind, content: m.content, meta: (m.meta as Record<string, unknown>) ?? null }));
}

export async function addMemory(profileId: string, kind: string, content: string, meta: Record<string, unknown> = {}, by: string | null = null) {
  const text = content.trim().slice(0, 4000);
  if (!text) return;
  await db().from('agent_memory').insert({ profile_id: profileId, kind, content: text, meta: meta as Json, created_by: by });
}

/** Oxirgi 30 kundagi materiallar (rad etilganlardan tashqari): mavzu, format, sarlavhalar. */
export async function recentOf(profileId: string, excludeItem?: string): Promise<RecentItem[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db()
    .from('agent_items')
    .select('id, kind, target_date, status, version:agent_versions!agent_items_current_version_fk(idea, frames)')
    .eq('profile_id', profileId)
    .gte('created_at', since)
    .neq('status', 'rejected')
    .order('target_date', { ascending: false })
    .limit(80);
  return (data ?? [])
    .filter((r) => r.id !== excludeItem && r.version)
    .map((r) => {
      const v = r.version as unknown as { idea: Record<string, unknown>; frames: Frame[] };
      return { date: r.target_date, kind: r.kind, title: String(v.idea?.title ?? ''), format: String(v.idea?.format ?? ''), headlines: (v.frames ?? []).map((f) => f.headline ?? '') };
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Fayllar (yopiq bucket)
// ---------------------------------------------------------------------------------------------------------------
export async function upload(path: string, data: Buffer, contentType: string) {
  const { error } = await db().storage.from(BUCKET).upload(path, data, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(`Faylni saqlab bo‘lmadi: ${error.message}`);
}

export async function download(path: string): Promise<Buffer | null> {
  const { data } = await db().storage.from(BUCKET).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/** Panelda ko'rsatish uchun vaqtinchalik havolalar. */
export async function signed(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const { data } = await db().storage.from(BUCKET).createSignedUrls(list, seconds);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Versiyalar va tasdiq (tasdiq aniq versiya + hash'ga bog'langan)
// ---------------------------------------------------------------------------------------------------------------
export function hashFor(profile: Pick<AgentProfile, 'id' | 'instagram_username'>, item: Pick<AgentItem, 'kind' | 'scheduled_at'>, v: { caption: string; hashtags: string; frames: Frame[] }) {
  return contentHash({ profileId: profile.id, igUsername: profile.instagram_username, kind: item.kind, scheduledAt: item.scheduled_at, caption: v.caption, hashtags: v.hashtags, frames: v.frames });
}

export async function currentVersion(item: Pick<AgentItem, 'current_version_id'>): Promise<AgentVersion | null> {
  if (!item.current_version_id) return null;
  const { data } = await db().from('agent_versions').select('*').eq('id', item.current_version_id).maybeSingle();
  return data;
}

/** Joriy versiya joriy holatda (matn, rasm, profil, vaqt) tasdiqlanganmi. */
export async function isApproved(item: AgentItem, profile: AgentProfile): Promise<boolean> {
  const v = await currentVersion(item);
  if (!v) return false;
  const { data } = await db().from('agent_approvals').select('decision, content_hash').eq('item_id', item.id).eq('version_id', v.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || data.decision !== 'approved') return false;
  return data.content_hash === hashFor(profile, item, { caption: v.caption, hashtags: v.hashtags, frames: v.frames as unknown as Frame[] });
}

// ---------------------------------------------------------------------------------------------------------------
// Client context: everything one generation may use — and nothing of another client.
// ---------------------------------------------------------------------------------------------------------------
export type ClientContext = {
  profile: AgentProfile;
  dna: BrandDna;
  contacts: Contacts;
  palette: Palette;
  colors: string[];
  assets: AgentAsset[];
  campaigns: AgentCampaign[];
};

export const LOGO_KINDS = ['logo', 'logo_light', 'logo_dark'] as const;
export const PHOTO_KINDS = ['product', 'packaging', 'service', 'venue', 'people', 'illustration'];

export async function clientContext(profileId: string): Promise<ClientContext | null> {
  const [{ data: profile }, { data: assets }, { data: campaigns }] = await Promise.all([
    db().from('agent_profiles').select('*').eq('id', profileId).maybeSingle(),
    // Only this client's files, active and approved for use.
    db().from('agent_assets').select('*').eq('profile_id', profileId).is('archived_at', null).eq('usage_approved', true).order('created_at', { ascending: false }),
    db().from('agent_campaigns').select('*').eq('profile_id', profileId).eq('active', true).order('priority', { ascending: false }),
  ]);
  if (!profile) return null;
  const dna = parseDna(profile.brand_dna);
  const today = new Date().toISOString().slice(0, 10);
  return {
    profile,
    dna,
    contacts: contactsOf(profile, dna),
    palette: palette(profile.colors as Record<string, unknown>),
    colors: brandColors(profile.colors as Record<string, unknown>, dna),
    assets: (assets ?? []).filter((a) => a.storage_path.startsWith(`${profileId}/`)),
    campaigns: (campaigns ?? []).filter((c) => (!c.starts_on || c.starts_on <= today) && (!c.ends_on || c.ends_on >= today)),
  };
}

/** Budget state from the recorded usage (this month in Tashkent time; images counted, costs summed where known). */
export async function budgetState(profileId: string, settings: AgentSettings, profile: AgentProfile): Promise<BudgetState> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * 3600_000).toISOString();
  const dayStart = new Date(Date.parse(`${new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10)}T00:00:00Z`) - 5 * 3600_000).toISOString();
  const { data: month } = await db().from('agent_usage').select('profile_id, images, cost_usd, created_at').gte('created_at', monthStart).limit(20000);
  const rows = month ?? [];
  const sumCost = (list: typeof rows) => (list.some((r) => r.cost_usd !== null) ? list.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0) : null);
  const mine = rows.filter((r) => r.profile_id === profileId);
  return {
    profile: {
      monthImages: mine.reduce((n, r) => n + r.images, 0),
      monthCost: sumCost(mine),
      imageLimit: profile.monthly_image_limit,
      budgetUsd: profile.monthly_budget_usd === null ? null : Number(profile.monthly_budget_usd),
      emergency: profile.emergency_pause,
    },
    agency: {
      todayImages: rows.filter((r) => r.created_at >= dayStart).reduce((n, r) => n + r.images, 0),
      monthImages: rows.reduce((n, r) => n + r.images, 0),
      monthCost: sumCost(rows),
      dailyLimit: settings.daily_image_limit,
      monthlyLimit: settings.monthly_image_limit,
      budgetUsd: settings.monthly_budget_usd === null ? null : Number(settings.monthly_budget_usd),
    },
  };
}

/** A notification in the panel for everyone with agents.manage; opens the right page. */
export async function notify(type: string, title: string, body: string, route: string, entity?: string | null, priority: 'low' | 'normal' | 'high' = 'normal') {
  await db()
    .rpc('agent_notify', { p_type: `agents.${type}`, p_title: title.slice(0, 200), p_body: body.slice(0, 1000), p_route: route, p_entity: entity ?? undefined, p_priority: priority })
    .then(
      () => undefined,
      () => undefined,
    );
}
