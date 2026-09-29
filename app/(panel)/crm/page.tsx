import type { Metadata } from 'next';

import { DeliverAllButton, LeadRowActions } from '@/components/crm/LeadActions';
import { cellClass, ChipLinks, RowLink, rowClass, Table, withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { can, requirePermission } from '@/lib/auth';
import { platformLabel } from '@/lib/crm';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Lidlar' };

const STATES = [
  { key: 'new', label: 'Yangi (24 soat)' },
  { key: 'pending', label: 'Yuborilmagan' },
  { key: 'delivered', label: 'Yuborilgan' },
  { key: 'discarded', label: 'Chiqarilgan' },
] as const;
type State = (typeof STATES)[number]['key'];

type Summary = {
  new: number;
  pending: number;
  delivered_today: number;
  today: number;
  failed: number;
  can_manage: boolean;
  clients: { id: string; name: string; code: string; new: number; pending: number; ready: number; delivered_today: number; last_lead_at: string | null }[];
};

const PAGE = 50;

/** CRM → Lidlar: Meta leads land here first; admins check and send them to the client, the Rahbar only watches. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ state?: string; client?: string; before?: string }> }) {
  const context = await requirePermission('crm.read');
  const params = await searchParams;
  const state: State = STATES.some((s) => s.key === params.state) ? (params.state as State) : 'new';
  const supabase = await createClient();
  const [summaryRes, leadsRes] = await Promise.all([
    supabase.rpc('get_crm_summary'),
    supabase.rpc('get_leads', { p_state: state, p_client: params.client || undefined, p_before: params.before || undefined, p_limit: PAGE }),
  ]);
  if (summaryRes.error) throw summaryRes.error;
  if (leadsRes.error) throw leadsRes.error;
  const summary = summaryRes.data as unknown as Summary;
  const leads = leadsRes.data ?? [];
  const manage = can(context, 'crm.manage');
  const readyClients = summary.clients.filter((c) => c.ready > 0 && (!params.client || c.id === params.client));
  const base = { state, client: params.client };

  return (
    <div>
      <PageHeader
        title="Lidlar"
        description="Meta Lead Ads’dan kelgan lidlar. Tekshiring va mijozga yuboring — mijoz faqat yuborilganlarni ko‘radi."
        actions={manage ? <ButtonLink href="/crm/reports">Hisobot yuborish</ButtonLink> : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Yangi (24 soat)" value={String(summary.new)} />
        <Stat label="Yuborilmagan" value={String(summary.pending)} tone={summary.pending ? 'warning' : 'default'} />
        <Stat label="Bugun keldi" value={String(summary.today)} />
        <Stat label="Bugun yuborildi" value={String(summary.delivered_today)} />
      </div>

      {summary.failed > 0 ? (
        <p className="mb-4 text-sm text-danger">{`${summary.failed} ta lidning javoblari Meta’dan olinmadi — Mijozlar → Integratsiyalar’da ulanishni tekshiring.`}</p>
      ) : null}

      {manage && state !== 'delivered' && state !== 'discarded' && readyClients.length > 0 ? (
        <Card className="mb-6 space-y-3">
          <p className="text-sm font-medium">Mijozga yuborishga tayyor</p>
          <div className="flex flex-col gap-3">
            {readyClients.map((c) => (
              <DeliverAllButton key={c.id} clientId={c.id} clientName={c.name} ready={c.ready} />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-3">
        <ChipLinks
          items={STATES.map((s) => ({
            label: s.label,
            href: withParams('/crm', { ...base, state: s.key }),
            active: s.key === state,
            count: s.key === 'new' ? summary.new : s.key === 'pending' ? summary.pending : undefined,
          }))}
        />
        {summary.clients.length > 1 ? (
          <ChipLinks
            items={[
              { label: 'Barcha mijozlar', href: withParams('/crm', { state }), active: !params.client },
              ...summary.clients.map((c) => ({ label: c.name, href: withParams('/crm', { state, client: c.id }), active: params.client === c.id, count: c.pending || undefined })),
            ]}
          />
        ) : null}
      </div>

      {leads.length === 0 ? (
        <EmptyRow>
          {summary.clients.length === 0
            ? 'Hali lid yo‘q. Mijozning Facebook sahifasi va lid formalarini Mijozlar → Integratsiyalar orqali ulang.'
            : 'Bu ro‘yxatda lid yo‘q.'}
        </EmptyRow>
      ) : (
        <Table columns={['Kim', 'Telefon', 'Mijoz', 'Reklama', 'Vaqt', 'Holat', { label: '', className: 'text-right' }]}>
          {leads.map((l) => (
            <tr key={l.id} className={rowClass}>
              <td className={cellClass}>
                <RowLink href={`/crm/${l.id}`}>
                  <span className="font-medium">{l.full_name || 'Ism ko‘rsatilmagan'}</span>
                  {l.email ? <span className="block text-[13px] text-muted">{l.email}</span> : null}
                </RowLink>
              </td>
              <td className={`${cellClass} tabular whitespace-nowrap`}>{l.phone ?? '—'}</td>
              <td className={cellClass}>{l.client_name}</td>
              <td className={`${cellClass} text-muted`}>
                <span className="line-clamp-2">{[l.campaign_name, l.ad_name].filter(Boolean).join(' · ') || platformLabel(l.platform) || '—'}</span>
              </td>
              <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(l.lead_at)}</td>
              <td className={cellClass}>
                {l.fetch_status === 'failed' ? (
                  <Badge tone="danger">Ma’lumot olinmadi</Badge>
                ) : l.delivery_status === 'delivered' ? (
                  <Badge tone="success">Yuborilgan</Badge>
                ) : l.delivery_status === 'discarded' ? (
                  <Badge>Chiqarilgan</Badge>
                ) : l.fetch_status === 'pending' ? (
                  <Badge tone="info">Yuklanmoqda</Badge>
                ) : (
                  <Badge tone="warning">Yuborilmagan</Badge>
                )}
              </td>
              <td className={cellClass}>
                {manage ? <LeadRowActions leadId={l.id} clientId={l.client_id} status={l.delivery_status} ready={l.fetch_status === 'complete'} /> : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {leads.length === PAGE ? (
        <div className="mt-4 text-right text-sm">
          <a href={withParams('/crm', { ...base, before: leads[leads.length - 1].lead_at })} className="font-medium text-muted hover:text-ink">
            Eskiroqlari →
          </a>
        </div>
      ) : null}
    </div>
  );
}
