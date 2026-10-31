import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

/**
 * Reads for the partner cabinet. Every call runs with the signed-in person's own session through the same RPCs and
 * row-level security the mobile app uses, so a partner only ever receives its own brand's rows.
 */

const num = z.coerce.number();
const str = z.string();
const opt = z.string().nullable().optional();

// ---------------------------------------------------------------------------
// Home (tariff usage, upcoming visits and posts, this month, the team)
// ---------------------------------------------------------------------------
const eventSchema = z.object({
  event_type: str,
  entity_id: str,
  starts_at: str,
  ends_at: opt,
  title: str.nullable().optional().transform((v) => v ?? ''),
  content_type: opt,
  platform: opt,
  status: opt,
  location_name: opt,
});
export type CabinetEvent = z.infer<typeof eventSchema>;

const usageSchema = z.object({
  service_key: str,
  service_name: str,
  unit: opt,
  planned: z.coerce.number().nullable(),
  used: z.coerce.number().nullable().transform((v) => v ?? 0),
  is_quantitative: z.boolean().nullable().optional(),
  is_included: z.boolean().nullable().optional(),
});
export type Usage = z.infer<typeof usageSchema>;

const homeSchema = z.object({
  date: str,
  client: z.object({ id: str, name: str, code: str, logo_url: opt, industry: opt }),
  subscription: z.object({ plan_name: str, starts_on: str, ends_on: str, status: str }).nullable(),
  usage: z.array(usageSchema),
  upcoming: z.array(eventSchema),
  today: z.array(eventSchema),
  stats: z.object({
    in_production: num,
    editing: num,
    waiting_approval: num,
    publishing_today: num,
    published_month: num,
    shootings_month: num,
  }),
  month_delivered: z.record(z.string(), num),
  team: z.array(z.object({ user_id: str, full_name: str, avatar_url: opt, team_role: opt })),
});
export type PartnerHome = z.infer<typeof homeSchema>;

export async function loadHome(clientId: string): Promise<PartnerHome | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_home', { p_client_id: clientId });
  if (error) {
    if (['42501', 'P0002'].includes(error.code ?? '')) return null;
    throw error;
  }
  return homeSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Calendar: our visits (shootings), posts and approval deadlines
// ---------------------------------------------------------------------------
const PARTNER_EVENTS = ['shooting', 'publication', 'approval_deadline', 'meeting'];

export async function loadCalendar(clientId: string, fromIso: string, toIso: string): Promise<CabinetEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_calendar_events', { p_from: fromIso, p_to: toIso, p_client_id: clientId });
  if (error) throw error;
  return z
    .array(eventSchema)
    .parse(data ?? [])
    .filter((e) => PARTNER_EVENTS.includes(e.event_type) && e.status !== 'cancelled')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ---------------------------------------------------------------------------
// Tariff
// ---------------------------------------------------------------------------
const featureSchema = z.object({ service_name: str, unit: opt, quantity: z.coerce.number().nullable(), note: opt, is_quantitative: z.boolean().optional() });
const planSchema = z.object({
  current: z
    .object({
      id: str,
      status: str,
      starts_on: str,
      ends_on: str,
      price: z.coerce.number().nullable(),
      currency: opt,
      days_total: num,
      days_left: num,
      plan: z.object({ id: str, name: str, description: opt, duration_months: z.coerce.number().nullable() }),
    })
    .nullable(),
  upcoming: z.object({ plan_name: str, starts_on: str, ends_on: str }).nullable(),
  usage: z.array(usageSchema),
  pending_request: z.object({ id: str, plan_name: str, message: opt, created_at: str }).nullable(),
  last_decision: z.object({ status: str, plan_name: str, response: opt, handled_at: opt }).nullable(),
  plans: z.array(
    z.object({
      id: str,
      name: str,
      description: opt,
      price: z.coerce.number().nullable(),
      currency: opt,
      duration_months: z.coerce.number().nullable(),
      is_custom: z.boolean(),
      is_current: z.boolean(),
      features: z.array(featureSchema),
    }),
  ),
  history: z.array(z.object({ id: str, plan_name: str, status: str, starts_on: str, ends_on: str })),
});
export type PartnerPlan = z.infer<typeof planSchema>;

export async function loadPlan(clientId: string): Promise<PartnerPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_plan', { p_client_id: clientId });
  if (error) {
    if (error.code === '42501') return null;
    throw error;
  }
  return planSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Leads SUN MEDIA delivered from Meta, and the lead reports sent to the partner
// ---------------------------------------------------------------------------
export const LEAD_PERIODS = ['today', '7d', '30d', 'all'] as const;
export type LeadPeriod = (typeof LEAD_PERIODS)[number];

const leadSchema = z.object({
  id: str,
  full_name: opt,
  phone: opt,
  email: opt,
  campaign_name: opt,
  ad_name: opt,
  form_name: opt,
  platform: opt,
  lead_at: str,
  delivered_at: opt,
  fields: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type Lead = z.infer<typeof leadSchema>;
const leadsSchema = z.object({
  counts: z.object({ today: num, '7d': num, '30d': num, all: num }),
  leads: z.array(leadSchema),
});
export type PartnerLeads = z.infer<typeof leadsSchema>;

export async function loadLeads(clientId: string, period: LeadPeriod, before: string | null, limit = 50): Promise<PartnerLeads | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_leads', { p_client: clientId, p_period: period, p_before: before ?? undefined, p_limit: limit });
  if (error) {
    if (error.code === '42501') return null;
    throw error;
  }
  return leadsSchema.parse(data);
}

const crmDataSchema = z.object({
  total: num,
  delivered: num.optional(),
  daily_average: z.coerce.number().optional(),
  by_campaign: z.array(z.object({ name: str, count: num })).default([]),
  top_ads: z.array(z.object({ name: str, campaign: opt, count: num })).default([]),
  daily: z.array(z.object({ date: str, count: num })).default([]),
});
export type CrmReport = { id: string; kind: string; period_start: string; period_end: string; note: string | null; sent_at: string; data: z.infer<typeof crmDataSchema> };

export async function loadCrmReports(clientId: string, limit = 12): Promise<CrmReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crm_reports')
    .select('id, kind, period_start, period_end, note, sent_at, data')
    .eq('client_id', clientId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).flatMap((r) => {
    const parsed = crmDataSchema.safeParse(r.data);
    return parsed.success ? [{ ...r, data: parsed.data }] : [];
  });
}

// ---------------------------------------------------------------------------
// Chat with SUN MEDIA (the brand's default project room)
// ---------------------------------------------------------------------------
export type ChatMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  /** 'voice' / 'round_video': one recording instead of text. */
  kind: 'text' | 'voice' | 'round_video';
  is_system: boolean;
  created_at: string;
  deleted_at: string | null;
  sender_label: string | null;
  sender: { full_name: string; avatar_url: string | null } | null;
  attachments: {
    file: { id: string; name: string; kind: string; mime_type: string | null; size_bytes: number | null; duration_ms: number | null; waveform: number[] | null } | null;
  }[];
};

export async function loadChatRoom(clientId: string): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('id, name')
    .eq('client_id', clientId)
    .eq('kind', 'project')
    .eq('is_default', true)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const CHAT_PAGE = 50;

/** Newest page (or the page before `before`), returned oldest first for display. */
export async function loadMessages(roomId: string, before: string | null): Promise<ChatMessage[]> {
  const supabase = await createClient();
  let query = supabase
    .from('messages')
    .select(
      `id, sender_id, body, kind, is_system, created_at, deleted_at, sender_label,
       sender:profiles!messages_sender_id_fkey(full_name, avatar_url),
       attachments:message_attachments(file:files(id, name, kind, mime_type, size_bytes, duration_ms, waveform))`,
    )
    .eq('room_id', roomId);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CHAT_PAGE);
  if (error) throw error;
  return ((data ?? []) as unknown as ChatMessage[]).reverse();
}

export async function unreadCount(roomId: string, userId: string): Promise<number> {
  const supabase = await createClient();
  const { data: me } = await supabase.from('chat_members').select('last_read_at').eq('room_id', roomId).eq('user_id', userId).maybeSingle();
  if (!me) return 0;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gt('created_at', me.last_read_at ?? '1970-01-01')
    .neq('sender_id', userId)
    .is('deleted_at', null);
  return count ?? 0;
}
