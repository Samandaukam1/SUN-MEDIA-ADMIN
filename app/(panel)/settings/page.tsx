import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { AlertRules, type AlertRule } from '@/components/settings/AlertRules';
import { AssistantAiSettings, type ModelUse } from '@/components/settings/AssistantAiSettings';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { Card } from '@/components/ui/Card';
import { can, isSystemOwner, requireStaff } from '@/lib/auth';
import { agencyDateKey } from '@/lib/time';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sozlamalar' };

export default async function SettingsPage() {
  const context = await requireStaff();
  if (!['settings.manage', 'employees.manage', 'notifications.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const owner = isSystemOwner(context);
  const [{ data, error }, rulesRes, usageRes] = await Promise.all([
    supabase.from('app_settings').select('key, value'),
    supabase.from('deadline_alert_rules').select('id, name, target, offset_minutes, recipients, task_types, is_active').eq('target', 'task').order('offset_minutes'),
    owner ? supabase.rpc('assistant_usage_report', { p_days: 31 }) : null,
  ]);
  if (error) throw error;
  if (rulesRes.error) throw rulesRes.error;
  const get = (key: string) => data.find((r) => r.key === key)?.value;
  const days = get('attendance.work_days');
  const start = get('attendance.workday_start');
  const grace = get('attendance.late_grace_minutes');
  const domain = get('accounts.login_domain');
  // Sunny AI (owner only): tokens per model today and this month, as the providers reported them.
  const today = agencyDateKey();
  const sum = (rows: NonNullable<NonNullable<typeof usageRes>['data']>): ModelUse[] => {
    const by = new Map<string, ModelUse>();
    for (const r of rows) {
      const m = by.get(r.model) ?? { model: r.model, requests: 0, input: 0, output: 0, cached: 0, thoughts: 0, cost: null, unpriced: 0 };
      m.requests += Number(r.requests);
      m.input += Number(r.input_tokens);
      m.output += Number(r.output_tokens);
      m.cached += Number(r.cached_tokens);
      m.thoughts += Number(r.thought_tokens);
      m.unpriced += Number(r.unpriced);
      if (r.cost_usd !== null) m.cost = (m.cost ?? 0) + Number(r.cost_usd);
      by.set(r.model, m);
    }
    return [...by.values()].sort((a, b) => b.requests - a.requests);
  };
  const usage = usageRes?.data ?? [];
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  const pricing = get('assistant.pricing');

  return (
    <div>
      <PageHeader title="Sozlamalar" description="Ish haftasi, ish boshlanish vaqti, akkaunt standartlari va muddat eslatmalari." />
      <Card className="max-w-3xl">
        <SettingsForm
          workDays={Array.isArray(days) ? days.map(Number) : [1, 2, 3, 4, 5, 6]}
          workdayStart={typeof start === 'string' ? start : '09:00'}
          lateGrace={typeof grace === 'number' ? grace : 10}
          loginDomain={typeof domain === 'string' ? domain : 'sunmedia.uz'}
          editable={can(context, 'settings.manage')}
        />
      </Card>
      <section className="mt-10 max-w-5xl">
        <h2 className="text-lg font-semibold tracking-tight">Deadline eslatmalari</h2>
        <p className="mt-1 mb-4 max-w-2xl text-sm text-muted">
          Tizim har daqiqada muddatlarni tekshiradi. Masalan, muddat 17:00 bo‘lsa: 15:00 da mas’ulga, 16:30 da mas’ul va adminga eslatma, 17:00 dan keyin
          Kechikdi — Rahbar va Admin ham xabar oladi.
        </p>
        <AlertRules rules={rulesRes.data as AlertRule[]} editable={can(context, 'notifications.manage')} />
      </section>
      {owner ? (
        <section className="mt-10 max-w-5xl">
          <h2 className="text-lg font-semibold tracking-tight">Sunny AI</h2>
          <p className="mt-1 mb-4 max-w-2xl text-sm text-muted">
            Faqat AI kerak bo‘lgan savollar hisoblanadi; aniq buyruqlar (vazifalarim, keldim, brifing) va robot harakatlari tekin. Tokenlar provayder bergan hisob bo‘yicha.
          </p>
          <Card>
            <AssistantAiSettings
              limits={{ member: num(get('assistant.daily_limit_member'), 300), public: num(get('assistant.daily_limit_public'), 40) }}
              budget={num(get('assistant.monthly_budget_usd'), 0)}
              pricing={pricing && typeof pricing === 'object' && !Array.isArray(pricing) ? (pricing as Record<string, { input?: number; output?: number; cached?: number }>) : {}}
              today={sum(usage.filter((r) => r.day === today))}
              month={sum(usage.filter((r) => r.day.slice(0, 7) === today.slice(0, 7)))}
            />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
