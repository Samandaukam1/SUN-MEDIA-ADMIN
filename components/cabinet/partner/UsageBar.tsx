import type { Usage } from '@/lib/cabinet/partner-data';

/** One service of the tariff this month: delivered against planned ("6 / 8 Reels"), or simply included. */
export function UsageBar({ item }: { item: Usage }) {
  const planned = item.planned ?? null;
  if (!item.is_quantitative || planned === null || planned <= 0) {
    return (
      <li className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
        <span className="min-w-0 truncate text-[#e4e4e7]">{item.service_name}</span>
        <span className="shrink-0 text-[12.5px] text-[#d4fc18]">{item.used ? `${item.used} ${item.unit ?? ''}`.trim() : 'kiritilgan'}</span>
      </li>
    );
  }
  const pct = Math.min(100, Math.round((item.used / planned) * 100));
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="min-w-0 truncate text-[#e4e4e7]">{item.service_name}</span>
        <span className="shrink-0 text-[13px] text-[#a8a8ac] tabular-nums">
          <span className="font-semibold text-white">{item.used}</span> / {planned} {item.unit ?? ''}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${item.used > planned ? 'bg-[#f4f4f5]' : 'bg-[#d4fc18]'}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
