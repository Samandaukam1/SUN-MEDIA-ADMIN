'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { addContentEquipment, confirmEquipment, setEquipmentPrepared } from '@/lib/actions/workflow';
import { formatShortDateTime } from '@/lib/time';

export type EquipmentCard = {
  contentId: string;
  title: string;
  client: string;
  shootAt: string | null;
  location: string | null;
  readyAt: string | null;
  readyBy: string | null;
  items: { id: string; name: string; prepared: boolean; by: string | null }[];
};

/** One shooting's checklist: tick items as they are packed, then confirm once everything is ready. */
function Checklist({ card, editable }: { card: EquipmentCard; editable: boolean }) {
  const router = useRouter();
  const [items, setItem] = useOptimistic(card.items, (state, change: { id: string; prepared: boolean }) =>
    state.map((i) => (i.id === change.id ? { ...i, prepared: change.prepared } : i)),
  );
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = items.filter((i) => i.prepared).length;
  const all = items.length > 0 && done === items.length;
  const locked = !editable || !!card.readyAt;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.message ?? 'Xatolik.');
      router.refresh();
    });

  return (
    <Card id={card.contentId} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{card.client} syomkasi</p>
          <p className="mt-0.5 text-[13px] text-muted">{[card.title, card.shootAt ? formatShortDateTime(card.shootAt) : null, card.location].filter(Boolean).join(' · ')}</p>
        </div>
        {card.readyAt ? (
          <Badge tone="success" dot>
            Tayyor
          </Badge>
        ) : (
          <Badge tone={done ? 'accent' : 'neutral'}>
            {done} / {items.length}
          </Badge>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              disabled={locked || pending}
              aria-pressed={i.prepared}
              onClick={() =>
                run(async () => {
                  setItem({ id: i.id, prepared: !i.prepared });
                  return setEquipmentPrepared(card.contentId, i.id, !i.prepared);
                })
              }
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default',
                i.prepared ? 'border-success/40 bg-success-soft' : 'border-line hover:bg-surface-2',
              )}
            >
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border', i.prepared ? 'border-success bg-success text-white' : 'border-line-strong')}>
                {i.prepared ? <Icon name="check" size={13} /> : null}
              </span>
              <span className="min-w-0 flex-1 font-medium">{i.name}</span>
              {i.prepared && i.by ? <span className="shrink-0 text-[11.5px] text-muted">{i.by.split(' ')[0]}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {!locked ? (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Yana jihoz qo‘shish"
            aria-label="Yangi jihoz"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent"
          />
          <Button
            variant="secondary"
            disabled={!name.trim()}
            onClick={() =>
              run(async () => {
                const res = await addContentEquipment(card.contentId, name);
                if (res.ok) setName('');
                return res;
              })
            }
            icon={<Icon name="plus" size={16} />}
          >
            Qo‘shish
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {card.readyAt ? (
        <p className="text-[13px] text-muted">
          Tasdiqladi: <span className="font-medium text-ink">{card.readyBy ?? 'Admin'}</span> · {formatShortDateTime(card.readyAt)}
        </p>
      ) : editable ? (
        <Button size="lg" className="w-full" disabled={!all} loading={pending} onClick={() => run(() => confirmEquipment(card.contentId))} icon={<Icon name="checkCircle" size={18} />}>
          Jihozlar tayyor — tasdiqlash
        </Button>
      ) : null}
    </Card>
  );
}

export function EquipmentBoard({ cards, editable }: { cards: EquipmentCard[]; editable: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {cards.map((c) => (
        <Checklist key={c.contentId} card={c} editable={editable} />
      ))}
    </div>
  );
}
