import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { KIND_LABEL, STATUS_LABEL, type AgentKind, type ItemStatus } from '@/lib/agents/core';
import { OBJECTIVES } from '@/lib/agents/strategy';
import type { ItemView } from '@/lib/agents/views';
import { formatShortDateTime } from '@/lib/time';

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status as ItemStatus] ?? { label: status, tone: 'neutral' as const };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** Content cards: client, kind, slot, objective, thumbnails (small JPEGs), status. */
export function ItemCards({ items, empty }: { items: ItemView[]; empty: string }) {
  if (!items.length) return <Card className="py-10 text-center text-sm text-muted">{empty}</Card>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <li key={it.id}>
          <Link href={`/agents/kontent/${it.id}`} className="block h-full">
            <Card className="flex h-full flex-col gap-3 transition-colors hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{it.profileName}</p>
                  <p className="text-[12.5px] text-muted">
                    {KIND_LABEL[it.kind as AgentKind]}
                    {it.kind === 'story' && it.slot > 1 ? ` #${it.slot}` : ''} · {formatShortDateTime(it.scheduledAt)}
                    {it.versionNo ? ` · v${it.versionNo}` : ''}
                  </p>
                </div>
                <StatusBadge status={it.status} />
              </div>
              {it.thumbs.length ? (
                <div className="flex gap-1.5 overflow-hidden">
                  {it.thumbs.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" loading="lazy" className={`rounded-lg border border-line object-cover ${it.kind === 'story' ? 'h-32 w-[72px]' : 'h-24 w-[77px]'}`} />
                  ))}
                </div>
              ) : null}
              {it.title ? <p className="line-clamp-2 text-[13px]">{it.title}</p> : null}
              <div className="mt-auto flex flex-wrap gap-2 text-[12px] text-muted">
                {it.objective && it.objective in OBJECTIVES ? <span>{OBJECTIVES[it.objective as keyof typeof OBJECTIVES]}</span> : null}
                {it.qaPassed === false ? <span className="text-danger">Sifat muammosi</span> : null}
                {it.lastError ? <span className="line-clamp-1 text-danger">{it.lastError}</span> : null}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
