import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LeadRowActions } from '@/components/crm/LeadActions';
import { PageHeader } from '@/components/panel/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { fieldLabel, platformLabel } from '@/lib/crm';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Lid' };

type Lead = {
  id: string;
  client_id: string;
  client: { id: string; name: string; code: string };
  full_name: string | null;
  phone: string | null;
  email: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  form_name: string | null;
  page_name: string | null;
  platform: string | null;
  fields: Record<string, string | null>;
  lead_at: string;
  received_at: string;
  fetch_status: 'pending' | 'complete' | 'failed';
  fetch_error: string | null;
  delivery_status: 'pending' | 'delivered' | 'discarded';
  delivered_at: string | null;
  delivered_by_name: string | null;
  discarded_reason: string | null;
  can_manage: boolean;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-6 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value || '—'}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('crm.read');
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_lead', { p_lead_id: id });
  if (error?.code === 'P0002') notFound();
  if (error) throw error;
  const lead = data as unknown as Lead;
  const answers = Object.entries(lead.fields ?? {}).filter(([, v]) => v);

  return (
    <div className="max-w-4xl">
      <PageHeader
        crumbs={[{ label: 'Lidlar', href: '/crm' }, { label: lead.full_name || 'Lid' }]}
        title={lead.full_name || 'Ism ko‘rsatilmagan'}
        description={`${lead.client.name} · ${formatShortDateTime(lead.lead_at)}`}
        actions={
          <>
            <Badge tone={lead.delivery_status === 'delivered' ? 'success' : lead.delivery_status === 'discarded' ? 'neutral' : 'warning'}>
              {lead.delivery_status === 'delivered' ? 'Mijozga yuborilgan' : lead.delivery_status === 'discarded' ? 'Chiqarilgan' : 'Yuborilmagan'}
            </Badge>
            {lead.can_manage ? <LeadRowActions leadId={lead.id} clientId={lead.client_id} status={lead.delivery_status} ready={lead.fetch_status === 'complete'} /> : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Aloqa</SectionTitle>
          <dl className="divide-y divide-line">
            <Row label="Ism" value={lead.full_name} />
            <Row label="Telefon" value={lead.phone} />
            <Row label="Email" value={lead.email} />
            <Row label="Qoldirilgan" value={formatShortDateTime(lead.lead_at)} />
            <Row label="Qabul qilindi" value={formatShortDateTime(lead.received_at)} />
            {lead.delivered_at ? <Row label="Yuborildi" value={`${formatShortDateTime(lead.delivered_at)} · ${lead.delivered_by_name ?? 'avtomatik'}`} /> : null}
          </dl>
        </Card>
        <Card>
          <SectionTitle>Reklama</SectionTitle>
          <dl className="divide-y divide-line">
            <Row label="Kampaniya" value={lead.campaign_name} />
            <Row label="Ad set" value={lead.adset_name} />
            <Row label="Reklama" value={lead.ad_name} />
            <Row label="Forma" value={lead.form_name} />
            <Row label="Sahifa" value={lead.page_name} />
            <Row label="Platforma" value={platformLabel(lead.platform)} />
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle>Forma javoblari</SectionTitle>
          {answers.length === 0 ? (
            <p className="text-sm text-muted">{lead.fetch_status === 'complete' ? 'Javoblar yo‘q.' : (lead.fetch_error ?? 'Javoblar Meta’dan hali olinmadi.')}</p>
          ) : (
            <dl className="divide-y divide-line">
              {answers.map(([k, v]) => (
                <Row key={k} label={fieldLabel(k)} value={v} />
              ))}
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}
