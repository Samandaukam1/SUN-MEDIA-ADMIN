'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { smmTargetHide, smmTargets } from '@/lib/actions/smm-plans';
import { formatRemaining, refillClock, type RefillPolicy } from '@/lib/neosmm/refill';
import type { FollowerPoint } from '@/lib/neosmm/profiles';
import { formatShortDateTime } from '@/lib/time';

const nf = (n: number) => n.toLocaleString('ru-RU');
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${nf(Math.abs(n))}`;

// ---------------------------------------------------------------------------------------------------------------
// Target input with the owner's recent links (choosing one only fills the field)
// ---------------------------------------------------------------------------------------------------------------
type Recent = Awaited<ReturnType<typeof smmTargets>>[number];

export function TargetField({ value, onChange, platform, label = 'Havola' }: { value: string; onChange: (v: string) => void; platform: string; label?: string }) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    smmTargets().then(
      (r) => live && setRecent(r),
      () => live && setRecent([]),
    );
    return () => {
      live = false;
    };
  }, []);

  const list = useMemo(() => {
    const q = value.trim().toLowerCase().replace(/^@/, '');
    return (recent ?? []).filter((r) => (platform === 'Boshqa' || r.platform === platform) && (!q || r.target.toLowerCase().includes(q) || (r.username ?? '').includes(q))).slice(0, 8);
  }, [recent, value, platform]);

  const hide = async (key: string) => {
    setRecent((r) => (r ?? []).filter((x) => x.target_key !== key));
    await smmTargetHide(key).catch(() => undefined);
  };

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label} <span className="text-danger">*</span>
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="https://… yoki @username"
        inputMode="url"
        autoComplete="off"
        required
        role="combobox"
        aria-expanded={open && list.length > 0}
        aria-controls={`${id}-list`}
        className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent"
      />
      {open && list.length ? (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {list.map((r) => (
            <li key={r.target_key} className="flex items-center gap-1">
              <button
                type="button"
                role="option"
                aria-selected={value === r.target}
                onClick={() => {
                  onChange(r.target);
                  setOpen(false);
                }}
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="block truncate text-sm font-medium">{r.username ? `@${r.username}` : r.target}</span>
                <span className="block truncate text-[12px] text-muted">
                  {r.kind === 'post' ? 'Post / reels · ' : ''}
                  {r.username ? `${r.target} · ` : ''}oxirgi: {formatShortDateTime(r.last_used_at)}
                </span>
              </button>
              <button type="button" onClick={() => void hide(r.target_key)} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Takliflardan olib tashlash">
                <Icon name="x" size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Refill countdown: server timestamps, ticking locally (no request per second)
// ---------------------------------------------------------------------------------------------------------------
export function RefillTerm({ policy, acceptedAt, completedAt }: { policy: RefillPolicy | null; acceptedAt: string | null; completedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const clock = refillClock(policy, acceptedAt, completedAt, now);
  const running = clock.kind === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => document.visibilityState === 'visible' && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (clock.kind === 'unverified' || clock.kind === 'waiting')
    return (
      <span className="text-muted">
        Kafolat: <b className="font-medium text-ink">{clock.label}</b>
      </span>
    );
  return (
    <span>
      Kafolat ({policy?.days} kun, {policy?.starts === 'accepted' ? 'qabul qilingandan' : 'bajarilgandan'}):{' '}
      {clock.kind === 'running' ? (
        <b className="font-semibold tabular-nums" aria-live="off">
          {formatRemaining(clock.remainingMs)}
        </b>
      ) : (
        <b className="font-semibold text-muted">Muddat tugadi</b>
      )}
      <span className="text-muted">
        {' '}
        · {formatShortDateTime(new Date(clock.startsAt).toISOString())} → {formatShortDateTime(new Date(clock.expiresAt).toISOString())}
        {clock.startEstimated ? ' (boshlanish — bajarilgani aniqlangan vaqt)' : ''}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Follower history: one measured series on a true time axis
// ---------------------------------------------------------------------------------------------------------------
export function FollowerChart({ points, height = 180, compact = false }: { points: FollowerPoint[]; height?: number; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = compact ? { l: 4, r: 4, t: 8, b: 8 } : { l: 52, r: 16, t: 14, b: 26 };
  const geo = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => Date.parse(p.at));
    const ys = points.map((p) => p.followers);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    const span = Math.max(1, y1 - y0);
    y0 = Math.max(0, Math.floor(y0 - span * 0.15));
    y1 = Math.ceil(y1 + span * 0.15);
    const sx = (t: number) => (x1 === x0 ? (pad.l + W - pad.r) / 2 : pad.l + ((t - x0) / (x1 - x0)) * (W - pad.l - pad.r));
    const sy = (v: number) => pad.t + (1 - (v - y0) / Math.max(1, y1 - y0)) * (height - pad.t - pad.b);
    return { xs, sx, sy, y0, y1, x0, x1 };
  }, [points, height, pad.l, pad.r, pad.t, pad.b]);

  if (!geo) return <p className="text-sm text-muted">Ma’lumot olinmagan — hali kuzatuv yo‘q.</p>;
  const { sx, sy, y0, y1, xs } = geo;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(p.followers).toFixed(1)}`).join(' ');
  const ticks = compact ? [] : [y0, Math.round((y0 + y1) / 2), y1];
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Obunachilar soni: ${points.length} ta kuzatuv, oxirgisi ${nf(points[points.length - 1].followers)}`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          for (let i = 1; i < points.length; i++) if (Math.abs(sx(xs[i]) - x) < Math.abs(sx(xs[best]) - x)) best = i;
          setHover(best);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {nf(t)}
            </text>
          </g>
        ))}
        {!compact ? (
          <>
            <text x={pad.l} y={height - 6} className="fill-muted text-[11px]">
              {formatShortDateTime(points[0].at)}
            </text>
            {points.length > 1 ? (
              <text x={W - pad.r} y={height - 6} textAnchor="end" className="fill-muted text-[11px]">
                {formatShortDateTime(points[points.length - 1].at)}
              </text>
            ) : null}
          </>
        ) : null}
        {h ? <line x1={sx(xs[hover!])} x2={sx(xs[hover!])} y1={pad.t} y2={height - pad.b} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" /> : null}
        <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.at + i} cx={sx(xs[i])} cy={sy(p.followers)} r={hover === i ? 5.5 : compact ? 3 : 4} className="fill-accent stroke-surface" strokeWidth={2} />
        ))}
      </svg>
      {h && !compact ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-md"
          style={{ left: `${(sx(xs[hover!]) / W) * 100}%` }}
        >
          <p className="font-semibold tabular-nums">{nf(h.followers)} obunachi</p>
          <p className="text-muted">
            {formatShortDateTime(h.at)} · {h.source === 'manual' ? 'qo‘lda' : 'API'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SourceBadge({ source }: { source: 'manual' | 'instagram_api' }) {
  return <Badge tone={source === 'manual' ? 'neutral' : 'info'}>{source === 'manual' ? 'Qo‘lda kiritilgan' : 'Instagram API'}</Badge>;
}
