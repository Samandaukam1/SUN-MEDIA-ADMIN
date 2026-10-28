'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { deleteApplication, setApplicationStatus } from '@/lib/actions/site';
import type { ActionState } from '@/lib/actions/state';
import { formatPhone } from '@/lib/site/types';
import { formatShortDateTime } from '@/lib/time';

export type Application = {
  id: string;
  full_name: string;
  phone: string;
  company: string;
  link_url: string | null;
  service: string;
  message: string;
  instagram: string | null;
  telegram: string | null;
  budget_amount: number | null;
  budget_label: string | null;
  source_path: string;
  /** The ad link's tracking values ({} for the site's own form). */
  attribution?: unknown;
  status: 'new' | 'seen' | 'archived';
  created_at: string;
  handled_at: string | null;
  handler: string | null;
};

/** Where it came from (the /ariza page keeps the ad link's own values). */
const track = (a: Application): Record<string, string> => (a.attribution && typeof a.attribution === 'object' && !Array.isArray(a.attribution) ? (a.attribution as Record<string, string>) : {});
const utm = (a: Application) =>
  (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const)
    .filter((k) => track(a)[k])
    .map((k) => `${k.replace('utm_', '')}: ${track(a)[k]}`)
    .concat(track(a).fbclid ? ['fbclid ✓'] : [])
    .join(' · ');

const STATUS = {
  new: { label: 'Yangi', tone: 'accent' },
  seen: { label: 'Ko‘rildi', tone: 'success' },
  archived: { label: 'Arxivda', tone: 'neutral' },
} as const;

/** "Arizalar": what came in from the site. Mark as seen, archive, or delete — nothing more (no CRM). */
export function ApplicationsInbox({ items }: { items: Application[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Application | null>(null);

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const result = await fn();
      setError(result.status === 'error' ? result.message : null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger" title={error} /> : null}
      {items.map((a) => (
        <Card key={a.id} className={cn('space-y-4', a.status === 'new' && 'border-accent/40 ring-1 ring-accent/20', a.status === 'archived' && 'opacity-70')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold tracking-tight">{a.full_name}</p>
                <Badge tone={STATUS[a.status].tone} dot>
                  {STATUS[a.status].label}
                </Badge>
                {a.service ? <Badge tone="info">{a.service}</Badge> : null}
                {a.budget_label || a.budget_amount ? (
                  <Badge tone="accent">Byudjet: {a.budget_label || `${Number(a.budget_amount).toLocaleString('ru-RU')} so‘m`}</Badge>
                ) : null}
                {track(a).channel ? <Badge tone="info">{track(a).channel}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {formatShortDateTime(a.created_at)} · {a.source_path}
                {a.company ? ` · Brend: ${a.company}` : ''}
              </p>
              {utm(a) ? <p className="mt-0.5 text-xs break-all text-subtle">{utm(a)}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {a.status === 'new' ? (
                <Button variant="secondary" disabled={pending} onClick={() => run(() => setApplicationStatus(a.id, 'seen'))} icon={<Icon name="check" size={15} />}>
                  Ko‘rildi
                </Button>
              ) : null}
              {a.status !== 'archived' ? (
                <Button variant="ghost" disabled={pending} onClick={() => run(() => setApplicationStatus(a.id, 'archived'))}>
                  Arxivga
                </Button>
              ) : (
                <Button variant="ghost" disabled={pending} onClick={() => run(() => setApplicationStatus(a.id, 'new'))}>
                  Qaytarish
                </Button>
              )}
              <Button variant="ghost" className="text-danger" aria-label="O‘chirish" onClick={() => setDeleting(a)}>
                <Icon name="x" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={`tel:${a.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-semibold tabular hover:border-line-strong">
              <Icon name="phone" size={15} /> {formatPhone(a.phone)}
            </a>
            <CopyButton value={a.phone} label="Raqamni nusxalash" />
            {a.instagram ? (
              <a href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm hover:border-line-strong">
                Instagram: <span className="font-semibold">@{a.instagram}</span>
              </a>
            ) : null}
            {a.telegram ? (
              <a href={`https://t.me/${a.telegram}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm hover:border-line-strong">
                Telegram: <span className="font-semibold">@{a.telegram}</span>
              </a>
            ) : null}
            {a.link_url && !a.instagram && !a.telegram ? (
              <a
                href={a.link_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm hover:border-line-strong"
              >
                <Icon name="link" size={15} className="shrink-0" />
                <span className="truncate">{a.link_url.replace(/^https?:\/\//, '')}</span>
                <Icon name="externalLink" size={14} className="shrink-0 text-subtle" />
              </a>
            ) : null}
          </div>

          {a.message ? <p className="rounded-xl bg-surface-2 px-4 py-3 text-[15px] whitespace-pre-line">{a.message}</p> : null}
          {a.handled_at && a.status !== 'new' ? (
            <p className="text-xs text-subtle">
              {STATUS[a.status].label}: {formatShortDateTime(a.handled_at)}
              {a.handler ? ` · ${a.handler}` : ''}
            </p>
          ) : null}
        </Card>
      ))}

      <Dialog open={!!deleting} onClose={() => !pending && setDeleting(null)} title="Ariza o‘chirilsinmi?" description={deleting ? `${deleting.full_name} · ${formatPhone(deleting.phone)} — qaytarib bo‘lmaydi. Saqlab qo‘yish uchun “Arxivga”ni bosing.` : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => setDeleting(null)}>
            Bekor qilish
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                if (!deleting) return;
                const result = await deleteApplication(deleting.id);
                setError(result.status === 'error' ? result.message : null);
                setDeleting(null);
                router.refresh();
              })
            }
          >
            O‘chirish
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
