import type { Metadata } from 'next';
import { z } from 'zod';

import { PageHeader } from '@/components/panel/PageHeader';
import { Stat } from '@/components/panel/Stat';
import { GateCodeForm } from '@/components/site-admin/GateCodeForm';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { isSystemOwner, requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Kirish kodi · Sayt' };

const statusSchema = z.object({
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
  failedLastDay: z.number(),
  openedLastDay: z.number(),
});

export default async function SiteSecurityPage() {
  const context = await requirePermission('site.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('site_gate_status');
  if (error) throw error;
  const status = statusSchema.parse(data);
  const owner = isSystemOwner(context);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xodimlar kirishi kodi"
        description="Sayt footeridagi kichik yozuv bosilganda so‘raladigan 6 xonali kod. To‘g‘ri kod 30 daqiqaga panelning kirish sahifasini ochadi; keyin odatiy email va parol."
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Kirish kodi' }]}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Holat" value={status.configured ? 'O‘rnatilgan' : 'O‘rnatilmagan'} tone={status.configured ? 'success' : 'danger'} detail={status.updatedAt ? `Oxirgi o‘zgarish: ${formatShortDateTime(status.updatedAt)}` : undefined} />
        <Stat label="24 soatda ochildi" value={String(status.openedLastDay)} detail="To‘g‘ri kod kiritilgan" />
        <Stat label="24 soatda xato" value={String(status.failedLastDay)} tone={status.failedLastDay > 20 ? 'warning' : 'default'} detail="Noto‘g‘ri urinishlar" />
      </div>
      <Notice tone="info" title="Himoya">
        Kod bazada faqat shifrlangan (bcrypt) holda saqlanadi. Bir qurilmadan 15 daqiqada 5 ta xato urinishdan keyin kirish vaqtincha yopiladi. Kod — qo‘shimcha
        to‘siq: panelga baribir faqat email va parol bilan kiriladi.
      </Notice>
      <Card className="max-w-2xl space-y-4">
        <SectionTitle>Kodni almashtirish</SectionTitle>
        {owner ? (
          <GateCodeForm />
        ) : (
          <p className="text-sm text-muted">Kodni faqat Tizim egasi almashtira oladi.</p>
        )}
      </Card>
    </div>
  );
}
