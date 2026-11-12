import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionButton } from '@/components/agents/controls';
import { ItemCards } from '@/components/agents/ItemCards';
import { PageHeader } from '@/components/panel/PageHeader';
import { Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { connectionsStatus, overview } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Agents' };
export const dynamic = 'force-dynamic';

/** Agents → Bosh: faol profillar, bugungi kontent, tasdiq kutayotganlar, rejalashtirilganlar, xatolar va ulanishlar. */
export default async function AgentsHome() {
  const o = await overview();
  const c = connectionsStatus();
  const active = o.profiles.filter((p) => p.status === 'active');
  const conn = new Map(o.connections.map((x) => [x.profile_id, x]));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Agents"
        description="SMM agentlar har bir profil uchun har kuni story va kunora rasmli post tayyorlaydi. Siz tasdiqlaysiz — ular belgilangan vaqtda joylaydi."
        actions={
          <>
            <ButtonLink href="/agents/profillar?yangi=1" variant="primary">
              + Profil qo‘shish
            </ButtonLink>
            {o.settings.publishing_enabled ? (
              <ActionButton act={{ kind: 'publishing', on: false }} variant="danger" confirm="Barcha profillar uchun avtomatik nashr to‘xtatilsinmi?">
                Nashrlarni to‘xtatish
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Faol profillar" value={String(active.length)} />
        <Stat label="Bugungi materiallar" value={String(o.todayItems.length)} />
        <Stat label="Tasdiq kutmoqda" value={String(o.pending.length)} tone={o.pending.length ? 'warning' : 'default'} />
        <Stat label="Rejalashtirilgan" value={String(o.upcoming.length)} />
        <Stat label="Bugun joylandi" value={String(o.publishedToday)} tone="success" />
        <Stat label="Xatolar" value={String(o.problems.length)} tone={o.problems.length ? 'danger' : 'default'} />
      </div>

      <section>
        <SectionTitle action={<Link href="/agents/tasdiqlash" className="text-sm font-medium text-accent">Barchasi →</Link>}>Tasdiq kutmoqda</SectionTitle>
        <ItemCards items={o.pending} empty="Tasdiq kutayotgan material yo‘q." />
      </section>
      <section>
        <SectionTitle>Bugun</SectionTitle>
        <ItemCards items={o.todayItems} empty="Bugun uchun material yo‘q — profil qo‘shing yoki navbatni kuting." />
      </section>
      <section>
        <SectionTitle>Rejalashtirilgan nashrlar</SectionTitle>
        <ItemCards items={o.upcoming} empty="Tasdiqlangan va navbatda turgan material yo‘q." />
      </section>
      {o.problems.length ? (
        <section>
          <SectionTitle>E’tibor talab qiladi</SectionTitle>
          <ItemCards items={o.problems} empty="" />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Profillar</SectionTitle>
          {o.profiles.length ? (
            <ul className="divide-y divide-line">
              {o.profiles.map((p) => {
                const ig = conn.get(p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/agents/profillar/${p.id}`} className="min-w-0 font-medium hover:text-accent">
                      {p.name} <span className="text-sm text-subtle">{p.instagram_username ? `@${p.instagram_username}` : ''}</span>
                    </Link>
                    <span className="flex flex-wrap gap-1.5">
                      {p.status === 'active' ? <Badge tone="success">Faol</Badge> : <Badge tone="warning">Pauza</Badge>}
                      {ig?.status === 'connected' ? <Badge tone="info">Instagram ulangan</Badge> : <Badge>Instagram ulanmagan</Badge>}
                      {p.auto_publish ? <Badge tone="violet">avto-nashr</Badge> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Hali profil yo‘q.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Ulanishlar va xarajat</SectionTitle>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between gap-3">
              <span>G‘oyalar (arzon model)</span>
              <span className="text-muted">{c.idea ? `${c.idea.provider} · ${c.idea.model}` : 'ulanmagan — lokal shablon'}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Yakuniy matn</span>
              <span className="text-muted">{c.write ? `${c.write.provider} · ${c.write.model}` : 'ulanmagan — lokal shablon'}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Instagram ilovasi</span>
              <span className="text-muted">{c.instagramApp ? 'sozlangan' : 'sozlanmagan (INSTAGRAM_APP_ID)'}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Bugungi AI chaqiruvlari</span>
              <span className="text-muted">
                {o.usage} / {o.settings.daily_ai_limit}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Bugungi taxminiy xarajat</span>
              <span className="text-muted">
                ${o.costToday.toFixed(3)}
                {o.unknownCost ? ' (+ Gemini bepul tarif)' : ''}
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
