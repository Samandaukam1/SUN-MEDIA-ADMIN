import type { Metadata } from 'next';
import Link from 'next/link';

import { ProfileForm } from '@/components/agents/forms';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { db, signed } from '@/lib/agents/server';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijozlar — AI agent' };

const STATUS = { active: { label: 'Faol', tone: 'success' }, paused: { label: 'Pauza', tone: 'warning' }, archived: { label: 'Arxiv', tone: 'neutral' } } as const;

export default async function AgentProfiles({ searchParams }: { searchParams: Promise<{ yangi?: string }> }) {
  const sp = await searchParams;
  const [{ data: profiles }, { data: logos }, { data: clients }, { data: briefs }] = await Promise.all([
    db().from('agent_profiles').select('id, name, instagram_username, industry, status, emergency_pause, stories_per_day, carousel_every_days, carousel_enabled, story_times').neq('status', 'archived').order('name'),
    db().from('agent_assets').select('profile_id, storage_path').eq('kind', 'logo').is('archived_at', null),
    db().from('clients').select('id, name').order('name').limit(500),
    db().from('brief_sessions').select('id, company_hint, completed_at, prospect:prospects(name)').eq('status', 'completed').order('completed_at', { ascending: false }).limit(50),
  ]);
  const logoOf = new Map((logos ?? []).map((l) => [l.profile_id, l.storage_path]));
  const urls = await signed([...logoOf.values()]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Har bir mijozning alohida Brand DNA’si, fayllari, jadvali va tasdiqlari bor.</p>
        <Link href="/agents/profillar?yangi=1" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
          + Yangi mijoz
        </Link>
      </div>
      {sp.yangi ? (
        <section>
          <SectionTitle>Yangi mijoz</SectionTitle>
          <ProfileForm
            today={agencyDateKey()}
            clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
            briefs={(briefs ?? []).map((b) => ({ id: b.id, label: `${(b.prospect as { name?: string } | null)?.name ?? b.company_hint ?? 'Nomsiz'} · ${(b.completed_at ?? '').slice(0, 10)}` }))}
          />
        </section>
      ) : null}
      {(profiles ?? []).length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(profiles ?? []).map((p) => {
            const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.active;
            const logo = logoOf.get(p.id);
            return (
              <li key={p.id}>
                <Link href={`/agents/profillar/${p.id}`} className="block">
                  <Card className="flex items-center gap-4 transition-colors hover:border-accent">
                    {logo && urls[logo] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[logo]} alt="" className="size-14 shrink-0 rounded-xl border border-line bg-white object-contain p-1.5" loading="lazy" />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-[11px] text-subtle">logo yo‘q</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{[p.instagram_username ? `@${p.instagram_username}` : null, p.industry].filter(Boolean).join(' · ') || '—'}</p>
                      <p className="text-[12px] text-subtle">
                        {p.story_times.length ? `${p.story_times.length} Story/kun (${p.story_times.map((t) => t.slice(0, 5)).join(', ')})` : `${p.stories_per_day} Story/kun`} · {p.carousel_enabled ? `karusel har ${p.carousel_every_days} kunda` : 'faqat Story'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      {p.emergency_pause ? <Badge tone="danger">To‘xtatilgan</Badge> : null}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="py-10 text-center text-sm text-muted">Hali mijoz yo‘q. “Yangi mijoz” orqali qo‘shing — mavjud “Mijoz tahlili”dan to‘ldirish mumkin.</Card>
      )}
    </div>
  );
}
