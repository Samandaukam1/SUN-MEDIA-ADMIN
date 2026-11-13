import type { Metadata } from 'next';

import { ItemCards } from '@/components/agents/ItemCards';
import { db } from '@/lib/agents/server';
import { itemsWhere } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Tasdiqlash — AI agent' };

const STATUSES: Record<string, string[]> = {
  kutmoqda: ['pending_approval'],
  sifat: ['qa_failed'],
  tahrir: ['needs_fix', 'regenerating'],
  hammasi: ['pending_approval', 'qa_failed', 'needs_fix', 'regenerating'],
};

/** The review queue: every item approved on its own; filter by client, kind, date, status. */
export default async function ApprovalQueue({ searchParams }: { searchParams: Promise<{ mijoz?: string; tur?: string; holat?: string; dan?: string; gacha?: string }> }) {
  const sp = await searchParams;
  const { data: profiles } = await db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name');
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const items = await itemsWhere({
    statuses: STATUSES[sp.holat ?? 'hammasi'] ?? STATUSES.hammasi,
    profileId: (profiles ?? []).some((p) => p.id === sp.mijoz) ? sp.mijoz : undefined,
    kind: sp.tur === 'story' || sp.tur === 'carousel' ? sp.tur : undefined,
    from: date(sp.dan),
    to: date(sp.gacha),
    limit: 120,
  });
  const sel = 'h-10 rounded-xl border border-line bg-surface px-3 text-sm';
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <select name="mijoz" defaultValue={sp.mijoz ?? ''} className={sel} aria-label="Mijoz">
          <option value="">Barcha mijozlar</option>
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="tur" defaultValue={sp.tur ?? ''} className={sel} aria-label="Turi">
          <option value="">Story va karusel</option>
          <option value="story">Story</option>
          <option value="carousel">Karusel</option>
        </select>
        <select name="holat" defaultValue={sp.holat ?? 'hammasi'} className={sel} aria-label="Holat">
          <option value="hammasi">Hammasi</option>
          <option value="kutmoqda">Tasdiq kutmoqda</option>
          <option value="sifat">Sifat muammosi</option>
          <option value="tahrir">Tahrirda</option>
        </select>
        <input type="date" name="dan" defaultValue={sp.dan ?? ''} className={sel} aria-label="Sanadan" />
        <input type="date" name="gacha" defaultValue={sp.gacha ?? ''} className={sel} aria-label="Sanagacha" />
        <button className="h-10 rounded-xl border border-line px-4 text-sm">Ko‘rsatish</button>
      </form>
      <ItemCards items={items} empty="Navbat bo‘sh." />
    </div>
  );
}
