import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CrmReportView } from '@/components/crm/CrmReportView';
import { PageHeader } from '@/components/panel/PageHeader';
import { Card } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { CRM_REPORT_KIND, type CrmReportData } from '@/lib/crm';
import { createClient } from '@/lib/supabase/server';
import { formatDateKey, formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'CRM hisobot' };

export default async function CrmReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('crm.read');
  const { id } = await params;
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from('crm_reports')
    .select('id, kind, period_start, period_end, sent_at, note, data, client:clients(id, name), sender:profiles!crm_reports_sent_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!r) notFound();

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'CRM hisobotlari', href: '/crm/reports' }, { label: r.client?.name ?? 'Hisobot' }]}
        title={`${r.client?.name ?? ''}: ${CRM_REPORT_KIND[r.kind] ?? ''} hisobot`}
        description={`${formatDateKey(r.period_start)} – ${formatDateKey(r.period_end)} · yuborildi ${formatShortDateTime(r.sent_at)}${r.sender?.full_name ? ` · ${r.sender.full_name}` : ''}`}
      />
      {r.note ? <Card className="mb-6 text-sm">{r.note}</Card> : null}
      <CrmReportView data={r.data as unknown as CrmReportData} />
    </div>
  );
}
