import { Stat } from '@/components/panel/Stat';
import { Card, SectionTitle } from '@/components/ui/Card';
import type { CrmReportData } from '@/lib/crm';

function formatDay(date: string) {
  const [, m, d] = date.split('-');
  return `${d}.${m}`;
}

function Bars({ rows }: { rows: { name: string; value: number; detail?: string | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex justify-between gap-4 text-sm">
            <span className="truncate">{r.name}</span>
            <span className="tabular font-medium">{r.value}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.detail ? <p className="mt-1 text-[12px] text-subtle">{r.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** CRM report numbers: the preview before sending and the sent report look exactly the same. */
export function CrmReportView({ data }: { data: CrmReportData }) {
  const max = Math.max(1, ...data.daily.map((d) => d.count));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Jami lid" value={String(data.total)} detail={`${data.days} kun`} />
        <Stat label="Kunlik o‘rtacha" value={String(data.daily_average)} />
        <Stat label="Yuborilgan" value={String(data.delivered)} tone="success" />
        <Stat label="Yuborilmagan" value={String(data.pending)} tone={data.pending ? 'warning' : 'default'} />
      </div>
      {data.total === 0 ? (
        <p className="text-sm text-muted">Bu davrda lid kelmagan.</p>
      ) : (
        <>
          <Card>
            <SectionTitle>Kunlar bo‘yicha</SectionTitle>
            <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Kunlik lidlar grafigi">
              {data.daily.map((d) => (
                <div key={d.date} className="flex-1 rounded-sm bg-accent" style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} title={`${formatDay(d.date)}: ${d.count}`} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-subtle">
              <span>{formatDay(data.period_start)}</span>
              <span>{formatDay(data.period_end)}</span>
            </div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Kampaniyalar</SectionTitle>
              <Bars rows={data.by_campaign.map((c) => ({ name: c.name, value: c.count }))} />
            </Card>
            <Card>
              <SectionTitle>Eng yaxshi reklamalar</SectionTitle>
              <Bars rows={data.top_ads.map((a) => ({ name: a.name, value: a.count, detail: a.campaign }))} />
            </Card>
          </div>
          {data.weekly.length > 1 ? (
            <Card>
              <SectionTitle>Haftalar bo‘yicha</SectionTitle>
              <Bars rows={data.weekly.map((w) => ({ name: `${formatDay(w.week_start)} haftasi`, value: w.count }))} />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
