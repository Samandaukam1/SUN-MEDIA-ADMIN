import Link from 'next/link';
import type { ReactNode } from 'react';

import { SiteIcon } from '@/components/site/SiteIcon';
import { change, formatMoney, formatNumber, type Money } from '@/lib/cabinet/stats';

export const EMPTY = 'Ma’lumot kiritilmagan';

export function Panel({ title, note, children, className = '' }: { title?: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`lg rounded-[28px] p-5 sm:p-7 ${className}`}>
      {title ? (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-[17px] font-medium tracking-[-0.01em] text-white">{title}</h2>
          {note ? <p className="text-[12.5px] text-[#8e8e96]">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
      <h2 className="text-[12px] font-semibold tracking-[0.14em] text-[#8e8e96] uppercase">{children}</h2>
      {hint ? <p className="text-[12px] text-[#6e6e76]">{hint}</p> : null}
    </div>
  );
}

/** Up/down chip against the previous period; nothing when either side is unknown. */
function Delta({ current, previous, invert = false }: { current: number | null; previous: number | null; invert?: boolean }) {
  const pct = change(current, previous);
  if (pct === null) return null;
  const good = invert ? pct < 0 : pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${
        flat ? 'bg-white/[0.06] text-[#a8a8ac]' : good ? 'bg-[#d4fc18]/12 text-[#d4fc18]' : 'bg-[#ff8a8a]/12 text-[#ff9c9c]'
      }`}
    >
      {flat ? '=' : pct > 0 ? '↑' : '↓'} {formatNumber(Math.abs(pct))}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  previous,
  hint,
  suffix,
  invert,
  compareLabel,
  className = '',
}: {
  className?: string;
  label: string;
  value: number | null;
  previous?: number | null;
  hint?: ReactNode;
  suffix?: string;
  invert?: boolean;
  compareLabel?: string | null;
}) {
  const known = value !== null;
  const showDelta = known && previous !== undefined && change(value, previous ?? null) !== null;
  return (
    <div className={`lg flex min-h-[132px] flex-col rounded-[22px] p-4 sm:p-5 ${className}`}>
      <p className="text-[12.5px] font-medium text-[#a8a8ac]">{label}</p>
      {known ? (
        <p className="font-display mt-2 text-[24px] leading-none font-medium tracking-[-0.03em] text-white tabular-nums sm:text-[27px]" title={formatNumber(value)}>
          {formatNumber(value, true)}
          {suffix ? <span className="ml-0.5 text-[17px] text-[#a8a8ac]">{suffix}</span> : null}
        </p>
      ) : (
        <p className="mt-2.5 text-[13px] leading-snug text-[#6e6e76]">{EMPTY}</p>
      )}
      <div className="mt-auto pt-3">
        {showDelta ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#6e6e76]">
            <Delta current={value} previous={previous ?? null} invert={invert} /> <span>{compareLabel}</span>
          </p>
        ) : hint ? (
          <p className="text-[11.5px] leading-snug text-[#6e6e76]">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MoneyCard({ label, value, hint, className = '' }: { label: string; value: Money | null; hint?: ReactNode; className?: string }) {
  return (
    <div className={`lg flex min-h-[132px] flex-col rounded-[22px] p-4 sm:p-5 ${className}`}>
      <p className="text-[12.5px] font-medium text-[#a8a8ac]">{label}</p>
      {value ? (
        <p className="font-display mt-2 text-[19px] leading-tight font-medium tracking-[-0.03em] break-words text-white tabular-nums sm:text-[21px]">{formatMoney(value)}</p>
      ) : (
        <p className="mt-2.5 text-[13px] leading-snug text-[#6e6e76]">{EMPTY}</p>
      )}
      {hint ? <p className="mt-auto pt-3 text-[11.5px] leading-snug text-[#6e6e76]">{hint}</p> : null}
    </div>
  );
}

export function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-medium transition-colors ${
        active ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.05] text-[#d9d9de] hover:bg-white/[0.09] hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

export function Lines({ text }: { text: string | null }) {
  const items = (text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[18px_1fr] gap-2.5 text-[14.5px] leading-snug text-[#e4e4e7]">
          <span className="mt-[3px] grid size-[18px] place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
            <SiteIcon name="check" size={11} strokeWidth={2.6} />
          </span>
          <span className="break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${formatNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
