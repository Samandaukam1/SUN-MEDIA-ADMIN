import type { Metadata } from 'next';
import Link from 'next/link';

import { STATUS_LABEL, type ItemStatus } from '@/lib/agents/core';
import { db } from '@/lib/agents/server';
import { itemsWhere, type ItemView } from '@/lib/agents/views';
import { addDaysToKey, agencyDateKey, formatMonthKey, isDateKey, weekStartKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Kontent reja — AI agent' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  neutral: 'bg-surface-2 text-muted',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent-on-soft',
  violet: 'bg-violet-soft text-violet',
};
const WD = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function Chip({ it }: { it: ItemView }) {
  const s = STATUS_LABEL[it.status as ItemStatus] ?? { label: it.status, tone: 'neutral' };
  return (
    <Link href={`/agents/kontent/${it.id}`} title={`${it.profileName} · ${s.label}`} className={`block truncate rounded-md px-1.5 py-0.5 text-[11px] ${TONE[s.tone]}`}>
      {it.kind === 'story' ? 'S' : 'K'} · {it.profileName}
    </Link>
  );
}

/** The editorial calendar: planned and actual statuses, month or week, per client. */
export default async function AgentCalendar({ searchParams }: { searchParams: Promise<{ sana?: string; korinish?: string; mijoz?: string; tur?: string }> }) {
  const sp = await searchParams;
  const today = agencyDateKey();
  const base = isDateKey(sp.sana) ? sp.sana : today;
  const week = sp.korinish === 'hafta';
  const monthFirst = `${base.slice(0, 7)}-01`;
  const from = week ? weekStartKey(base) : weekStartKey(monthFirst);
  const days = Array.from({ length: week ? 7 : 42 }, (_, i) => addDaysToKey(from, i));
  const to = days[days.length - 1];
  const [{ data: profiles }] = await Promise.all([db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name')]);
  const profile = (profiles ?? []).some((p) => p.id === sp.mijoz) ? sp.mijoz : undefined;
  const kind = sp.tur === 'story' || sp.tur === 'carousel' ? sp.tur : undefined;
  const items = await itemsWhere({ from, to, profileId: profile, kind, limit: 800 });
  const byDay = new Map<string, ItemView[]>();
  for (const it of items) byDay.set(it.targetDate, [...(byDay.get(it.targetDate) ?? []), it]);
  const q = (o: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ sana: base, korinish: week ? 'hafta' : undefined, mijoz: profile, tur: kind, ...o })) if (v) s.set(k, v);
    return `/agents/taqvim?${s}`;
  };
  const prev = week ? addDaysToKey(base, -7) : addDaysToKey(monthFirst, -1);
  const next = week ? addDaysToKey(base, 7) : addDaysToKey(`${addDaysToKey(monthFirst, 32).slice(0, 7)}-01`, 0);
  const sel = 'h-9 rounded-xl border border-line bg-surface px-3 text-sm';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={q({ sana: prev })} className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Oldingi">
            ←
          </Link>
          <p className="min-w-40 text-center font-semibold">{week ? `${from} — ${to}` : formatMonthKey(monthFirst)}</p>
          <Link href={q({ sana: next })} className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Keyingi">
            →
          </Link>
          <Link href={q({ sana: today })} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink">
            Bugun
          </Link>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="sana" value={base} />
          <select name="korinish" defaultValue={week ? 'hafta' : 'oy'} className={sel} aria-label="Ko‘rinish">
            <option value="oy">Oy</option>
            <option value="hafta">Hafta</option>
          </select>
          <select name="mijoz" defaultValue={profile ?? ''} className={sel} aria-label="Mijoz">
            <option value="">Barcha mijozlar</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="tur" defaultValue={kind ?? ''} className={sel} aria-label="Turi">
            <option value="">Hammasi</option>
            <option value="story">Story</option>
            <option value="carousel">Karusel</option>
          </select>
          <button className="h-9 rounded-xl border border-line px-3 text-sm">Ko‘rsatish</button>
        </form>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[12px] text-muted">
        {WD.map((d) => (
          <div key={d} className="px-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const other = !week && d.slice(0, 7) !== monthFirst.slice(0, 7);
          return (
            <div key={d} className={`flex min-h-24 flex-col gap-1 rounded-xl border p-1.5 ${d === today ? 'border-accent' : 'border-line'} ${other ? 'opacity-45' : ''} ${week ? 'min-h-64' : ''}`}>
              <span className="text-[11px] text-subtle">{Number(d.slice(8))}</span>
              {list.slice(0, week ? 20 : 4).map((it) => (
                <Chip key={it.id} it={it} />
              ))}
              {list.length > (week ? 20 : 4) ? <span className="text-[11px] text-subtle">+{list.length - 4}</span> : null}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-subtle">S — Story, K — karusel. Rang — holat (reja, tasdiq kutmoqda, tayyor, xato).</p>
    </div>
  );
}
