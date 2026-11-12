import type { Metadata } from 'next';
import Link from 'next/link';

import { ProfileForm } from '@/components/agents/forms';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { db, signed } from '@/lib/agents/server';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Agents · Profillar' };
export const dynamic = 'force-dynamic';

export default async function AgentProfiles({ searchParams }: { searchParams: Promise<{ yangi?: string; arxiv?: string; ig?: string }> }) {
  const { yangi, arxiv, ig } = await searchParams;
  const q = db().from('agent_profiles').select('id, name, instagram_username, business, status, auto_publish, approval_mode, stories_per_day, story_time, post_time, post_start_date').order('name');
  const { data: profiles } = arxiv ? await q : await q.neq('status', 'archived');
  const { data: logos } = await db().from('agent_assets').select('profile_id, storage_path').eq('kind', 'logo').order('created_at', { ascending: false });
  const logoOf = new Map<string, string>();
  for (const l of logos ?? []) if (!logoOf.has(l.profile_id)) logoOf.set(l.profile_id, l.storage_path);
  const urls = await signed([...logoOf.values()]);
  const { data: conns } = await db().from('agent_ig_connections').select('profile_id, status');
  const connected = new Set((conns ?? []).filter((c) => c.status === 'connected').map((c) => c.profile_id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profillar"
        crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Profillar' }]}
        description="Har bir Instagram profili — alohida ko‘rsatmalar, logo, faktlar va xotira. Boshqa profil ma’lumoti aralashmaydi."
        actions={
          <>
            {!yangi ? (
              <ButtonLink href="/agents/profillar?yangi=1" variant="primary">
                + Profil qo‘shish
              </ButtonLink>
            ) : null}
            <ButtonLink href={arxiv ? '/agents/profillar' : '/agents/profillar?arxiv=1'} variant="ghost">
              {arxiv ? 'Arxivsiz' : 'Arxiv bilan'}
            </ButtonLink>
          </>
        }
      />
      {ig === 'state' ? <Notice tone="danger">Instagram ulanish havolasi eskirgan yoki boshqa akkauntdan ochilgan. Qayta urinib ko‘ring.</Notice> : null}
      {yangi ? (
        <div className="max-w-4xl">
          <Notice tone="info" title="Majburiy maydon — faqat nom">
            Instagram sahifasi, telefon va logo kiritilsa, rasmlarda aniq ko‘rinadi. Qolganini keyin to‘ldirsangiz ham bo‘ladi. Standart: kuniga 3 story kadri 09:00 da, kunora post 08:00 da, avval inson tasdig‘i, avto-nashr o‘chiq.
          </Notice>
          <div className="mt-4">
            <ProfileForm today={agencyDateKey()} />
          </div>
        </div>
      ) : null}
      {profiles?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => (
            <Link key={p.id} href={`/agents/profillar/${p.id}`} className="group">
              <Card className="flex h-full gap-4 transition-colors group-hover:border-line-strong">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2">
                  {logoOf.has(p.id) && urls[logoOf.get(p.id)!] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[logoOf.get(p.id)!]} alt="" className="size-full object-contain p-1" />
                  ) : (
                    <span className="text-lg font-bold text-subtle">{p.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
                  <p className="truncate text-[13px] text-muted">{[p.instagram_username ? `@${p.instagram_username}` : null, p.business].filter(Boolean).join(' · ') || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.status === 'active' ? <Badge tone="success">Faol</Badge> : p.status === 'paused' ? <Badge tone="warning">Pauza</Badge> : <Badge>Arxiv</Badge>}
                    {connected.has(p.id) ? <Badge tone="info">Instagram</Badge> : null}
                    {p.auto_publish ? <Badge tone="violet">avto-nashr</Badge> : null}
                    {p.approval_mode === 'auto' ? <Badge tone="accent">avto-tasdiq</Badge> : null}
                  </div>
                  <p className="mt-2 text-[12px] text-subtle">
                    Story {p.stories_per_day} ta · {p.story_time.slice(0, 5)} · post kunora {p.post_time.slice(0, 5)}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : !yangi ? (
        <EmptyRow>Hali profil yo‘q. “+ Profil qo‘shish” — nom kifoya, qolganini keyin to‘ldirasiz.</EmptyRow>
      ) : null}
    </div>
  );
}
