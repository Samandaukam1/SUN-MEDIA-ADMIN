import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { PlansEditor, type AdminPlan, type ServiceOption } from '@/components/site-admin/PlansEditor';
import { ButtonLink } from '@/components/ui/Button';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Tariflar · Sayt' };

export default async function SitePlansPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requirePermission('site.manage');
  const { new: startNew } = await searchParams;
  const supabase = await createClient();
  const [plansRes, servicesRes] = await Promise.all([
    supabase
      .from('site_plans')
      .select(
        'id, name, description, price, currency, price_mode, billing_period, is_featured, is_published, sort_order, created_at, items:site_plan_items(id, name, quantity, note, service_key, sort_order, created_at)',
      )
      .order('sort_order')
      .order('created_at'),
    supabase.from('service_types').select('key, name, unit, is_quantitative, content_types, is_active').order('position'),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (servicesRes.error) throw servicesRes.error;
  const plans: AdminPlan[] = (plansRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price === null ? null : Number(p.price),
    currency: p.currency as AdminPlan['currency'],
    price_mode: p.price_mode as AdminPlan['price_mode'],
    billing_period: p.billing_period as AdminPlan['billing_period'],
    is_featured: p.is_featured,
    is_published: p.is_published,
    items: [...(p.items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map(({ id, name, quantity, note, service_key }) => ({ id, name, quantity, note, service_key })),
  }));
  const services: ServiceOption[] = servicesRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tariflar"
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Tariflar' }]}
        actions={
          <>
            <ButtonLink href="/plans">Tizimda ko‘rish</ButtonLink>
            <ButtonLink href="/tariflar">Saytda ko‘rish</ButtonLink>
          </>
        }
      />
      <PlansEditor plans={plans} services={services} startNew={startNew === '1'} />
    </div>
  );
}
