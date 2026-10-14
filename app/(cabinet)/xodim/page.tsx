import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { CheckInCard } from '@/components/cabinet/CheckInCard';
import { Chip, Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { StatusPill } from '@/components/cabinet/StatusPill';
import { NotificationBell } from '@/components/live/NotificationBell';
import { PresenceHeartbeat } from '@/components/live/PresenceHeartbeat';
import { TeamList } from '@/components/live/TeamList';
import { SiteIcon } from '@/components/site/SiteIcon';
import { getSessionContext } from '@/lib/auth';
import { homeFor, isPanelUser } from '@/lib/cabinet/routing';
import { groupOf, type TaskGroup } from '@/lib/cabinet/tasks';
import { CONTENT_STATUS, PRIORITY, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { loadTeam } from '@/lib/team-directory';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';
import { STAGE_LABEL, stageStatusLabel, type Stage } from '@/lib/workflow-shared';

export const metadata: Metadata = { title: 'Xodim kabineti' };

type Filter = 'faol' | TaskGroup;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'faol', label: 'Faol' },
  { key: 'yangi', label: 'Yangi' },
  { key: 'jarayonda', label: 'Jarayonda' },
  { key: 'tekshiruv', label: 'Tekshiruvda' },
  { key: 'bajarilgan', label: 'Tugallangan' },
];
const inFilter = (filter: Filter, group: TaskGroup | null) => (filter === 'faol' ? group === 'yangi' || group === 'jarayonda' : group === filter);

/** Staff cabinet: "Keldim", only the tasks assigned to this person (the database filters the rest out), the team. */
export default async function EmployeeCabinetPage({ searchParams }: { searchParams: Promise<{ holat?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=xodim');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.kind !== 'staff') redirect(home);
  if (context.temporary_password) redirect('/parol');
  const { holat } = await searchParams;
  const filter: Filter = FILTERS.some((g) => g.key === holat) ? (holat as Filter) : 'faol';

  const supabase = await createClient();
  const today = agencyDateKey();
  const [{ data, error }, attendance, employee, setting, team] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        `id, title, task_type, stage, status, priority, due_at, completed_at, created_at,
         client:clients(id, name),
         project:projects!tasks_project_id_client_id_fkey(id, name),
         content:content_items!tasks_content_id_client_id_fkey(id, title, status),
         mine:task_assignments!inner(user_id)`,
      )
      .eq('mine.user_id', context.userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(300),
    supabase.from('attendance').select('arrived_at, status, late_minutes').eq('user_id', context.userId).eq('work_date', today).maybeSingle(),
    supabase.from('employees').select('work_start_time').eq('user_id', context.userId).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'attendance.check_in_from').maybeSingle(),
    loadTeam(),
  ]);
  if (error) throw error;

  const now = Date.now();
  const tasks = data ?? [];
  const open = tasks.filter((t) => inFilter('faol', groupOf(t.status)));
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const soon = open.filter((t) => t.due_at && new Date(t.due_at).getTime() >= now && new Date(t.due_at).getTime() < now + 24 * 3600 * 1000);
  const doneMonth = tasks.filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() > now - 30 * 24 * 3600 * 1000);
  const shown = tasks
    .filter((t) => inFilter(filter, groupOf(t.status)))
    .sort((a, b) => (filter === 'bajarilgan' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : 0));

  const projects = new Map<string, { name: string; client: string | null; open: number; total: number }>();
  for (const t of tasks) {
    if (!t.project) continue;
    const p = projects.get(t.project.id) ?? { name: t.project.name, client: t.client?.name ?? null, open: 0, total: 0 };
    p.total += 1;
    if (groupOf(t.status) !== 'bajarilgan') p.open += 1;
    projects.set(t.project.id, p);
  }

  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';
  const from = typeof setting.data?.value === 'string' ? setting.data.value : '09:45';

  return (
    <>
      <PresenceHeartbeat />
      <CabinetHeader
        name={context.profile?.full_name || context.profile?.email || ''}
        role={role}
        home="/xodim"
        extra={<NotificationBell userId={context.userId} area="staff" tone="dark" />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-20 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Bugun Sun Media’da</p>
            <h1 className="font-display mt-1.5 text-[28px] leading-tight font-medium tracking-[-0.03em] text-white sm:text-[38px]">
              Salom, {(context.profile?.full_name ?? '').split(' ')[0] || 'hamkasb'}
            </h1>
            <p className="mt-1.5 text-[14px] text-[#a8a8ac]">Vazifalaringiz, davomatingiz va jamoa.</p>
          </div>
          {isPanelUser(context) ? (
            <Link href="/panel" className="lg inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
              Boshqaruv paneli <SiteIcon name="arrowRight" size={16} />
            </Link>
          ) : null}
        </div>

        <CheckInCard
          record={attendance.data ? { arrivedAt: attendance.data.arrived_at, status: attendance.data.status, lateMinutes: attendance.data.late_minutes ?? 0 } : null}
          from={from}
          workStart={employee.data?.work_start_time ?? null}
          serverNow={new Date().toISOString()}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Faol vazifalar', value: open.length, tone: 'text-white' },
            { label: '24 soat ichida muddati', value: soon.length, tone: 'text-[#d4fc18]' },
            { label: 'Muddati o‘tgan', value: overdue.length, tone: overdue.length ? 'text-[#ff9c9c]' : 'text-white' },
            { label: 'Bajarildi (30 kun)', value: doneMonth.length, tone: 'text-white' },
          ].map((s) => (
            <div key={s.label} className="lg rounded-[22px] p-4 sm:p-5">
              <p className="text-[12.5px] font-medium text-[#a8a8ac]">{s.label}</p>
              <p className={`font-display mt-2 text-[28px] leading-none font-medium tabular-nums ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <SectionTitle>Vazifalarim</SectionTitle>
            <div className="mb-4 flex flex-wrap gap-2">
              {FILTERS.map((g) => (
                <Chip key={g.key} href={g.key === 'faol' ? '/xodim' : `/xodim?holat=${g.key}`} active={g.key === filter}>
                  {g.label} · {tasks.filter((t) => inFilter(g.key, groupOf(t.status))).length}
                </Chip>
              ))}
            </div>
            {shown.length ? (
              <ul className="space-y-2.5">
                {shown.map((t) => {
                  const late = inFilter('faol', groupOf(t.status)) && t.due_at && new Date(t.due_at).getTime() < now;
                  const stage = (t.stage as Stage | null) ?? null;
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/xodim/vazifa/${t.id}`}
                        className={`lg group flex items-start gap-4 rounded-[22px] p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5 ${late ? 'ring-1 ring-[#ff8a8a]/40' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {stage ? (
                              <span className="inline-flex h-6 items-center rounded-full bg-white/[0.06] px-2.5 text-[11.5px] font-semibold text-[#d9d9de]">{stageStatusLabel(stage, t.status)}</span>
                            ) : (
                              <StatusPill status={t.status} />
                            )}
                            <span className="text-[12px] text-[#8e8e96]">{stage ? STAGE_LABEL[stage] : TASK_TYPE[t.task_type]}</span>
                            {t.priority === 'high' || t.priority === 'urgent' ? <span className="text-[12px] font-semibold text-[#ff9c9c]">{PRIORITY[t.priority].label}</span> : null}
                            {late ? <span className="text-[12px] font-semibold text-[#ff9c9c]">⚠ Muddati o‘tgan</span> : null}
                          </div>
                          <p className="mt-2 text-[15.5px] leading-snug font-semibold break-words text-white group-hover:text-[#d4fc18]">{t.title}</p>
                          <p className="mt-1 text-[12.5px] text-[#8e8e96]">
                            {[t.client?.name ?? (t.content ? null : 'Ichki vazifa'), t.content ? `Kontent bosqichi: ${CONTENT_STATUS[t.content.status].label}` : t.project?.name].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {t.status === 'done' ? (
                            <p className="text-[12px] text-emerald-300">{formatShortDateTime(t.completed_at)}</p>
                          ) : t.due_at ? (
                            <p className={`text-[12.5px] font-medium ${late ? 'text-[#ff9c9c]' : 'text-[#d9d9de]'}`}>{formatShortDateTime(t.due_at)}</p>
                          ) : (
                            <p className="text-[12px] text-[#6e6e76]">Muddatsiz</p>
                          )}
                          <SiteIcon name="arrowRight" size={16} className="mt-3 ml-auto text-[#6e6e76] group-hover:text-[#d4fc18]" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Panel>
                <p className="py-6 text-center text-[14px] text-[#8e8e96]">Bu bo‘limda vazifa yo‘q.</p>
              </Panel>
            )}
          </div>
          <div className="space-y-6">
            <TeamList members={team.map(({ id, name, title, lastSeen }) => ({ id, name, title, lastSeen }))} me={context.userId} tone="dark" />
            {projects.size ? (
              <div>
                <SectionTitle>Loyihalarim</SectionTitle>
                <ul className="space-y-2.5">
                  {[...projects.entries()].map(([id, p]) => (
                    <li key={id} className="lg rounded-[20px] p-4">
                      <p className="text-[14.5px] font-semibold break-words text-white">{p.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-[#8e8e96]">{p.client ?? 'Ichki loyiha'}</p>
                      <p className="mt-2 text-[12.5px] text-[#a8a8ac]">
                        {p.open} ta ochiq · jami {p.total} ta vazifangiz
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
