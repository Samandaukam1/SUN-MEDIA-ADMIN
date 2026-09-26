import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { PlanForm } from '@/components/plans/PlanForm';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Tarif' };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const context = await requireStaff();
  if (!['plans.manage', 'subscriptions.read', 'subscriptions.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const { id } = await params;
  const { saved } = await searchParams;
  const supabase = await createClient();
  const [plan, services, clients] = await Promise.all([
    supabase
      .from('plans')
      .select('id, name, description, price, duration_months, client_id, is_active, position, features:plan_features(service_key, quantity, is_included)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('service_types').select('key, name, unit, is_quantitative').eq('is_active', true).order('position'),
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
  ]);
  if (plan.error) throw plan.error;
  if (!plan.data) notFound();
  if (services.error) throw services.error;
  const p = plan.data;
  const features = Object.fromEntries(p.features.filter((f) => f.is_included).map((f) => [f.service_key, f.quantity]));
  return (
    <div>
      <PageHeader back={{ href: '/plans', label: 'Tariflar' }} title={p.name} description="O‘zgarishlar faqat yangi obunalarga ta’sir qiladi: mavjud mijozlar sotib olgan tarkibi saqlanadi." />
      {saved ? (
        <div className="mb-6 max-w-3xl">
          <Notice tone="success" title="Tarif yaratildi" />
        </div>
      ) : null}
      <Card className="max-w-3xl">
        <PlanForm
          services={services.data}
          clients={clients.data ?? []}
          editable={can(context, 'plans.manage')}
          values={{ id: p.id, name: p.name, description: p.description, price: Number(p.price), duration_months: p.duration_months, client_id: p.client_id, is_active: p.is_active, position: p.position, features }}
        />
      </Card>
    </div>
  );
}
