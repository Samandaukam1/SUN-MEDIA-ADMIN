'use client';

import { motion } from 'motion/react';
import { useState } from 'react';

import { formatNumber, monthName, monthShort } from '@/lib/cabinet/stats';

export type ChartSeries = { key: string; label: string; color: string; values: (number | null)[] };
type Unit = 'number' | 'uzs' | 'usd';

const EASE = [0.22, 1, 0.36, 1] as const;
const SHORT_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

/** "2026-10-13" → "13 okt" (daily charts); month starts keep their month names. */
function dayName(date: string): string {
  return `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

function show(value: number | null, unit: Unit): string {
  if (value === null) return 'Ma’lumot kiritilmagan';
  if (unit === 'uzs') return `${formatNumber(Math.round(value))} so‘m`;
  if (unit === 'usd') return `$${formatNumber(value)}`;
  return formatNumber(value);
}

function Legend({ series }: { series: ChartSeries[] }) {
  if (!series.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[#a8a8ac]">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ month, series, index, unit, align, days = false }: { month: string; series: ChartSeries[]; index: number; unit: Unit; align: 'left' | 'center' | 'right'; days?: boolean }) {
  const position = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[220px] rounded-2xl border border-white/10 bg-[#111113]/95 px-3.5 py-2.5 text-left shadow-[0_20px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur ${position}`}
    >
      <p className="mb-1 text-[12px] font-semibold text-white">{days ? dayName(month) : monthName(month)}</p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-[12px] text-[#a8a8ac]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
          <span>{s.label}:</span>
          <span className={s.values[index] === null ? 'text-[#6e6e76]' : 'font-semibold text-white tabular-nums'}>{show(s.values[index], unit)}</span>
        </p>
      ))}
    </div>
  );
}

/** Monthly bars (grouped, or stacked for parts of one whole). A month nobody entered is an empty outline, not a 0. */
export function MonthlyBars({
  months,
  series,
  unit = 'number',
  stacked = false,
  dayLabels = false,
}: {
  months: string[];
  series: ChartSeries[];
  unit?: Unit;
  stacked?: boolean;
  /** The points are days ("2026-10-13"), not months. */
  dayLabels?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = months.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const many = months.length > 8;
  const step = months.length > 16 ? Math.ceil(months.length / 8) : many ? 2 : 1;

  return (
    <div className="space-y-4">
      <Legend series={series} />
      <div className="relative flex h-[200px] items-end gap-1.5 border-b border-white/[0.08] sm:gap-3" onMouseLeave={() => setActive(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} aria-hidden className="absolute inset-x-0 border-t border-dashed border-white/[0.05]" style={{ bottom: `${f * 100}%` }} />
        ))}
        {months.map((month, i) => {
          const empty = series.every((s) => s.values[i] === null);
          return (
            <button
              key={month}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              aria-label={`${dayLabels ? dayName(month) : monthName(month)}: ${series.map((s) => `${s.label} ${show(s.values[i], unit)}`).join(', ')}`}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px] rounded-t-lg outline-none"
            >
              {empty ? (
                <span className="mb-0 h-[18%] w-full max-w-[44px] rounded-t-lg border border-b-0 border-dashed border-white/15" />
              ) : stacked ? (
                <span className="flex h-full w-full max-w-[44px] flex-col-reverse">
                  {series.map((s) =>
                    s.values[i] ? (
                      <motion.span
                        key={s.key}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${((s.values[i] ?? 0) / max) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, ease: EASE, delay: i * 0.04 }}
                        className="block w-full first:rounded-b-none last:rounded-t-lg"
                        style={{ background: s.color, opacity: active === null || active === i ? 1 : 0.45 }}
                      />
                    ) : null,
                  )}
                </span>
              ) : (
                series.map((s) => (
                  <motion.span
                    key={s.key}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${s.values[i] === null ? 0 : Math.max(1.5, ((s.values[i] ?? 0) / max) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: EASE, delay: i * 0.04 }}
                    className="block w-full max-w-[26px] rounded-t-lg"
                    style={{ background: s.color, opacity: active === null || active === i ? 1 : 0.45 }}
                  />
                ))
              )}
              {active === i ? (
                <Tooltip month={month} series={series} index={i} unit={unit} days={dayLabels} align={i === 0 ? 'left' : i === months.length - 1 ? 'right' : 'center'} />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 sm:gap-3">
        {months.map((month, i) => (
          <span
            key={month}
            className={`min-w-0 flex-1 text-center text-[11px] text-[#6e6e76] ${dayLabels ? (i % step ? 'invisible' : '') : many && i % 2 ? 'max-sm:invisible' : ''}`}
          >
            {dayLabels ? Number(month.slice(8, 10)) : monthShort(month)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Month-end values as a line; missing months break the line instead of dropping to 0. */
export function MonthlyLine({ months, series }: { months: string[]; series: ChartSeries }) {
  const [active, setActive] = useState<number | null>(null);
  const known = series.values.filter((v): v is number => v !== null);
  const top = Math.max(...known, 1);
  const bottom = known.length ? Math.min(...known) : 0;
  const span = Math.max(1, top - bottom);
  const lo = Math.max(0, bottom - span * 0.25);
  const hi = top + span * 0.15;
  // Points sit in the middle of each month's column, so they line up with the labels and the hover areas.
  const x = (i: number) => ((i + 0.5) / months.length) * 100;
  const y = (v: number) => 100 - ((v - lo) / Math.max(1, hi - lo)) * 100;

  // Consecutive known points form one segment.
  const segments: { i: number; v: number }[][] = [];
  series.values.forEach((v, i) => {
    if (v === null) return;
    const last = segments.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v });
    else segments.push([{ i, v }]);
  });

  return (
    <div className="space-y-4">
      <div className="relative h-[200px] border-b border-white/[0.08]" onMouseLeave={() => setActive(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={f} aria-hidden className="absolute inset-x-0 border-t border-dashed border-white/[0.05]" style={{ bottom: `${f * 100}%` }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-4 h-[calc(100%-2rem)] w-full overflow-visible" aria-hidden>
          <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }}>
            {segments.map((seg) => (
              <polyline
                key={seg[0].i}
                points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
                fill="none"
                stroke={series.color}
                strokeWidth={2.4}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </motion.g>
        </svg>
        <div className="absolute inset-x-0 inset-y-4">
          {series.values.map((v, i) =>
            v === null ? null : (
              <span
                key={months[i]}
                aria-hidden
                className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-[#050506]"
                style={{ left: `${x(i)}%`, bottom: `${100 - y(v)}%`, background: series.color, boxShadow: active === i ? `0 0 0 5px ${series.color}33` : undefined }}
              />
            ),
          )}
        </div>
        <div className="absolute inset-0 flex">
          {months.map((month, i) => (
            <button
              key={month}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              aria-label={`${monthName(month)}: ${show(series.values[i], 'number')}`}
              className="relative h-full flex-1 outline-none"
            >
              {active === i ? (
                <Tooltip month={month} series={[series]} index={i} unit="number" align={i === 0 ? 'left' : i === months.length - 1 ? 'right' : 'center'} />
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="flex">
        {months.map((month, i) => (
          <span key={month} className={`min-w-0 flex-1 text-center text-[11px] text-[#6e6e76] ${months.length > 8 && i % 2 ? 'max-sm:invisible' : ''}`}>
            {monthShort(month)}
          </span>
        ))}
      </div>
    </div>
  );
}
