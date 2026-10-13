import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { Chip, Panel, SectionTitle } from '@/components/cabinet/partner/parts';
import { StatusPill } from '@/components/cabinet/StatusPill';
import { SiteIcon } from '@/components/site/SiteIcon';
import { getSessionContext } from '@/lib/auth';
import { homeFor, isPanelUser } from '@/lib/cabinet/routing';
import { groupOf, type TaskGroup } from '@/lib/cabinet/tasks';
import { PRIORITY, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Xodim kabineti' };

const GROUPS: { key: TaskGroup; label: string }[] = [
  { key: 'faol', label: 'Faol' },
  { key: 'tekshiruv', label: 'Tekshiruvda' },
  { key: 'bajarilgan', label: 'Bajarilgan' },
];

/** Staff cabinet: only the tasks assigned to this person (the database filters the rest out). */
export default async function EmployeeCabinetPage({ searchParams }: { searchParams: Promise<{ holat?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=xodim');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.kind !== 'staff') redirect(home);
  if (context.temporary_password) redirect('/parol');
  const { holat } = await searchParams;
  const group: TaskGroup = GROUPS.some((g) => g.key === holat) ? (holat as TaskGroup) : 'faol';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `id, title, task_type, status, priority, due_at, completed_at, created_at,
       client:clients(id, name),
       project:projects!tasks_project_id_client_id_fkey(id, name),
       mine:task_assignments!inner(user_id)`,
    )
    .eq('mine.user_id', context.userId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) throw error;

  const now = Date.now();
  const tasks = data ?? [];
  const open = tasks.filter((t) => groupOf(t.status) === 'faol');
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const today = open.filter((t) => t.due_at && new Date(t.due_at).getTime() >= now && new Date(t.due_at).getTime() < now + 24 * 3600 * 1000);
  const doneMonth = tasks.filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() > now - 30 * 24 * 3600 * 1000);
  const shown = tasks
    .filter((t) => groupOf(t.status) === group)
    .sort((a, b) => (group === 'bajarilgan' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : 0));

  const projects = new Map<string, { name: string; client: string | null; open: number; total: number }>();
  for (const t of tasks) {
    if (!t.project) continue;
    const p = projects.get(t.project.id) ?? { name: t.project.name, client: t.client?.name ?? null, open: 0, total: 0 };
    p.total += 1;
    if (groupOf(t.status) !== 'bajarilgan') p.open += 1;
    projects.set(t.project.id, p);
  }

  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';

  return (
    <>
      <CabinetHeader name={context.profile?.full_name || context.profile?.email || ''} role={role} home="/xodim" />
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-20 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Xodim kabineti</p>
            <h1 className="font-display mt-1.5 text-[28px] leading-tight font-medium tracking-[-0.03em] text-white sm:text-[38px]">
              Salom, {(context.profile?.full_name ?? '').split(' ')[0] || 'hamkasb'}
            </h1>
            <p className="mt-1.5 text-[14px] text-[#a8a8ac]">Sizga biriktirilgan vazifalar va loyihalar.</p>
          </div>
          {isPanelUser(context) ? (
            <Link href="/panel" className="lg inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-white hover:text-[#d4fc18]">
              Boshqaruv paneli <SiteIcon name="arrowRight" size={16} />
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Faol vazifalar', value: open.length, tone: 'text-white' },
            { label: '24 soat ichida muddati', value: today.length, tone: 'text-[#d4fc18]' },
            { label: 'Muddati o‘tgan', value: overdue.length, tone: overdue.length ? 'text-[#ff9c9c]' : 'text-white' },
            { label: 'Bajarildi (30 kun)', value: doneMonth.length, tone: 'text-white' },
          ].map((s) => (
            <div key={s.label} className="lg rounded-[22px] p-4 sm:p-5">
              <p className="text-[12.5px] font-medium text-[#a8a8ac]">{s.label}</p>
              <p className={`font-display mt-2 text-[28px] leading-none font-medium tabular-nums ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <Chip key={g.key} href={g.key === 'faol' ? '/xodim' : `/xodim?holat=${g.key}`} active={g.key === group}>
                  {g.label} · {tasks.filter((t) => groupOf(t.status) === g.key).length}
                </Chip>
              ))}
            </div>
            {shown.length ? (
              <ul className="space-y-2.5">
                {shown.map((t) => {
                  const late = groupOf(t.status) === 'faol' && t.due_at && new Date(t.due_at).getTime() < now;
                  return (
                    <li key={t.id}>
                      <Link href={`/xodim/vazifa/${t.id}`} className="lg group flex items-start gap-4 rounded-[22px] p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={t.status} />
                            <span className="text-[12px] text-[#8e8e96]">{TASK_TYPE[t.task_type]}</span>
                            {t.priority === 'high' || t.priority === 'urgent' ? (
                              <span className="text-[12px] font-semibold text-[#ff9c9c]">{PRIORITY[t.priority].label}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-[15.5px] leading-snug font-semibold break-words text-white group-hover:text-[#d4fc18]">{t.title}</p>
                          <p className="mt-1 text-[12.5px] text-[#8e8e96]">{[t.client?.name, t.project?.name].filter(Boolean).join(' · ') || 'Ichki vazifa'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {t.status === 'done' ? (
                            <p className="text-[12px] text-emerald-300">{formatShortDateTime(t.completed_at)}</p>
                          ) : t.due_at ? (
                            <p className={`text-[12.5px] font-medium ${late ? 'text-[#ff9c9c]' : 'text-[#d9d9de]'}`}>
                              {late ? 'Kechikdi · ' : ''}
                              {formatShortDateTime(t.due_at)}
                            </p>
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
                <p className="py-6 text-center text-[14px] text-[#8e8e96]">
                  {group === 'faol' ? 'Hozircha sizga biriktirilgan faol vazifa yo‘q.' : group === 'tekshiruv' ? 'Tekshiruvdagi vazifa yo‘q.' : 'Bajarilgan vazifalar hali yo‘q.'}
                </p>
              </Panel>
            )}
          </div>
          <div>
            <SectionTitle>Loyihalarim</SectionTitle>
            {projects.size ? (
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
            ) : (
              <Panel>
                <p className="text-[13.5px] text-[#8e8e96]">Loyihaga bog‘langan vazifangiz yo‘q.</p>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
