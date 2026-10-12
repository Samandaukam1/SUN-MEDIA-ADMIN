import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { SettingsForm } from '@/components/site-admin/SettingsForm';
import { ButtonLink } from '@/components/ui/Button';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Matnlar va aloqa · Sayt' };

export default async function SiteTextsPage() {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const { data, error } = await supabase.from('site_settings').select('*').eq('id', true).single();
  if (error) throw error;
  const values = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id' && k !== 'updated_at')) as Record<string, string | null>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Matnlar va aloqa"
        description="Bosh ekran, ariza formasi, telefonlar, ijtimoiy tarmoqlar, footer va Google uchun matnlar."
        crumbs={[{ label: 'Sayt', href: '/site' }, { label: 'Matnlar va aloqa' }]}
        actions={<ButtonLink href="/">Saytni ochish</ButtonLink>}
      />
      <SettingsForm initial={values} />
    </div>
  );
}
