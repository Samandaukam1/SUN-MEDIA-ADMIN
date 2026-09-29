import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { cellClass, ChipLinks, Pager, RowLink, rowClass, SearchBox, Table, withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { can, requireStaff } from '@/lib/auth';
import { loadStaff } from '@/lib/directory';
import { lookup, PRIORITY, TASK_STATUS, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Vazifalar' };
const PAGE = 40;
const OPEN = ['todo', 'in_progress', 'in_review', 'revision'] as const;
type Search = { due?: string; state?: string; who?: string; q?: string; page?: string; created?: string };

/** Ish jarayoni → Vazifalar: open work first, late work one click away, filter by person. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await requireStaff();
  if (!['tasks.manage', 'tasks.read_all'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const view = params.due === 'overdue' ? 'overdue' : params.state === 'done' ? 'done' : 'open';
  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('tasks')
    .select(
      `id, title, task_type, status, priority, due_at, client:clients(name),
       assignees:task_assignments(user_id, person:profiles!task_assignments_user_id_fkey(full_name))${params.who ? ', mine:task_assignments!inner(user_id)' : ''}`,
    )
    .is('deleted_at', null);
  if (view === 'done') query = query.eq('status', 'done').order('completed_at', { ascending: false, nullsFirst: false });
  else if (view === 'overdue') query = query.in('status', [...OPEN]).lt('due_at', now).order('due_at');
  else query = query.in('status', [...OPEN]).order('due_at', { ascending: true, nullsFirst: false });
  if (params.who) query = query.eq('mine.user_id', params.who);
  if (params.q?.trim()) query = query.ilike('title', `%${params.q.trim().replace(/[%_\\]/g, '\\$&')}%`);

  const [{ data, error }, staff, overdueCount] = await Promise.all([
    query.range(page * PAGE, page * PAGE + PAGE),
    loadStaff(),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('status', [...OPEN]).lt('due_at', now),
  ]);
  if (error) throw error;
  const rows = (data as unknown as TaskRow[]).slice(0, PAGE);
  const keep = { who: params.who, q: params.q };

  return (
    <div>
      <PageHeader
        title="Vazifalar"
        description="Kim nima qilyapti va qachongacha."
        actions={can(context, 'tasks.manage') ? <ButtonLink href="/work/tasks/new" variant="primary">+ Vazifa</ButtonLink> : null}
      />
      {params.created ? (
        <div className="mb-4">
          <Notice tone="success" title="Vazifa yaratildi. Mas’ul xodimga bildirishnoma yuborildi." />
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Vazifa nomi" value={params.q} keep={{ who: params.who, due: params.due, state: params.state }} />
        <form className="flex gap-2">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          {params.due ? <input type="hidden" name="due" value={params.due} /> : null}
          {params.state ? <input type="hidden" name="state" value={params.state} /> : null}
          <select name="who" defaultValue={params.who ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mas’ul">
            <option value="">Hamma xodimlar</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            Ko‘rsatish
          </button>
        </form>
      </div>
      <div className="mb-5">
        <ChipLinks
          items={[
            { label: 'Ochiq', href: withParams('/work/tasks', keep), active: view === 'open' },
            { label: 'Kechikkan', href: withParams('/work/tasks', keep, { due: 'overdue' }), active: view === 'overdue', count: overdueCount.count ?? 0 },
            { label: 'Bajarilgan', href: withParams('/work/tasks', keep, { state: 'done' }), active: view === 'done' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyRow>{view === 'overdue' ? 'Kechikkan vazifa yo‘q — zo‘r!' : view === 'done' ? 'Hali bajarilgan vazifa yo‘q.' : 'Ochiq vazifa yo‘q.'}</EmptyRow>
      ) : (
        <Table columns={['Vazifa', 'Mijoz', 'Mas’ul', 'Muddat', 'Holat']}>
          {rows.map((t) => {
            const late = t.due_at && OPEN.includes(t.status as (typeof OPEN)[number]) && t.due_at < now;
            const status = late ? { label: 'Kechikdi', tone: 'danger' as const } : lookup(TASK_STATUS, t.status, TASK_STATUS.todo);
            const priority = lookup(PRIORITY, t.priority, PRIORITY.normal);
            return (
              <tr key={t.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/work/tasks/${t.id}`}>
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-[13px] text-muted">
                      {lookup(TASK_TYPE, t.task_type, 'Vazifa')}
                      {t.priority === 'high' || t.priority === 'urgent' ? ` · ${priority.label}` : ''}
                    </span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{t.client?.name ?? '—'}</td>
                <td className={`${cellClass} text-muted`}>{t.assignees.map((a) => a.person?.full_name).filter(Boolean).join(', ') || 'Biriktirilmagan'}</td>
                <td className={`${cellClass} tabular whitespace-nowrap ${late ? 'font-medium text-danger' : 'text-muted'}`}>{t.due_at ? formatShortDateTime(t.due_at) : '—'}</td>
                <td className={cellClass}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={page} hasNext={(data?.length ?? 0) > PAGE} href={(p) => withParams('/work/tasks', { ...keep, due: params.due, state: params.state }, { page: p ? String(p) : undefined })} />
    </div>
  );
}

type TaskRow = {
  id: string;
  title: string;
  task_type: string;
  status: string;
  priority: string;
  due_at: string | null;
  client: { name: string } | null;
  assignees: { user_id: string; person: { full_name: string } | null }[];
};
