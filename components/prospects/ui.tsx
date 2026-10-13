import type { ReactNode } from 'react';

/** Website-style building blocks for the prospect studio. */
export const display = 'font-[family-name:var(--font-unbounded)] tracking-[-0.03em]';

export function GlassCard({ children, className = '', glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div
      className={`relative rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.065),rgb(255_255_255/0.015))] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_24px_60px_-30px_rgb(0_0_0/0.85)] backdrop-blur-xl sm:p-7 ${
        glow ? 'shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_0_0_1px_rgb(212_252_24/0.45),0_30px_90px_-35px_rgb(212_252_24/0.45)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] font-semibold tracking-[0.2em] text-[#d4fc18] uppercase">{children}</p>;
}

export function BulletList({ items, tone = 'lime' }: { items: string[]; tone?: 'lime' | 'red' | 'silver' }) {
  if (!items.length) return <p className="text-[14px] text-[#6e6e76]">—</p>;
  const dot = tone === 'red' ? 'bg-[#ff8a8a]' : tone === 'silver' ? 'bg-[#c9c9ce]' : 'bg-[#d4fc18]';
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-[#e4e4e7]">
          <span className={`mt-[9px] size-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'Yangi', cls: 'bg-white/[0.08] text-[#d9d9de]' },
  analyzed: { label: 'Tahlil qilingan', cls: 'bg-[#d4fc18]/14 text-[#d4fc18]' },
  won: { label: 'Mijoz bo‘ldi', cls: 'bg-emerald-400/15 text-emerald-300' },
  lost: { label: 'Rad etdi', cls: 'bg-[#ff8a8a]/12 text-[#ff9c9c]' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.new;
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold ${s.cls}`}>{s.label}</span>;
}

export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));
