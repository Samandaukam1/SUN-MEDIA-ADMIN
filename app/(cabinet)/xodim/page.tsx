import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { CheckInCard } from '@/components/cabinet/CheckInCard';
import { StaffHeaderActions } from '@/components/cabinet/StaffHeaderActions';
import { Chip, Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { StatusPill } from '@/components/cabinet/StatusPill';
import { PresenceHeartbeat } from '@/components/live/PresenceHeartbeat';
import { TeamList } from '@/components/live/TeamList';
import { LiveRefresh } from '@/components/panel/LiveRefresh';
import { SiteIcon } from '@/components/site/SiteIcon';
import { agencyToday } from '@/lib/attendance';
import { getSessionContext } from '@/lib/auth';
import { homeFor, isPanelUser } from '@/lib/cabinet/routing';
import { groupOf, type TaskGroup } from '@/lib/cabinet/tasks';
import { loadMyChats, unreadTotal } from '@/lib/chat';
import { CONTENT_STATUS, PRIORITY, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { loadTeam } from '@/lib/team-directory';
import { formatShortDateTime, formatTime } from '@/lib/time';
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
const DAY = 24 * 3600 * 1000;

/**
 * Staff cabinet home: greeting, today's attendance (KELDIM first of all), today's tasks, new notifications,
 * upcoming deadlines and chat; then the full task list and the team. Only this person's rows come back
 * (row-level security), and the page follows the person's realtime topic.
 */
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
  const today = agencyToday();
  const [{ data, error }, attendance, employee, setting, team, notifications, chats] = await Promise.all([
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
    supabase
      .from('attendance')
      .select('arrived_at, status, late_minutes, source, corrector:profiles!attendance_corrected_by_fkey(full_name)')
      .eq('user_id', context.userId)
      .eq('work_date', today)
      .maybeSingle(),
    supabase.from('employees').select('work_start_time').eq('user_id', context.userId).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'attendance.check_in_from').maybeSingle(),
    loadTeam(),
    supabase.from('notifications').select('id, title, body, created_at, data').is('read_at', null).neq('type', 'chat.message').order('created_at', { ascending: false }).limit(5),
    loadMyChats().catch(() => []),
  ]);
  if (error) throw error;

  const now = Date.now();
  const tasks = data ?? [];
  const open = tasks.filter((t) => inFilter('faol', groupOf(t.status)));
  const due = (t: (typeof tasks)[number]) => (t.due_at ? new Date(t.due_at).getTime() : null);
  const overdue = open.filter((t) => (due(t) ?? Infinity) < now);
  const todayTasks = open.filter((t) => t.status === 'in_progress' || t.status === 'revision' || (t.due_at && agencyToday(new Date(t.due_at)) <= today));
  const upcoming = open.filter((t) => (due(t) ?? 0) >= now && (due(t) ?? 0) < now + 3 * DAY).slice(0, 6);
  const shown = tasks
    .filter((t) => inFilter(filter, groupOf(t.status)))
    .sort((a, b) => (filter === 'bajarilgan' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : 0));
  const recentChats = [...chats].filter((c) => !c.archived).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')).slice(0, 4);

  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';
  const from = typeof setting.data?.value === 'string' ? setting.data.value : '09:45';
  const firstName = (context.profile?.full_name ?? '').split(' ')[0] || 'hamkasb';
  const hasEmployee = !!employee.data;

  return (
    <>
      <PresenceHeartbeat />
      <LiveRefresh topics={[`user:${context.userId}`]} quiet />
      <CabinetHeader
        name={context.profile?.full_name || context.profile?.email || ''}
        role={role}
        home="/xodim"
        extra={<StaffHeaderActions userId={context.userId} unreadChats={unreadTotal(chats)} />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-20 sm:px-8 sm:pt-12">
        {/* 1. Salomlashuv */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Bugun Sun Media’da</p>
            <h1 className="font-display mt-1.5 text-[28px] leading-tight font-medium tracking-[-0.03em] text-white sm:text-[38px]">Assalomu alaykum, {firstName}!</h1>
            <p className="mt-1.5 text-[14px] text-[#a8a8ac]">Davomatingiz, bugungi ishlaringiz va jamoa — bir joyda.</p>
          </div>
          {isPanelUser(context) ? (
            <Link href="/panel" className="lg inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
              Boshqaruv paneli <SiteIcon name="arrowRight" size={16} />
            </Link>
          ) : null}
        </div>

        {/* 2. Bugungi davomat */}
        {hasEmployee ? (
          <CheckInCard
            record={
              attendance.data
                ? {
                    arrivedAt: attendance.data.arrived_at,
                    status: attendance.data.status,
                    lateMinutes: attendance.data.late_minutes ?? 0,
                    source: attendance.data.source,
                    correctedBy: attendance.data.corrector?.full_name ?? null,
                  }
                : null
            }
            from={from}
            workStart={employee.data?.work_start_time ?? null}
            serverNow={new Date().toISOString()}
            today={today}
            name={firstName}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* 3. Bugungi vazifalar */}
          <Panel title="Bugungi vazifalar" note={`${todayTasks.length} ta`}>
            {todayTasks.length ? (
              <ul className="space-y-2">
                {todayTasks.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Link href={`/xodim/vazifa/${t.id}`} className="group flex items-start justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 hover:bg-white/[0.06]">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-white group-hover:text-[#d4fc18]">{t.title}</span>
                        <span className="block text-[12px] text-[#8e8e96]">{t.stage ? stageStatusLabel(t.stage as Stage, t.status) : TASK_TYPE[t.task_type]}</span>
                      </span>
                      {t.due_at ? <span className={`shrink-0 text-[12px] tabular-nums ${(due(t) ?? 0) < now ? 'text-[#ff9c9c]' : 'text-[#d9d9de]'}`}>{formatTime(t.due_at)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-[#8e8e96]">Bugun uchun ochiq vazifa yo‘q.</p>
            )}
            {overdue.length ? <p className="mt-3 text-[12.5px] font-semibold text-[#ff9c9c]">⚠ {overdue.length} ta vazifa muddati o‘tgan</p> : null}
          </Panel>

          {/* 5. Yaqinlashayotgan deadline */}
          <Panel title="Yaqinlashayotgan deadline" note="3 kun ichida">
            {upcoming.length ? (
              <ul className="space-y-2">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <Link href={`/xodim/vazifa/${t.id}`} className="group flex items-start justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 hover:bg-white/[0.06]">
                      <span className="min-w-0 truncate text-[14px] font-medium text-white group-hover:text-[#d4fc18]">{t.title}</span>
                      <span className="shrink-0 text-[12px] text-[#d4fc18] tabular-nums">{formatShortDateTime(t.due_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-[#8e8e96]">Yaqin kunlarda muddati tugaydigan vazifa yo‘q.</p>
            )}
          </Panel>

          {/* 4. Yangi bildirishnomalar */}
          <Panel title="Yangi bildirishnomalar" note={notifications.data?.length ? `${notifications.data.length} ta` : undefined}>
            {notifications.data?.length ? (
              <ul className="space-y-2">
                {notifications.data.map((n) => {
                  const d = (n.data ?? {}) as { staff_href?: string };
                  const href = typeof d.staff_href === 'string' && d.staff_href.startsWith('/') ? d.staff_href : '/xodim';
                  return (
                    <li key={n.id}>
                      <Link href={href} className="block rounded-2xl bg-[#d4fc18]/[0.04] px-3.5 py-2.5 hover:bg-white/[0.06]">
                        <span className="block text-[13.5px] font-semibold text-white">{n.title}</span>
                        {n.body ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-[#a8a8ac]">{n.body}</span> : null}
                        <span className="mt-1 block text-[11.5px] text-[#6e6e76]">{formatShortDateTime(n.created_at)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13.5px] text-[#8e8e96]">Yangi bildirishnoma yo‘q.</p>
            )}
          </Panel>
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
                  const late = inFilter('faol', groupOf(t.status)) && (due(t) ?? Infinity) < now;
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
            {/* 6. Chat */}
            <Panel title="Chat" note={unreadTotal(chats) ? `${unreadTotal(chats)} ta yangi xabar` : undefined}>
              {recentChats.length ? (
                <ul className="space-y-1.5">
                  {recentChats.map((c) => (
                    <li key={c.room_id}>
                      <Link href={`/xodim/chat?xona=${c.room_id}`} className="flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-white/[0.05]">
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[14px] ${c.unread_count ? 'font-semibold text-white' : 'text-[#d9d9de]'}`}>
                            {c.kind === 'direct' ? (c.peer_name ?? 'Suhbat') : c.kind === 'project' ? (c.client_name ?? c.name ?? 'Mijoz') : (c.name ?? 'Guruh')}
                          </span>
                          <span className="block truncate text-[12px] text-[#8e8e96]">
                            {c.last_sender_name ? `${c.last_sender_name}: ` : ''}
                            {c.last_message_body || (c.last_has_files ? 'Fayl' : 'Xabar yo‘q')}
                          </span>
                        </span>
                        {c.unread_count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#d4fc18] px-1.5 text-[11px] font-bold text-[#0b0b0c]">{c.unread_count}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-[#8e8e96]">Hali suhbat yo‘q.</p>
              )}
              <Link href="/xodim/chat" className="s-btn s-btn-glass lg mt-4 h-11 w-full text-[14px]">
                Chatni ochish
              </Link>
            </Panel>
            <TeamList members={team.map(({ id, name, title, lastSeen }) => ({ id, name, title, lastSeen }))} me={context.userId} tone="dark" />
          </div>
        </div>
      </main>
    </>
  );
}
