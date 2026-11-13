import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, SectionTitle } from '@/components/ui/Card';
import { FORMATS } from '@/lib/agents/creative';
import { buildInsights, type GroupStat, type MetricRow } from '@/lib/agents/insights';
import { db } from '@/lib/agents/server';
import { OBJECTIVES } from '@/lib/agents/strategy';

export const metadata: Metadata = { title: 'Tahlil — AI agent' };

const LABELS: Record<string, string> = { ...Object.fromEntries(FORMATS.map((f) => [f.key, f.name])), ...OBJECTIVES, story: 'Story', carousel: 'Karusel' };

/** A horizontal bar per group (one measure on one axis): average engagement, with the sample size beside it. */
function Bars({ groups }: { groups: GroupStat[] }) {
  const max = Math.max(0.1, ...groups.map((g) => g.engagement ?? 0));
  if (!groups.length) return <p className="text-sm text-muted">Ma’lumot yo‘q.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((g) => (
        <li key={g.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={LABELS[g.key] ?? g.key}>
            {LABELS[g.key] ?? g.key}
          </span>
          <span className="h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${LABELS[g.key] ?? g.key}: ${g.engagement ?? 0}%`}>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${((g.engagement ?? 0) / max) * 100}%` }} />
          </span>
          <span className="text-[12px] whitespace-nowrap text-muted tabular-nums">
            {g.engagement !== null ? `${g.engagement}%` : '—'} · n={g.n}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function Analytics({ searchParams }: { searchParams: Promise<{ mijoz?: string }> }) {
  const sp = await searchParams;
  const { data: profiles } = await db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name');
  const profile = (profiles ?? []).find((p) => p.id === sp.mijoz);
  let q = db().from('agent_metrics').select('item_id, reach, views, likes, comments, shares, saves, leads, item:agent_items(kind, plan)').order('created_at', { ascending: false }).limit(1000);
  if (profile) q = q.eq('profile_id', profile.id);
  const { data } = await q;
  const rows: MetricRow[] = (data ?? []).map((m) => {
    const it = m.item as unknown as { kind: string; plan: { format?: string; objective?: string } } | null;
    return { itemId: m.item_id, kind: it?.kind ?? '', format: it?.plan?.format ?? null, objective: it?.plan?.objective ?? null, reach: m.reach, views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, leads: m.leads };
  });
  const ins = buildInsights(rows, LABELS);
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="mijoz" defaultValue={profile?.id ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mijoz">
          <option value="">Barcha mijozlar</option>
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-xl border border-line px-4 text-sm">Ko‘rsatish</button>
      </form>
      <Card className="text-[13px] text-muted">
        Faqat qo‘lda kiritilgan, tasdiqlangan raqamlar (Instagram Insights, Meta Business Suite, CRM) asosida. Jalb = (layk + izoh + ulashish + saqlash) / qamrov. Xulosa uchun guruhda kamida 3 ta material kerak.{' '}
        <Link href="/agents/tayyor?joylangan=1" className="text-accent-on-soft underline">
          Natija kiritish uchun joylangan kontent
        </Link>
      </Card>
      <Card className="flex flex-col gap-2">
        <SectionTitle>Tavsiyalar</SectionTitle>
        {ins.recommendations.length ? (
          <ul className="list-disc pl-5 text-sm">
            {ins.recommendations.map((r) => (
              <li key={r.text}>
                {r.text} <span className="text-subtle">({r.basis})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ishonchli xulosa uchun ma’lumot yetarli emas.</p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>Format bo‘yicha jalb</SectionTitle>
          <Bars groups={ins.byFormat} />
        </Card>
        <Card>
          <SectionTitle>Maqsad bo‘yicha jalb</SectionTitle>
          <Bars groups={ins.byObjective} />
        </Card>
        <Card>
          <SectionTitle>Story va karusel</SectionTitle>
          <Bars groups={ins.byKind} />
        </Card>
      </div>
    </div>
  );
}
