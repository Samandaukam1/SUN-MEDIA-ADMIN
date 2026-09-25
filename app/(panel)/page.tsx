import type { Metadata } from 'next';

import { LiveRefresh } from '@/components/panel/LiveRefresh';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { can, requireStaff } from '@/lib/auth';
import { ATTENDANCE_STATUS, CONTENT_STATUS, lookup, PLATFORM_LABEL, SHOOTING_ATTENDANCE_STATUS, SHOOTING_STATUS } from '@/lib/labels';
import { commandCenterSchema, type CommandCenter } from '@/lib/schemas/command-center';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatDateKeyLong, formatShortDateTime, formatTime } from '@/lib/time';
import type { StaffContext } from '@/types/app';

export const metadata: Metadata = { title: 'Command Center' };

export default async function CommandCenterPage() {
  const context = await requireStaff();
  if (!can(context, 'dashboard.view')) return <StaffWelcome context={context} />;

  const today = agencyDateKey();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_command_center', { p_date: today });
  if (error) throw error;
  const cc = commandCenterSchema.parse(data);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-subtle">{formatDateKeyLong(today)}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Bugun agentlikda</h1>
        </div>
        <LiveRefresh topics={['staff']} />
      </header>
      <Metrics cc={cc} />
      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Shootings cc={cc} />
          <Approvals cc={cc} />
          <Overdue cc={cc} />
        </div>
        <div className="space-y-8">
          <Attendance cc={cc} />
          <Publications cc={cc} />
        </div>
      </div>
    </div>
  );
}

function Metrics({ cc }: { cc: CommandCenter }) {
  const { tasks, attendance, approvals, publications } = cc;
  const arrived = attendance.present + attendance.late + attendance.remote;
  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="Bugungi ko‘rsatkichlar">
      <Stat label="Vazifalar" value={String(tasks.total)} detail={`${tasks.completed} bajarildi · ${tasks.in_progress} jarayonda`} />
      <Stat label="Overdue" value={String(tasks.overdue)} tone={tasks.overdue > 0 ? 'danger' : 'default'} detail="muddati o‘tgan" />
      <Stat
        label="Davomat"
        value={`${arrived}/${attendance.employees}`}
        detail={`${attendance.late} kechikdi · ${attendance.absent} kelmadi`}
        tone={attendance.absent > 0 ? 'warning' : 'default'}
      />
      <Stat label="Mijoz tasdig‘i" value={String(approvals.client_review)} tone={approvals.client_review > 0 ? 'warning' : 'default'} detail={`${approvals.internal_review} ichki tekshiruvda`} />
      <Stat label="Syomkalar" value={String(cc.shootings.length)} detail="bugun" />
      <Stat label="Nashrlar" value={String(publications.scheduled)} detail={`${publications.published} joylandi`} />
    </section>
  );
}

function Shootings({ cc }: { cc: CommandCenter }) {
  return (
    <section>
      <SectionTitle>Bugungi syomkalar · {cc.shootings.length}</SectionTitle>
      {cc.shootings.length === 0 ? (
        <EmptyRow>Bugun syomka rejalashtirilmagan</EmptyRow>
      ) : (
        <div className="space-y-3">
          {cc.shootings.map((s) => {
            const status = lookup(SHOOTING_STATUS, s.status, { label: s.status, tone: 'neutral' as const });
            return (
              <Card key={s.id} className="flex flex-wrap items-start gap-5">
                <div className="tabular rounded-xl bg-accent-soft px-3 py-2 text-lg font-semibold text-accent">{formatTime(s.starts_at)}</div>
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

function Approvals({ cc }: { cc: CommandCenter }) {
  return (
    <section>
      <SectionTitle>Tasdiqlash kutilmoqda · {cc.approvals.client_review + cc.approvals.internal_review}</SectionTitle>
      {cc.approvals.items.length === 0 ? (
        <EmptyRow>Kutilayotgan tasdiq yo‘q</EmptyRow>
      ) : (
        <Card className="divide-y divide-line p-0">
          {cc.approvals.items.map((item) => {
            const status = lookup(CONTENT_STATUS, item.status, { label: item.status, tone: 'neutral' as const });
            return (
              <div key={item.content_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</p>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
                <span className="tabular text-xs text-subtle">{formatShortDateTime(item.since)} dan</span>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}

function Overdue({ cc }: { cc: CommandCenter }) {
  if (cc.overdue.length === 0) return null;
  return (
    <section>
      <SectionTitle>Overdue · {cc.overdue.length}</SectionTitle>
      <Card className="divide-y divide-line p-0">
        {cc.overdue.map((t) => (
          <div key={t.task_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="text-xs text-muted">{[t.client_name, t.assignees.join(', ') || 'Biriktirilmagan'].filter(Boolean).join(' · ')}</p>
            </div>
            <span className="tabular text-xs font-medium text-danger">{formatShortDateTime(t.due_at)}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Attendance({ cc }: { cc: CommandCenter }) {
  const { attendance } = cc;
  return (
    <section>
      <SectionTitle>
        Davomat · {attendance.employees} xodim{attendance.unmarked ? ` · ${attendance.unmarked} belgilanmagan` : ''}
      </SectionTitle>
      <Card className="divide-y divide-line p-0">
        {attendance.people.map((p) => {
          const a = p.status ? lookup(ATTENDANCE_STATUS, p.status, null) : null;
          return (
            <div key={p.user_id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.full_name}</p>
                {p.job_title ? <p className="truncate text-xs text-subtle">{p.job_title}</p> : null}
              </div>
              <Badge tone={a?.tone ?? 'neutral'}>{a ? `${a.label}${p.late_minutes ? ` · ${p.late_minutes} daq` : ''}` : 'Belgilanmagan'}</Badge>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function Publications({ cc }: { cc: CommandCenter }) {
  return (
    <section>
      <SectionTitle>Bugungi nashrlar · {cc.publications.scheduled}</SectionTitle>
      {cc.publications.items.length === 0 ? (
        <EmptyRow>Bugun nashr yo‘q</EmptyRow>
      ) : (
        <Card className="divide-y divide-line p-0">
          {cc.publications.items.map((p) => (
            <div key={p.publication_id} className="flex items-center gap-3 px-5 py-3">
              <span className="tabular w-12 text-sm font-semibold">{formatTime(p.scheduled_at)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.label}</p>
                <p className="text-xs text-subtle">
                  {lookup(PLATFORM_LABEL, p.platform, p.platform)} · {p.client_name}
                </p>
              </div>
              <Badge tone={p.status === 'published' ? 'success' : 'info'}>{p.status === 'published' ? 'Joylandi' : 'Kutilmoqda'}</Badge>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function StaffWelcome({ context }: { context: StaffContext }) {
  return (
    <div className="max-w-xl space-y-3 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Salom, {context.profile?.full_name.split(' ')[0]}</h1>
      <p className="text-muted">
        Command Center rahbariyat uchun. Vazifalaringiz, syomkalaringiz va tasdiqlashlarni SUN MEDIA mobil ilovasida ko‘rasiz.
      </p>
    </div>
  );
}
