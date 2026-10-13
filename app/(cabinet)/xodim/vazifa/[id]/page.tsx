import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { Panel } from '@/components/cabinet/partner/parts';
import { fileSize } from '@/components/cabinet/partner/parts';
import { StatusPill } from '@/components/cabinet/StatusPill';
import { TaskComment, TaskStatusButtons, TaskUpload } from '@/components/cabinet/TaskControls';
import { SiteIcon } from '@/components/site/SiteIcon';
import { getSessionContext } from '@/lib/auth';
import { homeFor } from '@/lib/cabinet/routing';
import { assigneeActions } from '@/lib/cabinet/tasks';
import { PRIORITY, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Vazifa' };

const PERSON = 'id, full_name';

export default async function EmployeeTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/?kirish=xodim');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.kind !== 'staff') redirect(home);
  if (context.temporary_password) redirect('/parol');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  // Only a task assigned to this person opens here.
  const { data: task } = await supabase
    .from('tasks')
    .select(
      `id, title, description, task_type, status, priority, starts_at, due_at, started_at, completed_at,
       client:clients(id, name),
       project:projects!tasks_project_id_client_id_fkey(id, name),
       content:content_items!tasks_content_id_client_id_fkey(id, title),
       shooting:shootings!tasks_shooting_id_client_id_fkey(id, title, starts_at),
       creator:profiles!tasks_created_by_fkey(${PERSON}),
       checklist:task_checklist_items(id, title, is_done, position),
       mine:task_assignments!inner(user_id)`,
    )
    .eq('id', id)
    .eq('mine.user_id', context.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!task) notFound();

  const [comments, files] = await Promise.all([
    supabase
      .from('task_comments')
      .select(`id, body, created_at, author:profiles!task_comments_author_id_fkey(${PERSON})`)
      .eq('task_id', id)
      .order('created_at'),
    supabase
      .from('files')
      .select('id, name, size_bytes, created_at, uploader:profiles!files_uploaded_by_fkey(full_name)')
      .eq('task_id', id)
      .eq('status', 'uploaded')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const late = ['todo', 'in_progress', 'revision'].includes(task.status) && task.due_at && new Date(task.due_at).getTime() < Date.now();
  const checklist = [...(task.checklist ?? [])].sort((a, b) => a.position - b.position);
  const role = context.employee?.job_title || context.roles.map((r) => r.name).join(', ') || 'Xodim';

  return (
    <>
      <CabinetHeader name={context.profile?.full_name || context.profile?.email || ''} role={role} home="/xodim" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 pt-8 pb-20 sm:px-8 sm:pt-10">
        <Link href="/xodim" className="inline-flex items-center gap-2 text-[13.5px] text-[#a8a8ac] hover:text-white">
          <SiteIcon name="arrowRight" size={15} className="rotate-180" /> Vazifalarim
        </Link>

        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            <span className="text-[12.5px] text-[#8e8e96]">{TASK_TYPE[task.task_type]}</span>
            <span className="text-[12.5px] text-[#8e8e96]">· {PRIORITY[task.priority].label} muhimlik</span>
          </div>
          <h1 className="font-display mt-4 text-[24px] leading-snug font-medium tracking-[-0.02em] break-words text-white sm:text-[30px]">{task.title}</h1>
          <dl className="mt-5 grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
            {[
              ['Mijoz', task.client?.name ?? 'Ichki vazifa'],
              ['Loyiha', task.project?.name],
              ['Kontent', task.content?.title],
              ['Syomka', task.shooting ? `${task.shooting.title} · ${formatShortDateTime(task.shooting.starts_at)}` : null],
              ['Muddat', task.due_at ? `${formatShortDateTime(task.due_at)}${late ? ' · kechikdi' : ''}` : 'Muddatsiz'],
              ['Topshirgan', task.creator?.full_name],
              task.completed_at ? ['Bajarildi', formatShortDateTime(task.completed_at)] : null,
            ]
              .filter((row): row is [string, string] => !!row && !!row[1])
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[12px] text-[#6e6e76]">{k}</dt>
                  <dd className={`mt-0.5 break-words ${k === 'Muddat' && late ? 'text-[#ff9c9c]' : 'text-[#e4e4e7]'}`}>{v}</dd>
                </div>
              ))}
          </dl>
          {task.description ? <p className="mt-5 border-t border-white/[0.06] pt-5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#d9d9de]">{task.description}</p> : null}
          <TaskStatusButtons taskId={task.id} actions={assigneeActions(task.status)} />
        </Panel>

        {checklist.length ? (
          <Panel title="Bosqichlar" note={`${checklist.filter((c) => c.is_done).length} / ${checklist.length}`}>
            <ul className="space-y-2">
              {checklist.map((c) => (
                <li key={c.id} className="flex items-start gap-3 text-[14px]">
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${c.is_done ? 'border-[#d4fc18] bg-[#d4fc18] text-[#0b0b0c]' : 'border-white/20'}`}>
                    {c.is_done ? <SiteIcon name="check" size={12} strokeWidth={2.6} /> : null}
                  </span>
                  <span className={c.is_done ? 'text-[#8e8e96] line-through' : 'text-[#e4e4e7]'}>{c.title}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Materiallar" note="vazifaga biriktirilgan fayllar">
          {files.data?.length ? (
            <ul className="mb-5 divide-y divide-white/[0.06]">
              {files.data.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-3 first:pt-0">
                  <SiteIcon name="file" size={17} className="shrink-0 text-[#d4fc18]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-white">{f.name}</p>
                    <p className="text-[12px] text-[#6e6e76]">
                      {[f.uploader?.full_name, fileSize(f.size_bytes), formatShortDateTime(f.created_at)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <a href={`/api/files/${f.id}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[#d9d9de] hover:text-[#d4fc18]" aria-label={`${f.name} — yuklab olish`}>
                    <SiteIcon name="download" size={16} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-5 text-[13.5px] text-[#8e8e96]">Hali material yuklanmagan.</p>
          )}
          <TaskUpload taskId={task.id} />
        </Panel>

        <Panel title="Izohlar">
          {comments.data?.length ? (
            <ul className="mb-5 space-y-4">
              {comments.data.map((c) => (
                <li key={c.id} className="rounded-2xl bg-white/[0.03] px-4 py-3">
                  <p className="text-[12.5px] text-[#8e8e96]">
                    <span className="font-semibold text-[#d9d9de]">{c.author?.full_name ?? '—'}</span> · {formatShortDateTime(c.created_at)}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap break-words text-[#e4e4e7]">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-5 text-[13.5px] text-[#8e8e96]">Izoh yo‘q.</p>
          )}
          <TaskComment taskId={task.id} />
        </Panel>
      </main>
    </>
  );
}
