import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';
import { monthLabel, shiftMonth } from './ClientStatsTab';
import { GenerateReportForm, HighlightsForm, ReportActions } from './StatsForms';

/** Client → Hisobotlar: prepare, review and publish monthly reports. */
export async function ClientReportsTab({ clientId, manage }: { clientId: string; manage: boolean }) {
  const supabase = await createClient();
  const { data: reports, error } = await supabase
    .from('monthly_reports')
    .select('id, period_month, status, title, highlights, generated_at, published_at, pdf_path, pdf_generated_at, metrics:monthly_report_metrics(metric_key, value, target_value)')
    .eq('client_id', clientId)
    .order('period_month', { ascending: false });
  if (error) throw error;
  const current = agencyDateKey().slice(0, 8) + '01';
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i)).map((m) => ({ value: m, label: monthLabel(m) }));

  return (
    <div className="space-y-6">
      {manage ? (
        <Card>
          <SectionTitle>Yangi hisobot</SectionTitle>
          <GenerateReportForm clientId={clientId} months={months} />
          <p className="mt-3 text-[13px] text-muted">
            Tarif bajarilishi, syomkalar, tasdiqlar va “Statistika”da kiritilgan raqamlardan hisoblanadi. Qayta tayyorlash qoralamani yangilaydi.
          </p>
        </Card>
      ) : null}
      {reports.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Hali hisobot tayyorlanmagan.</p>
        </Card>
      ) : (
        reports.map((r) => {
          const metric = (k: string) => r.metrics.find((m) => m.metric_key === k);
          const completion = metric('calendar.completion_rate');
          const delivered = r.metrics.filter((m) => m.metric_key.startsWith('delivery.') && m.target_value != null);
          const done = delivered.reduce((s, m) => s + Number(m.value ?? 0), 0);
          const planned = delivered.reduce((s, m) => s + Number(m.target_value ?? 0), 0);
          return (
            <Card key={r.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{monthLabel(r.period_month)}</p>
                  <p className="text-[13px] text-muted">
                    {[
                      r.generated_at ? `Hisoblandi ${formatShortDateTime(r.generated_at)}` : null,
                      r.published_at ? `nashr ${formatShortDateTime(r.published_at)}` : null,
                      r.pdf_generated_at ? `PDF ${formatShortDateTime(r.pdf_generated_at)}` : 'PDF hali yo‘q (mobil ilovadan yaratiladi)',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Badge tone={r.status === 'published' ? 'success' : 'warning'} dot>
                  {r.status === 'published' ? 'Nashr qilingan' : 'Qoralama'}
                </Badge>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[13px] text-muted">Kontent reja bajarilishi</p>
                  <p className="text-xl font-bold">{completion?.value != null ? `${Number(completion.value)}%` : '—'}</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[13px] text-muted">Tarif bo‘yicha yetkazildi</p>
                  <p className="text-xl font-bold">{planned ? `${done} / ${planned}` : done}</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[13px] text-muted">Obunachilar o‘sishi</p>
                  <p className="text-xl font-bold">{metric('social.followers_growth')?.value != null ? Number(metric('social.followers_growth')!.value).toLocaleString('ru-RU') : '—'}</p>
                </div>
              </div>
              {manage ? <HighlightsForm reportId={r.id} clientId={clientId} value={r.highlights} /> : r.highlights ? <p className="whitespace-pre-wrap text-sm">{r.highlights}</p> : null}
              {manage ? (
                <div className="mt-4 border-t border-line pt-4">
                  <ReportActions reportId={r.id} clientId={clientId} published={r.status === 'published'} pdfPath={r.pdf_path} />
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}
