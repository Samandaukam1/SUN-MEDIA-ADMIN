import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { PlanForm } from '@/components/plans/PlanForm';
import { Card } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Maxsus tarif' };

export default async function NewPlanPage() {
  await requirePermission('plans.manage');
  const supabase = await createClient();
  const [services, clients] = await Promise.all([
    supabase.from('service_types').select('key, name, unit, is_quantitative').eq('is_active', true).order('position'),
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
  ]);
  if (services.error) throw services.error;
  if (clients.error) throw clients.error;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Mijozlar', href: '/clients' }, { label: 'Tariflar', href: '/plans' }, { label: 'Maxsus tarif' }]}
        title="Maxsus tarif"
        description="Bitta mijoz uchun: narx, muddat va tarifga kiradigan xizmatlar miqdori. Hamma uchun ochiq tarif Sayt → Tariflar’da qo‘shiladi."
      />
      <Card className="max-w-3xl">
        <PlanForm services={services.data} clients={clients.data} editable />
      </Card>
    </div>
  );
}
