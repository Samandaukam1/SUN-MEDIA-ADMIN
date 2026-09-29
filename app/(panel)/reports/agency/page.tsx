import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { Stat } from '@/components/panel/Stat';
import { MonthPicker } from '@/components/team/MonthPicker';
import { SectionTitle } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { CONTENT_TYPE, lookup } from '@/lib/labels';
import { monthFrom } from '@/lib/month';
import { createClient } from '@/lib/supabase/server';
import { addDaysToKey, agencyDayRange } from '@/lib/time';

export const metadata: Metadata = { title: 'Agentlik statistikasi' };

/** Hisobotlar → Agentlik statistikasi: what the whole agency delivered in a month. */
export default async function AgencyStatsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('dashboard.view');
  const { month, current, to } = monthFrom((await searchParams).month);
  const from = agencyDayRange(month).from;
  const until = agencyDayRange(addDaysToKey(to, 0)).to;
  const supabase = await createClient();
  const count = { count: 'exact' as const, head: true };

  const [published, shootings, tasksDone, tasksLate, approved, reworks, clients, attendance] = await Promise.all([
    supabase.from('content_items').select('content_type').is('deleted_at', null).gte('published_at', from).lt('published_at', until),
    supabase.from('shootings').select('id', count).is('deleted_at', null).neq('status', 'cancelled').gte('starts_at', from).lt('starts_at', until),
    supabase.from('tasks').select('id', count).is('deleted_at', null).eq('status', 'done').gte('completed_at', from).lt('completed_at', until),
    supabase.from('tasks').select('id', count).is('deleted_at', null).not('status', 'in', '(done,cancelled)').lt('due_at', new Date(Math.min(Date.now(), new Date(until).getTime())).toISOString()).gte('due_at', from),
    supabase.from('content_items').select('id', count).is('deleted_at', null).gte('approved_at', from).lt('approved_at', until),
    supabase.from('revisions').select('id', count).gte('requested_at', from).lt('requested_at', until),
    supabase.from('clients').select('id', count).is('deleted_at', null).eq('status', 'active'),
    supabase.from('attendance').select('status').gte('work_date', month).lte('work_date', to),
  ]);
  const byType = new Map<string, number>();
  for (const c of published.data ?? []) byType.set(c.content_type, (byType.get(c.content_type) ?? 0) + 1);
  const att = attendance.data ?? [];
  const onTime = att.filter((a) => a.status === 'present' || a.status === 'remote').length;
  const late = att.filter((a) => a.status === 'late').length;
  const absent = att.filter((a) => a.status === 'absent').length;
  const worked = onTime + late + absent;

  return (
    <div className="space-y-8">
      <PageHeader title="Agentlik statistikasi" description="Butun agentlik bir oyda nima qildi." actions={<MonthPicker path="/reports/agency" month={month} current={current} />} />
      <section>
        <SectionTitle>Yetkazildi</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Joylangan kontent" value={String(published.data?.length ?? 0)} />
          {[...byType.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type, n]) => (
              <Stat key={type} label={lookup(CONTENT_TYPE, type, type)} value={String(n)} />
            ))}
          <Stat label="Syomkalar" value={String(shootings.count ?? 0)} />
          <Stat label="Faol mijozlar" value={String(clients.count ?? 0)} />
        </div>
      </section>
      <section>
        <SectionTitle>Ish sifati</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Tasdiqlangan kontent" value={String(approved.count ?? 0)} />
          <Stat label="So‘ralgan o‘zgartirishlar" value={String(reworks.count ?? 0)} tone={reworks.count ? 'warning' : 'default'} />
          <Stat label="Bajarilgan vazifa" value={String(tasksDone.count ?? 0)} tone="success" />
          <Stat label="Kechikkan vazifa" value={String(tasksLate.count ?? 0)} tone={tasksLate.count ? 'danger' : 'default'} />
        </div>
      </section>
      <section>
        <SectionTitle>Davomat</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="O‘z vaqtida kelish" value={worked ? `${Math.round((100 * onTime) / worked)}%` : '—'} />
          <Stat label="Kechikishlar" value={String(late)} tone={late ? 'warning' : 'default'} />
          <Stat label="Kelmaganlar" value={String(absent)} tone={absent ? 'danger' : 'default'} />
          <Stat label="Belgilangan ish kunlari" value={String(att.length)} />
        </div>
      </section>
    </div>
  );
}
