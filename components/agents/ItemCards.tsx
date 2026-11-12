import Link from 'next/link';

import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { KIND_LABEL, STATUS_LABEL, type ItemStatus } from '@/lib/agents/core';
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

/** Material kartalari (kichik rasmlar bilan). */
export function ItemCards({ items, empty }: { items: ItemView[]; empty: string }) {
  if (!items.length) return <EmptyRow>{empty}</EmptyRow>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <Link key={it.id} href={`/agents/kontent/${it.id}`} className="group shadow-card flex gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong">
          <div className="flex shrink-0 gap-1">
            {it.thumbs.length ? (
              it.thumbs.slice(0, it.kind === 'story' ? 3 : 1).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" className={`${it.kind === 'story' ? 'h-24 w-[54px]' : 'h-24 w-[77px]'} rounded-lg border border-line object-cover`} />
              ))
            ) : (
              <div className="flex h-24 w-[54px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-subtle">—</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={it.status} />
              {it.provider === 'local' ? <Badge tone="warning">lokal rejim</Badge> : null}
            </div>
            <p className="mt-1.5 truncate text-sm font-semibold group-hover:text-accent">{it.profileName}</p>
            <p className="text-[13px] text-muted">
              {KIND_LABEL[it.kind]} · {formatShortDateTime(it.scheduledAt)}
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] text-subtle">{it.title || it.lastError || 'Hali tayyorlanmagan'}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
