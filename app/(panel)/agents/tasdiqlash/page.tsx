import type { Metadata } from 'next';

import { ItemCards } from '@/components/agents/ItemCards';
import { PageHeader } from '@/components/panel/PageHeader';
import { SectionTitle } from '@/components/ui/Card';
import { itemsWhere } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Agents · Tasdiqlash' };
export const dynamic = 'force-dynamic';

export default async function AgentApprovals() {
  const [pending, problems, approved] = await Promise.all([
    itemsWhere({ statuses: ['pending_approval'], limit: 60 }),
    itemsWhere({ statuses: ['qa_failed', 'needs_fix', 'needs_reschedule', 'limit_reached', 'failed'], limit: 60 }),
    itemsWhere({ statuses: ['approved', 'partially_published'], limit: 30 }),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tasdiqlash"
        crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Tasdiqlash' }]}
        description="Har materialni oching: rasmlar, matn, profil va vaqt. Tasdiq aniq versiyaga bog‘lanadi — matn, rasm yoki vaqt o‘zgarsa qayta tasdiq kerak."
      />
      <section>
        <SectionTitle>Tasdiq kutmoqda ({pending.length})</SectionTitle>
        <ItemCards items={pending} empty="Hozircha hammasi ko‘rib chiqilgan." />
      </section>
      <section>
        <SectionTitle>Tuzatish yoki e’tibor kerak ({problems.length})</SectionTitle>
        <ItemCards items={problems} empty="Muammo yo‘q." />
      </section>
      <section>
        <SectionTitle>Tasdiqlangan, nashrni kutmoqda ({approved.length})</SectionTitle>
        <ItemCards items={approved} empty="Yo‘q." />
      </section>
    </div>
  );
}
