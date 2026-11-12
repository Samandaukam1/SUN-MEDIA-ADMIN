import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/agents/ItemCards';
import { PageHeader } from '@/components/panel/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { KIND_LABEL } from '@/lib/agents/core';
import { db } from '@/lib/agents/server';
import { itemsWhere } from '@/lib/agents/views';
import { addDaysToKey, agencyDateKey, formatDateKeyLong, formatTime, isDateKey, weekStartKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Agents · Taqvim' };
export const dynamic = 'force-dynamic';

export default async function AgentCalendar({ searchParams }: { searchParams: Promise<{ sana?: string; korinish?: string; profil?: string; tur?: string }> }) {
  const sp = await searchParams;
  const today = agencyDateKey();
  const base = isDateKey(sp.sana) ? sp.sana : today;
  const day = sp.korinish === 'kun';
  const from = day ? base : weekStartKey(base);
  const to = day ? base : addDaysToKey(from, 6);
  const profile = sp.profil && /^[0-9a-f-]{36}$/i.test(sp.profil) ? sp.profil : undefined;
  const kind = sp.tur === 'story' || sp.tur === 'post' ? sp.tur : undefined;
  const [items, { data: profiles }] = await Promise.all([itemsWhere({ from, to, profileId: profile, kind, limit: 400 }), db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name')]);
  const days = Array.from({ length: day ? 1 : 7 }, (_, i) => addDaysToKey(from, i));
  const q = (o: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const m = { sana: base, korinish: day ? 'kun' : undefined, profil: profile, tur: kind, ...o };
    for (const [k, v] of Object.entries(m)) if (v) s.set(k, v);
    return `/agents/taqvim?${s}`;
  };
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-sm', on ? 'border-ink bg-ink text-surface' : 'border-line text-muted hover:text-ink');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kontent taqvimi"
        crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Taqvim' }]}
        actions={
          <>
            <ButtonLink href={q({ sana: addDaysToKey(base, day ? -1 : -7) })}>←</ButtonLink>
            <ButtonLink href={q({ sana: today })}>Bugun</ButtonLink>
            <ButtonLink href={q({ sana: addDaysToKey(base, day ? 1 : 7) })}>→</ButtonLink>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Link href={q({ korinish: undefined })} className={chip(!day)}>
          Haftalik
        </Link>
        <Link href={q({ korinish: 'kun' })} className={chip(day)}>
          Kunlik
        </Link>
        <span className="mx-1 w-px bg-line" />
        <Link href={q({ tur: undefined })} className={chip(!kind)}>
          Barcha formatlar
        </Link>
        <Link href={q({ tur: 'story' })} className={chip(kind === 'story')}>
          Story
        </Link>
        <Link href={q({ tur: 'post' })} className={chip(kind === 'post')}>
          Post
        </Link>
        <span className="mx-1 w-px bg-line" />
        <Link href={q({ profil: undefined })} className={chip(!profile)}>
          Barcha profillar
        </Link>
        {(profiles ?? []).map((p) => (
          <Link key={p.id} href={q({ profil: p.id })} className={chip(profile === p.id)}>
            {p.name}
          </Link>
        ))}
      </div>
      <div className={cn('grid gap-3', day ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-7')}>
        {days.map((d) => {
          const list = items.filter((i) => i.targetDate === d);
          return (
            <div key={d} className={cn('min-h-40 rounded-2xl border bg-surface p-3', d === today ? 'border-accent' : 'border-line')}>
              <p className="mb-2 text-[13px] font-semibold">{formatDateKeyLong(d)}</p>
              <div className="flex flex-col gap-2">
                {list.length ? (
                  list.map((it) => (
                    <Link key={it.id} href={`/agents/kontent/${it.id}`} className="flex gap-2 rounded-xl bg-surface-2 p-2 hover:bg-line">
                      {it.thumbs[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumbs[0]} alt="" className={cn('shrink-0 rounded-md object-cover', it.kind === 'story' ? 'h-14 w-8' : 'h-14 w-11')} />
                      ) : null}
                      <div className="min-w-0 text-[12px]">
                        <p className="font-semibold">
                          {formatTime(it.scheduledAt)} {KIND_LABEL[it.kind]}
                        </p>
                        <p className="truncate text-muted">{it.profileName}</p>
                        <div className="mt-1">
                          <StatusBadge status={it.status} />
                        </div>
                        {day && it.title ? <p className="mt-1 text-muted">{it.title}</p> : null}
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-[12px] text-subtle">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[13px] text-subtle">Story — har kuni, post — kunora (boshlanish sanasidan har 2 kunda). Materialni ochib tahrirlash, ko‘chirish yoki qayta yaratish mumkin.</p>
    </div>
  );
}
