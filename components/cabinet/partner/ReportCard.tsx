import { EMPTY, fileSize, Lines, Panel } from '@/components/cabinet/partner/parts';
import { SiteIcon } from '@/components/site/SiteIcon';
import type { PartnerCabinet } from '@/lib/cabinet/partner';
import { monthName } from '@/lib/cabinet/stats';
import { formatShortDateTime } from '@/lib/time';

/** One published monthly report: highlights, work done and planned, delivered numbers, files and the PDF. */
export function ReportCard({ report }: { report: PartnerCabinet['reports'][number] }) {
  return (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-[19px] font-medium text-white">{monthName(report.period_month)}</p>
              <p className="mt-1 text-[13px] break-words text-[#8e8e96]">
                {report.title}
                {report.published_at ? ` · nashr: ${formatShortDateTime(report.published_at)}` : ''}
              </p>
            </div>
            {report.has_pdf ? (
              <a href={`/kabinet/hisobot/${report.id}/pdf`} className="lg inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
                <SiteIcon name="download" size={16} /> PDF
              </a>
            ) : null}
          </div>
          {report.highlights ? <p className="mt-4 text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#d9d9de]">{report.highlights}</p> : null}
          {report.work_done || report.work_planned ? (
            <div className="mt-5 grid gap-5 border-t border-white/[0.06] pt-5 md:grid-cols-2">
              <div>
                <p className="mb-3 text-[12px] font-semibold tracking-[0.12em] text-[#8e8e96] uppercase">Bajarildi</p>
                {report.work_done ? <Lines text={report.work_done} /> : <p className="text-[13.5px] text-[#6e6e76]">{EMPTY}</p>}
              </div>
              <div>
                <p className="mb-3 text-[12px] font-semibold tracking-[0.12em] text-[#8e8e96] uppercase">Rejada</p>
                {report.work_planned ? <Lines text={report.work_planned} /> : <p className="text-[13.5px] text-[#6e6e76]">{EMPTY}</p>}
              </div>
            </div>
          ) : null}
          {report.files.length ? (
            <ul className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
              {report.files.map((file) => (
                <li key={file.id}>
                  <a
                    href={`/kabinet/fayl/${file.id}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-[#e4e4e7] transition-colors hover:bg-white/[0.09] hover:text-white"
                  >
                    <SiteIcon name="file" size={15} className="shrink-0 text-[#d4fc18]" />
                    <span className="truncate">{file.name}</span>
                    {file.size_bytes ? <span className="shrink-0 text-[#6e6e76]">{fileSize(file.size_bytes)}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
  );
}
