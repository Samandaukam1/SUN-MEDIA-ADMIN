import 'server-only';

import { can, requirePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';
import type { StaffContext } from '@/types/app';

import { contentHash, type Frame } from './core';
import type { MemoryLine, ProfileBrief, RecentItem } from './creative';

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
export type AgentConnection = T['agent_ig_connections']['Row'];

export const requireAgents = (): Promise<StaffContext> => requirePermission(PERMISSION);
export const canAgents = (c: StaffContext) => can(c, PERMISSION);
export const db = () => createAdminClient();

export async function loadSettings(): Promise<AgentSettings> {
  const { data } = await db().from('agent_settings').select('*').eq('id', 1).maybeSingle();
  return (
    data ?? {
      id: 1,
      publishing_enabled: true,
      simulate: true,
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
