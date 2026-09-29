import type { Metadata } from 'next';

import { CrmReportView } from '@/components/crm/CrmReportView';
import { SendReportForm } from '@/components/crm/SendReportForm';
import { cellClass, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { buttonClass } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { can, requirePermission } from '@/lib/auth';
import { CRM_REPORT_KIND, type CrmReportData } from '@/lib/crm';
import { toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { addDaysToKey, agencyDateKey, formatDateKey, formatShortDateTime, isDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'CRM hisobotlari' };

type Search = { client?: string; kind?: string; from?: string; to?: string };

/** CRM → Hisobotlar: pick client + period, preview the exact numbers, send; below, what was already sent. */
export default async function CrmReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await requirePermission('crm.read');
  const params = await searchParams;
  const manage = can(context, 'crm.manage');
  const today = agencyDateKey();
  const kind = params.kind === 'monthly' || params.kind === 'custom' ? params.kind : 'weekly';
  // Finished days only: 7 / 30 days end yesterday.
  const period =
    kind === 'weekly'
      ? { from: addDaysToKey(today, -7), to: addDaysToKey(today, -1) }
      : kind === 'monthly'
        ? { from: addDaysToKey(today, -30), to: addDaysToKey(today, -1) }
        : isDateKey(params.from) && isDateKey(params.to) && params.from <= params.to && params.to <= today
          ? { from: params.from, to: params.to }
          : null;

  const supabase = await createClient();
  const [clientsRes, sentRes] = await Promise.all([
    supabase.from('clients').select('id, name').is('deleted_at', null).in('status', ['active', 'paused']).order('name'),
    supabase
      .from('crm_reports')
      .select('id, kind, period_start, period_end, sent_at, data, client:clients(id, name), sender:profiles!crm_reports_sent_by_fkey(full_name)')
      .order('sent_at', { ascending: false })
      .limit(50),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (sentRes.error) throw sentRes.error;
  const clients = clientsRes.data;
  const client = clients.find((c) => c.id === params.client);

  let preview: CrmReportData | null = null;
  let previewError: string | null = null;
  if (client && period) {
    const { data, error } = await supabase.rpc('preview_crm_report', { p_client: client.id, p_from: period.from, p_to: period.to });
    if (error) previewError = toUserMessage(error);
    else preview = data as unknown as CrmReportData;
  }

  return (
    <div>
      <PageHeader title="CRM hisobotlari" description="Mijozga 7 kunlik, 30 kunlik yoki maxsus muddatli lidlar hisobotini yuboring. Mijoz xabar oladi." />

      {manage ? (
        <Card className="mb-8 space-y-6">
          <SectionTitle>Hisobot yuborish</SectionTitle>
          <form className="flex flex-wrap items-end gap-4" method="get">
            <label className="flex min-w-56 flex-col gap-1.5 text-sm font-medium">
              Mijoz
              <select name="client" defaultValue={params.client ?? ''} required className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="" disabled>
                  Tanlang
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Davr
              <select name="kind" defaultValue={kind} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="weekly">7 kunlik</option>
                <option value="monthly">30 kunlik</option>
                <option value="custom">Maxsus muddat</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Boshlanishi (maxsus)
              <input type="date" name="from" defaultValue={params.from ?? addDaysToKey(today, -14)} max={today} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Tugashi (maxsus)
              <input type="date" name="to" defaultValue={params.to ?? addDaysToKey(today, -1)} max={today} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
            </label>
            <button type="submit" className={buttonClass('secondary')}>
              Oldindan ko‘rish
            </button>
          </form>

          {client && !period ? <Notice tone="warning" title="Maxsus muddat noto‘g‘ri: boshlanish tugashdan oldin, kelajak sanasisiz bo‘lsin." /> : null}
          {previewError ? <Notice tone="danger" title={previewError} /> : null}
          {client && period && preview ? (
            <div className="space-y-6 border-t border-line pt-6">
              <p className="text-sm text-muted">{`${client.name} · ${formatDateKey(period.from)} – ${formatDateKey(period.to)} · mijoz aynan shuni ko‘radi`}</p>
              <CrmReportView data={preview} />
              <SendReportForm clientId={client.id} clientName={client.name} kind={kind} from={period.from} to={period.to} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <h2 className="mb-3 text-[15px] font-semibold">Yuborilganlar</h2>
      {sentRes.data.length === 0 ? (
        <EmptyRow>Hali CRM hisobot yuborilmagan.</EmptyRow>
      ) : (
        <Table columns={['Mijoz', 'Turi', 'Davr', 'Lid', 'Yubordi']}>
          {sentRes.data.map((r) => (
            <tr key={r.id} className={rowClass}>
              <td className={cellClass}>
                <RowLink href={`/crm/reports/${r.id}`}>
                  <span className="font-medium">{r.client?.name ?? '—'}</span>
                </RowLink>
              </td>
              <td className={`${cellClass} text-muted`}>{CRM_REPORT_KIND[r.kind] ?? r.kind}</td>
              <td className={`${cellClass} tabular whitespace-nowrap`}>{`${formatDateKey(r.period_start)} – ${formatDateKey(r.period_end)}`}</td>
              <td className={`${cellClass} tabular`}>{String((r.data as { total?: number } | null)?.total ?? '—')}</td>
              <td className={`${cellClass} whitespace-nowrap text-muted`}>{`${formatShortDateTime(r.sent_at)}${r.sender?.full_name ? ` · ${r.sender.full_name}` : ''}`}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
