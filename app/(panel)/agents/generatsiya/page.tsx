import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionButton } from '@/components/agents/controls';
import { AutoRefresh } from '@/components/agents/AutoRefresh';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { jobsList } from '@/lib/agents/views';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Generatsiya — AI agent' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { generate: 'Yaratish', regenerate: 'Qayta yaratish', edit: 'Tahrir', slide: 'Slayd', research: 'Trend tadqiqoti' };
const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  queued: { label: 'Navbatda', tone: 'neutral' },
  running: { label: 'Bajarilmoqda', tone: 'info' },
  done: { label: 'Tayyor', tone: 'success' },
  failed: { label: 'Xato', tone: 'danger' },
  cancelled: { label: 'Bekor qilingan', tone: 'warning' },
};

/** Background jobs: what runs, what waits, what failed (with the real error) — retry or cancel by hand. */
export default async function Jobs({ searchParams }: { searchParams: Promise<{ holat?: string }> }) {
  const sp = await searchParams;
  const filter = sp.holat && STATUS[sp.holat] ? [sp.holat] : undefined;
  const jobs = await jobsList(filter, 150);
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={active} seconds={10} />
      <div className="flex flex-wrap gap-2 text-[13px]">
        {[['', 'Hammasi'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <Link key={k} href={k ? `/agents/generatsiya?holat=${k}` : '/agents/generatsiya'} className={`rounded-full border px-3 py-1 ${(sp.holat ?? '') === k ? 'border-accent bg-accent-soft' : 'border-line text-muted'}`}>
            {l}
          </Link>
        ))}
      </div>
      {jobs.length ? (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {j.profileName} · {KIND[j.kind] ?? j.kind}
                    {j.itemKind ? ` · ${j.itemKind === 'story' ? 'Story' : 'Karusel'} ${j.itemDate ?? ''}` : ''}
                  </p>
                  <p className="text-[12px] text-muted">
                    {formatShortDateTime(j.created_at)} · urinish {j.attempts}
                    {j.progress ? ` · ${j.progress}` : ''}
                  </p>
                  {j.error && j.status !== 'done' ? <p className="mt-1 text-[12.5px] text-danger">{j.error}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS[j.status]?.tone ?? 'neutral'} dot>
                    {STATUS[j.status]?.label ?? j.status}
                  </Badge>
                  {j.item_id ? (
                    <Link href={`/agents/kontent/${j.item_id}`} className="text-[13px] text-accent-on-soft">
                      Ochish
                    </Link>
                  ) : null}
                  {j.status === 'failed' || j.status === 'cancelled' ? <ActionButton act={{ kind: 'retry', jobId: j.id }}>Qayta</ActionButton> : null}
                  {j.status === 'queued' ? (
                    <ActionButton act={{ kind: 'cancel', jobId: j.id }} variant="ghost">
                      Bekor
                    </ActionButton>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="py-10 text-center text-sm text-muted">Ishlar yo‘q.</Card>
      )}
    </div>
  );
}
