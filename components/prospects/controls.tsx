'use client';

import { useState } from 'react';

import { formatShortDateTime } from '@/lib/time';
import type { StudioAnalysis } from './types';

export function CopyButton({ text, label = 'Nusxa olish' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        });
      }}
      className="h-10 rounded-full border border-white/12 px-4 text-[13px] text-[#d9d9de] transition-colors hover:border-[#d4fc18]/50 hover:text-[#d4fc18]"
    >
      {done ? 'Nusxa olindi ✓' : label}
    </button>
  );
}

/** Earlier analyses of the same kind: pick one to read again. */
export function HistoryPicker({ analyses, current, onPick }: { analyses: StudioAnalysis[]; current: string; onPick: (id: string) => void }) {
  if (analyses.length < 2) return null;
  return (
    <select
      value={current}
      onChange={(e) => onPick(e.target.value)}
      aria-label="Avvalgi tahlillar"
      className="h-10 rounded-full border border-white/12 bg-[#0b0b0c] px-4 text-[13px] text-[#d9d9de] outline-none focus:border-[#d4fc18]"
    >
      {analyses.map((a, i) => (
        <option key={a.id} value={a.id}>
          {i === 0 ? 'Oxirgi tahlil' : `${analyses.length - i}-tahlil`} · {formatShortDateTime(a.created_at)}
        </option>
      ))}
    </select>
  );
}
