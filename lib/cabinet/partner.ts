import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { MetricRow } from './stats';

const num = z.number().nullable();

const metricSchema = z.object({
  account_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  followers_start: num,
  followers_end: num,
  reach: num,
  views: num,
  profile_visits: num,
  likes: num,
  comments: num,
  shares: num,
  saves: num,
  reels_count: num,
  posts_count: num,
  stories_count: num,
  ad_spend: num,
  ad_currency: z.enum(['UZS', 'USD']),
  leads: num,
  source: z.enum(['manual', 'api']),
  synced_at: z.string().nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<MetricRow>;

const cabinetSchema = z.object({
  client: z.object({ id: z.string(), name: z.string(), code: z.string(), logo_url: z.string().nullable(), logo_dark_url: z.string().nullable() }),
  from: z.string(),
  to: z.string(),
  accounts: z.array(
    z.object({
      id: z.string(),
      platform: z.string(),
      handle: z.string(),
      url: z.string().nullable(),
      connection: z.string(),
      last_synced_at: z.string().nullable(),
    }),
  ),
  metrics: z.array(metricSchema),
  reports: z.array(
    z.object({
      id: z.string(),
      period_month: z.string(),
      title: z.string(),
      highlights: z.string().nullable(),
      work_done: z.string().nullable(),
      work_planned: z.string().nullable(),
      published_at: z.string().nullable(),
      has_pdf: z.boolean(),
      files: z.array(z.object({ id: z.string(), name: z.string(), mime_type: z.string().nullable(), size_bytes: num })),
      delivery: z.array(z.object({ label: z.string(), value: num, target: num, unit: z.string().nullable() })),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      status: z.string(),
      starts_on: z.string().nullable(),
      ends_on: z.string().nullable(),
      tasks_total: z.number(),
      tasks_done: z.number(),
    }),
  ),
  updated_at: z.string().nullable(),
});

export type PartnerCabinet = z.infer<typeof cabinetSchema>;

/**
 * One brand's published numbers, reports and projects for [from … to] (month starts). The database checks that
 * the signed-in person belongs to this brand (or is SUN MEDIA staff with access); otherwise it throws 42501.
 */
export async function loadPartnerCabinet(clientId: string, from: string, to: string): Promise<PartnerCabinet | 'forbidden'> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_partner_cabinet', { p_client: clientId, p_from: from, p_to: to });
  if (error) {
    if (error.code === '42501') return 'forbidden';
    throw error;
  }
  return cabinetSchema.parse(data);
}
