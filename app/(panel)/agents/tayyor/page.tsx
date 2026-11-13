import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/agents/ItemCards';
import { Card } from '@/components/ui/Card';
import { exportName, KIND_LABEL, type AgentKind } from '@/lib/agents/core';
import { db } from '@/lib/agents/server';
import { itemsWhere } from '@/lib/agents/views';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Tayyor kontent — AI agent' };

/** Approved content, ready for manual posting: each file, or the carousel package. */
export default async function Ready({ searchParams }: { searchParams: Promise<{ mijoz?: string; joylangan?: string }> }) {
  const sp = await searchParams;
  const { data: profiles } = await db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name');
  const profile = (profiles ?? []).some((p) => p.id === sp.mijoz) ? sp.mijoz : undefined;
  const statuses = sp.joylangan === '1' ? ['published_manual'] : ['approved', 'export_ready', 'exported'];
  const items = await itemsWhere({ statuses, profileId: profile, order: 'asc', limit: 120 });
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="mijoz" defaultValue={profile ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mijoz">
          <option value="">Barcha mijozlar</option>
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="joylangan" value="1" defaultChecked={sp.joylangan === '1'} /> Joylanganlar
        </label>
        <button className="h-10 rounded-xl border border-line px-4 text-sm">Ko‘rsatish</button>
      </form>
      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <li key={it.id}>
              <Card className="flex gap-4">
                <div className="flex shrink-0 gap-1">
                  {it.thumbs.slice(0, it.kind === 'story' ? 1 : 2).map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" loading="lazy" className={`rounded-lg border border-line object-cover ${it.kind === 'story' ? 'h-36 w-20' : 'h-28 w-[90px]'}`} />
                  ))}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/agents/kontent/${it.id}`} className="font-semibold hover:underline">
                        {it.profileName}
                      </Link>
                      <p className="text-[12.5px] text-muted">
                        {KIND_LABEL[it.kind as AgentKind]} · joylash {formatShortDateTime(it.scheduledAt)}
                      </p>
                    </div>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: it.slides }, (_, i) => (
                      <a key={i} href={`/api/agents/files/${it.id}?f=${i}`} download className="rounded-lg border border-line px-2 py-1 text-[12px] hover:border-accent">
                        {exportName({ client: it.profileName, date: it.targetDate, kind: it.kind as AgentKind, index: i, slot: it.slot }).replace(/^.*_(STORY|CAROUSEL)_/, '$1 ')}
                      </a>
                    ))}
                    {it.kind !== 'story' ? (
                      <a href={`/api/agents/files/${it.id}?zip=1`} download className="rounded-lg bg-accent px-2 py-1 text-[12px] font-semibold text-accent-fg">
                        ZIP
                      </a>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="py-10 text-center text-sm text-muted">Tayyor kontent yo‘q.</Card>
      )}
    </div>
  );
}
