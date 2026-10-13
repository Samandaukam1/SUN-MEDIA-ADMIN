import type { Metadata } from 'next';

import { PostRow, VisitCard } from '@/components/cabinet/partner/EventCards';
import { Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { PartnerFrame } from '@/components/cabinet/partner/PartnerFrame';
import { resolvePartner } from '@/lib/cabinet/partner-context';
import { loadCalendar } from '@/lib/cabinet/partner-data';

export const metadata: Metadata = { title: 'Reja' };

const DAY = 24 * 3600 * 1000;

/** When SUN MEDIA comes (shootings), what goes out and when (posts), and the visits of the last month. */
export default async function PartnerPlanPage({ searchParams }: { searchParams: Promise<{ brend?: string }> }) {
  const scope = await resolvePartner((await searchParams).brend);
  const now = Date.now();
  const events = await loadCalendar(scope.clientId, new Date(now - 30 * DAY).toISOString(), new Date(now + 60 * DAY).toISOString());
  const nowIso = new Date(now).toISOString();
  const upcomingVisits = events.filter((e) => e.event_type === 'shooting' && (e.ends_at ?? e.starts_at) >= nowIso);
  const pastVisits = events.filter((e) => e.event_type === 'shooting' && (e.ends_at ?? e.starts_at) < nowIso).reverse();
  const posts = events.filter((e) => e.event_type === 'publication' && e.starts_at >= nowIso);
  const meetings = events.filter((e) => e.event_type === 'meeting' && e.starts_at >= nowIso);

  return (
    <PartnerFrame scope={scope} title="Reja" subtitle="Qachon boramiz, nima suratga olamiz va qachon nima chiqadi — keyingi 60 kun.">
      <div className="grid gap-7 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <SectionTitle hint={upcomingVisits.length ? `${upcomingVisits.length} ta` : undefined}>Keyingi tashriflarimiz</SectionTitle>
          {upcomingVisits.length ? (
            <div className="space-y-3">
              {upcomingVisits.map((e) => (
                <VisitCard key={e.entity_id} event={e} />
              ))}
            </div>
          ) : (
            <Panel>
              <p className="text-[14px] text-[#8e8e96]">Yaqin 60 kunda syomka hali rejalashtirilmagan. Sana belgilanganda shu yerda chiqadi.</p>
            </Panel>
          )}
          {meetings.length ? (
            <div className="mt-7">
              <SectionTitle>Uchrashuvlar</SectionTitle>
              <div className="space-y-3">
                {meetings.map((e) => (
                  <VisitCard key={e.entity_id} event={{ ...e, status: null }} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <SectionTitle hint={posts.length ? `${posts.length} ta` : undefined}>Kontent chiqish rejasi</SectionTitle>
          <Panel>
            {posts.length ? (
              <ul className="divide-y divide-white/[0.06]">
                {posts.slice(0, 30).map((e) => (
                  <PostRow key={e.entity_id} event={e} />
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[#8e8e96]">Rejalashtirilgan post hali yo‘q.</p>
            )}
          </Panel>
        </div>
      </div>
      {pastVisits.length ? (
        <div>
          <SectionTitle hint="oxirgi 30 kun">O‘tgan tashriflar</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {pastVisits.map((e) => (
              <VisitCard key={e.entity_id} event={e} muted />
            ))}
          </div>
        </div>
      ) : null}
    </PartnerFrame>
  );
}
