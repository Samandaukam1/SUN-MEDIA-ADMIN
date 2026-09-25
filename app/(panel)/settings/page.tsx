import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { AlertRules, type AlertRule } from '@/components/settings/AlertRules';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { Card } from '@/components/ui/Card';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sozlamalar' };

export default async function SettingsPage() {
  const context = await requireStaff();
  if (!['settings.manage', 'employees.manage', 'notifications.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const [{ data, error }, rulesRes] = await Promise.all([
    supabase.from('app_settings').select('key, value'),
    supabase.from('deadline_alert_rules').select('id, name, target, offset_minutes, recipients, task_types, is_active').order('target').order('offset_minutes'),
  ]);
  if (error) throw error;
  if (rulesRes.error) throw rulesRes.error;
  const get = (key: string) => data.find((r) => r.key === key)?.value;
  const days = get('attendance.work_days');
  const start = get('attendance.workday_start');
  const grace = get('attendance.late_grace_minutes');
  const domain = get('accounts.login_domain');
  const approvalWindow = get('approvals.client_window_hours');

  return (
    <div>
      <PageHeader eyebrow="Tizim" title="Sozlamalar" description="Ish haftasi, ish boshlanish vaqti, akkaunt standartlari va tasdiq muddati." />
      <Card className="max-w-3xl">
        <SettingsForm
          workDays={Array.isArray(days) ? days.map(Number) : [1, 2, 3, 4, 5, 6]}
          workdayStart={typeof start === 'string' ? start : '09:00'}
          lateGrace={typeof grace === 'number' ? grace : 10}
          loginDomain={typeof domain === 'string' ? domain : 'sunmedia.uz'}
          approvalWindow={typeof approvalWindow === 'number' ? approvalWindow : 48}
          editable={can(context, 'settings.manage')}
        />
      </Card>
      <section className="mt-10 max-w-5xl">
        <h2 className="text-lg font-semibold tracking-tight">Deadline eslatmalari</h2>
        <p className="mt-1 mb-4 max-w-2xl text-sm text-muted">
          Tizim har daqiqada muddatlarni tekshiradi. Masalan, muddat 17:00 bo‘lsa: 15:00 da mas’ulga, 16:30 da mas’ul va adminga eslatma, 17:00 dan keyin
          OVERDUE — owner va admin ham xabar oladi.
        </p>
        <AlertRules rules={rulesRes.data as AlertRule[]} editable={can(context, 'notifications.manage')} />
      </section>
    </div>
  );
}
