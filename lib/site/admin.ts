import 'server-only';

import { getPublicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { SITE_COLLECTIONS, type SiteCollectionKey } from './collections';

/** All rows of a "Sayt" list in display order, as the signed-in manager sees them (RLS: site.manage). */
export async function loadCollection(key: SiteCollectionKey) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(SITE_COLLECTIONS[key].table as 'site_faqs')
    .select('*')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as unknown as (Record<string, unknown> & { id: string; is_published: boolean })[];
}

export async function partnerOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from('site_partners').select('id, name').order('sort_order').order('created_at');
  return data ?? [];
}

/** Agency clients as starting points for partner cards (name + a logo already in our storage). */
export async function clientPresets() {
  const supabase = await createClient();
  const { data } = await supabase.from('clients').select('name, logo_url, home_logo_url').is('deleted_at', null).order('name');
  const base = `${getPublicEnv().url}/storage/v1/object/public/`;
  const own = (u: string | null) => (u && u.startsWith(`${base}branding/`) ? u : null);
  return (data ?? []).map((c) => ({ name: c.name, logoUrl: own(c.home_logo_url) ?? own(c.logo_url) }));
}

export async function siteCounts() {
  const supabase = await createClient();
  const count = async (table: 'site_services' | 'site_cases' | 'site_partners' | 'site_testimonials' | 'site_stats' | 'site_benefits' | 'site_steps' | 'site_faqs') => {
    const { count: n } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_published', true);
    return n ?? 0;
  };
  const [services, cases, partners, testimonials, stats, benefits, steps, faqs, fresh] = await Promise.all([
    count('site_services'),
    count('site_cases'),
    count('site_partners'),
    count('site_testimonials'),
    count('site_stats'),
    count('site_benefits'),
    count('site_steps'),
    count('site_faqs'),
    supabase.from('site_applications').select('id', { count: 'exact', head: true }).eq('status', 'new').then((r) => r.count ?? 0),
  ]);
  return { services, cases, partners, testimonials, stats, benefits, steps, faqs, newApplications: fresh };
}
