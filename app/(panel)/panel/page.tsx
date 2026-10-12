import type { Metadata } from 'next';
import Link from 'next/link';

import { LiveRefresh } from '@/components/panel/LiveRefresh';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { describeActivity, type ActivityItem } from '@/lib/activity';
import { can, requireStaff } from '@/lib/auth';
import { lookup, SHOOTING_ATTENDANCE_STATUS, SHOOTING_STATUS, TASK_TYPE } from '@/lib/labels';
import { commandCenterSchema, type CommandCenter } from '@/lib/schemas/command-center';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatDateKeyLong, formatShortDateTime, formatTime } from '@/lib/time';
import type { StaffContext } from '@/types/app';

export const metadata: Metadata = { title: 'Bosh sahifa' };

/** "Bugun": the handful of numbers that matter, then today's shootings, urgent deadlines and what just happened. */
export default async function HomePage() {
  const context = await requireStaff();
  if (!can(context, 'dashboard.view')) return <StaffWelcome context={context} />;

  const today = agencyDateKey();
  const supabase = await createClient();
  const [ccRes, activityRes] = await Promise.all([supabase.rpc('get_command_center', { p_date: today }), supabase.rpc('get_activity_feed', { p_limit: 8 })]);
  if (ccRes.error) throw ccRes.error;
  const cc = commandCenterSchema.parse(ccRes.data);
  const activity = (activityRes.data ?? []) as ActivityItem[];
  const canAttendance = can(context, 'attendance.manage');

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-subtle">{formatDateKeyLong(today)}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Bugun agentlikda</h1>
        </div>
        <LiveRefresh topics={['staff']} />
      </header>

      <Today cc={cc} />

      {canAttendance && cc.attendance.unmarked > 0 ? (
        <Link href="/team/attendance" className="flex items-center gap-4 rounded-2xl border border-warning/40 bg-warning-soft px-5 py-4 hover:border-warning">
          <Icon name="userCheck" className="text-warning" />
          <span className="flex-1 text-sm font-medium">{cc.attendance.unmarked} xodimning bugungi davomati belgilanmagan</span>
          <span className="text-sm font-semibold">Belgilash →</span>
        </Link>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Shootings cc={cc} />
          <Deadlines cc={cc} />
        </div>
        <Activity items={activity} />
      </div>
    </div>
  );
}

function Today({ cc }: { cc: CommandCenter }) {
  const { tasks, attendance, approvals, publications } = cc;
  const arrived = attendance.present + attendance.late + attendance.remote;
  const tiles = [
    { label: 'Syomka', value: String(cc.shootings.length), href: '/work/shootings' },
    { label: 'Faol vazifa', value: String(tasks.in_progress + tasks.todo), href: '/work/tasks' },
    { label: 'Kechikkan vazifa', value: String(tasks.overdue), href: '/work/tasks?due=overdue', tone: tasks.overdue ? 'text-danger' : '' },
    { label: 'Ichki tekshiruvda', value: String(approvals.client_review + approvals.internal_review), href: '/work/content?stage=check' },
    { label: 'Davomat', value: `${arrived}/${attendance.employees}`, detail: attendance.late ? `${attendance.late} kechikdi` : null, href: '/team/attendance', tone: attendance.late ? 'text-warning' : '' },
    { label: 'Bugungi post', value: String(publications.scheduled + publications.published), detail: publications.published ? `${publications.published} joylandi` : null, href: '/work/calendar' },
  ];
  return (
    <section aria-label="Bugun" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="group">
          <Card className="flex h-full flex-col gap-1.5 transition-colors group-hover:border-line-strong">
            <p className="text-[13px] text-muted">{t.label}</p>
            <p className={cn('tabular text-3xl font-bold tracking-tight', t.tone)}>{t.value}</p>
            {t.detail ? <p className="text-[13px] text-muted">{t.detail}</p> : null}
          </Card>
        </Link>
      ))}
    </section>
  );
}

function Shootings({ cc }: { cc: CommandCenter }) {
  return (
    <section>
      <SectionTitle action={<Link href="/work/shootings" className="text-sm font-medium text-muted hover:text-ink">Barchasi</Link>}>Bugungi syomkalar</SectionTitle>
      {cc.shootings.length === 0 ? (
        <EmptyRow>Bugun syomka rejalashtirilmagan</EmptyRow>
      ) : (
        <div className="space-y-3">
          {cc.shootings.map((s) => {
            const status = lookup(SHOOTING_STATUS, s.status, { label: s.status, tone: 'neutral' as const });
            return (
              <Card key={s.id} className="flex flex-wrap items-start gap-5">
                <div className="tabular rounded-xl bg-accent-soft px-3 py-2 text-lg font-semibold text-accent-on-soft">{formatTime(s.starts_at)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{s.client_name}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{[s.title, s.location_name].filter(Boolean).join(' · ')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.members.length === 0 ? <span className="text-sm text-subtle">Jamoa biriktirilmagan</span> : null}
                    {s.members.map((m) => {
                      const a = lookup(SHOOTING_ATTENDANCE_STATUS, m.attendance, SHOOTING_ATTENDANCE_STATUS.pending);
                      return (
                        <Badge key={m.user_id} tone={a.tone}>
                          {m.full_name} · {a.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Deadlines({ cc }: { cc: CommandCenter }) {
  const items = cc.deadlines.items.filter((d) => d.state !== 'upcoming').slice(0, 8);
  return (
    <section>
      <SectionTitle action={<Link href="/work/tasks" className="text-sm font-medium text-muted hover:text-ink">Vazifalar</Link>}>Muhim muddatlar</SectionTitle>
      {items.length === 0 ? (
        <EmptyRow>Kechikkan yoki 24 soat ichidagi muddat yo‘q</EmptyRow>
      ) : (
        <Card className="divide-y divide-line p-0">
          {items.map((d) => (
            <div key={d.task_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.title}</p>
                <p className="truncate text-xs text-muted">
                  {[lookup(TASK_TYPE, d.task_type, 'Vazifa'), d.client_name, d.assignees.map((a) => a.full_name).join(', ') || 'Biriktirilmagan'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={cn('tabular text-xs font-medium', d.state === 'overdue' ? 'text-danger' : 'text-warning')}>
                {d.state === 'overdue' ? 'Kechikdi · ' : ''}
                {formatShortDateTime(d.due_at)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function Activity({ items }: { items: ActivityItem[] }) {
  return (
    <section>
      <SectionTitle>So‘nggi faollik</SectionTitle>
      {items.length === 0 ? (
        <EmptyRow>Hali faollik yo‘q</EmptyRow>
      ) : (
        <Card className="divide-y divide-line p-0">
          {items.map((item) => {
            const { text, detail } = describeActivity(item);
            return (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{text}</p>
                  {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
                </div>
                <span className="tabular shrink-0 text-xs text-subtle">
                  {agencyDateKey(new Date(item.occurred_at)) === agencyDateKey() ? formatTime(item.occurred_at) : formatShortDateTime(item.occurred_at)}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}

function StaffWelcome({ context }: { context: StaffContext }) {
  return (
    <div className="max-w-xl space-y-3 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Salom, {context.profile?.full_name.split(' ')[0]}</h1>
      <p className="text-muted">Chap menyudan kerakli bo‘limni tanlang. Kundalik vazifa, syomka va tasdiqlashlar SUN MEDIA mobil ilovasida ham bor.</p>
    </div>
  );
}
