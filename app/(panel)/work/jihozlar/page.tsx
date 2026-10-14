import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { SectionTitle } from '@/components/ui/Card';
import { EquipmentBoard, type EquipmentCard } from '@/components/work/EquipmentBoard';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Syomka jihozlari' };

/** Admins pack each shooting's equipment and confirm it; the Rahbar sees the same list read-only. */
export default async function EquipmentPage() {
  const context = await requireStaff();
  const roles = context.roles.map((r) => r.key);
  const editable = roles.includes('admin') || roles.includes('system_owner');
  if (!editable && !['tasks.manage', 'shootings.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');

  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('content_items')
    .select(
      `id, title, equipment_ready_at, client:clients(name), ready_by:profiles!content_items_equipment_ready_by_fkey(full_name),
       shooting:shootings!content_items_shooting_id_client_id_fkey(starts_at, location_name),
       gear:content_equipment!inner(equipment_id, prepared_at, item:equipment(name), by:profiles!content_equipment_prepared_by_fkey(full_name))`,
    )
    .is('deleted_at', null)
    .or(`equipment_ready_at.is.null,equipment_ready_at.gte.${weekAgo}`)
    .limit(100);
  if (error) throw error;

  const cards: EquipmentCard[] = data
    .map((c) => ({
      contentId: c.id,
      title: c.title,
      client: c.client?.name ?? '—',
      shootAt: c.shooting?.starts_at ?? null,
      location: c.shooting?.location_name ?? null,
      readyAt: c.equipment_ready_at,
      readyBy: c.ready_by?.full_name ?? null,
      items: c.gear
        .map((g) => ({ id: g.equipment_id, name: g.item?.name ?? '—', prepared: !!g.prepared_at, by: g.by?.full_name ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (a.shootAt ?? '9').localeCompare(b.shootAt ?? '9'));
  const open = cards.filter((c) => !c.readyAt);
  const ready = cards.filter((c) => c.readyAt);

  return (
    <div className="space-y-8">
      <PageHeader title="Syomka jihozlari" description="Jihozlarni tayyorlagan sari belgilang. Hammasi tayyor bo‘lgach tasdiqlang — Rahbarga xabar boradi." />
      <section>
        <SectionTitle>Tayyorlanishi kerak</SectionTitle>
        {open.length ? <EquipmentBoard cards={open} editable={editable} /> : <EmptyRow>Tayyorlanadigan jihoz yo‘q</EmptyRow>}
      </section>
      {ready.length ? (
        <section>
          <SectionTitle>Tasdiqlangan (7 kun)</SectionTitle>
          <EquipmentBoard cards={ready} editable={false} />
        </section>
      ) : null}
    </div>
  );
}
