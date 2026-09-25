import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { Card } from '@/components/ui/Card';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sozlamalar' };

export default async function SettingsPage() {
  const context = await requireStaff();
  if (!can(context, 'settings.manage') && !can(context, 'employees.manage')) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error) throw error;
  const get = (key: string) => data.find((r) => r.key === key)?.value;
  const days = get('attendance.work_days');
  const start = get('attendance.workday_start');
  const grace = get('attendance.late_grace_minutes');
  const domain = get('accounts.login_domain');

  return (
    <div>
      <PageHeader eyebrow="Tizim" title="Sozlamalar" description="Ish haftasi, ish boshlanish vaqti va akkaunt standartlari." />
      <Card className="max-w-3xl">
        <SettingsForm
          workDays={Array.isArray(days) ? days.map(Number) : [1, 2, 3, 4, 5, 6]}
          workdayStart={typeof start === 'string' ? start : '09:00'}
          lateGrace={typeof grace === 'number' ? grace : 10}
          loginDomain={typeof domain === 'string' ? domain : 'sunmedia.uz'}
          editable={can(context, 'settings.manage')}
        />
      </Card>
    </div>
  );
}
