import type { Metadata } from 'next';

import { ChipLinks } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { ApplicationsInbox, type Application } from '@/components/site-admin/ApplicationsInbox';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Arizalar · Sayt' };

const FILTERS = [
  { key: 'new', label: 'Yangi' },
  { key: 'seen', label: 'Ko‘rilgan' },
  { key: 'archived', label: 'Arxiv' },
  { key: 'all', label: 'Barchasi' },
] as const;

export default async function SiteApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission('site.manage');
  const { status: raw } = await searchParams;
  const status = FILTERS.some((f) => f.key === raw) ? (raw as (typeof FILTERS)[number]['key']) : 'new';
  const supabase = await createClient();

  let query = supabase
    .from('site_applications')
    .select('id, full_name, phone, company, link_url, service, message, source_path, status, created_at, handled_at, handled_by')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const [{ data, error }, counts] = await Promise.all([
    query,
    Promise.all(
      (['new', 'seen', 'archived'] as const).map(async (s) => {
        const { count } = await supabase.from('site_applications').select('id', { count: 'exact', head: true }).eq('status', s);
        return [s, count ?? 0] as const;
      }),
    ),
  ]);
  if (error) throw error;
  const handlerIds = [...new Set((data ?? []).map((a) => a.handled_by).filter((id): id is string => !!id))];
  const { data: people } = handlerIds.length ? await supabase.from('profiles').select('id, full_name').in('id', handlerIds) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const items: Application[] = (data ?? []).map((a) => ({
    ...a,
    status: a.status as Application['status'],
    handler: a.handled_by ? (names.get(a.handled_by) ?? null) : null,
  }));
  const total = Object.fromEntries(counts) as Record<'new' | 'seen' | 'archived', number>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arizalar"
        description="Saytdagi “Ariza qoldirish” formasidan kelganlar. Yangi ariza kelganda mobil ilovaga bildirishnoma ham boradi."
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Arizalar' }]}
      />
      <ChipLinks
        items={FILTERS.map((f) => ({
          label: f.label,
          href: f.key === 'new' ? '/site/applications' : `/site/applications?status=${f.key}`,
          active: status === f.key,
          count: f.key === 'all' ? total.new + total.seen + total.archived : total[f.key],
        }))}
      />
      {items.length ? (
        <ApplicationsInbox items={items} />
      ) : (
        <EmptyRow>{status === 'new' ? 'Yangi ariza yo‘q.' : 'Bu yerda hali ariza yo‘q.'}</EmptyRow>
      )}
    </div>
  );
}
