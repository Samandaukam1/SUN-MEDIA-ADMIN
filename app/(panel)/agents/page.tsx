import type { Metadata } from 'next';
import Link from 'next/link';

import { ItemCards } from '@/components/agents/ItemCards';
import { Card, SectionTitle } from '@/components/ui/Card';
import { itemsWhere, overview } from '@/lib/agents/views';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'AI kontent agent' };

function Stat({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: 'danger' | 'warning' }) {
  const body = (
    <Card className={`h-full ${href ? 'transition-colors hover:border-accent' : ''}`}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`mt-1 text-[26px] font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : ''}`}>{value}</p>
      {hint ? <p className="text-[12px] text-subtle">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function AgentsOverview() {
  const o = await overview();
  const today = agencyDateKey();
  const in3 = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const [pending, upcoming] = await Promise.all([itemsWhere({ statuses: ['pending_approval', 'qa_failed'], limit: 9 }), itemsWhere({ from: today, to: in3, statuses: ['queued', 'generating', 'regenerating', 'needs_fix', 'failed', 'limit_reached'], limit: 9 })]);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Faol mijozlar" value={o.activeClients} href="/agents/profillar" />
        <Stat label="Bugungi Story" value={`${o.storiesReady}/${o.storiesToday}`} hint="tayyor / rejada" href="/agents/taqvim" />
        <Stat label="Karusellar (3 kun)" value={o.carouselsPlanned} href="/agents/taqvim" />
        <Stat label="Tasdiq kutmoqda" value={o.pending} href="/agents/tasdiqlash" tone={o.pending ? 'warning' : undefined} />
        <Stat label="Yuklab olishga tayyor" value={o.ready} href="/agents/tayyor" />
        <Stat label="Navbatdagi ishlar" value={o.activeJobs} href="/agents/generatsiya" />
        <Stat label="Xato ishlar (24 soat)" value={o.failedJobs} href="/agents/generatsiya?holat=failed" tone={o.failedJobs ? 'danger' : undefined} />
        <Stat
          label="AI sarfi (oy)"
          value={`${o.usage.images} rasm`}
          hint={`${o.usage.calls} matn chaqiruvi${o.usage.cost !== null ? ` · ~$${o.usage.cost.toFixed(2)}` : ' · narx sozlanmagan'}`}
          href="/agents/sozlamalar"
        />
      </div>
      <section>
        <SectionTitle action={<Link href="/agents/tasdiqlash" className="text-[13px] text-accent-on-soft">Hammasi →</Link>}>Tasdiq kutmoqda</SectionTitle>
        <ItemCards items={pending} empty="Tasdiq kutayotgan kontent yo‘q." />
      </section>
      <section>
        <SectionTitle action={<Link href="/agents/taqvim" className="text-[13px] text-accent-on-soft">Kontent reja →</Link>}>Yaqin 3 kun</SectionTitle>
        <ItemCards items={upcoming} empty="Yaqin kunlarda tayyorlanadigan material yo‘q. Mijoz qo‘shing yoki jadvalni tekshiring." />
      </section>
    </div>
  );
}
