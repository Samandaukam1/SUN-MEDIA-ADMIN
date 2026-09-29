import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireStaff } from '@/lib/auth';
import { lookup, PRIORITY, TASK_STATUS, TASK_TYPE } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Vazifa' };

/** One task: what, for whom, who does it, until when and its checklist. */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data: t, error } = await supabase
    .from('tasks')
    .select(
      `id, title, description, task_type, status, priority, due_at, completed_at, created_at, content_id,
       client:clients(id, name), content:content_items(id, title),
       assignees:task_assignments(user_id, person:profiles!task_assignments_user_id_fkey(full_name)),
       checklist:task_checklist_items(id, title, is_done, position)`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!t) notFound();
  const late = !!t.due_at && !['done', 'cancelled'].includes(t.status) && new Date(t.due_at).getTime() < Date.now();
  const status = late ? { label: 'Kechikdi', tone: 'danger' as const } : lookup(TASK_STATUS, t.status, TASK_STATUS.todo);
  const checklist = [...t.checklist].sort((a, b) => a.position - b.position);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Vazifalar', href: '/work/tasks' }, { label: t.title }]}
        title={t.title}
        description={[lookup(TASK_TYPE, t.task_type, 'Vazifa'), t.client?.name].filter(Boolean).join(' · ')}
        actions={<Badge tone={status.tone} dot>{status.label}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <SectionTitle>Nima qilish kerak</SectionTitle>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.description || 'Izoh yozilmagan.'}</p>
          </Card>
          {checklist.length ? (
            <Card>
              <SectionTitle>
                Bosqichlar · {checklist.filter((c) => c.is_done).length}/{checklist.length}
              </SectionTitle>
              <ul className="space-y-2 text-sm">
                {checklist.map((c) => (
                  <li key={c.id} className={c.is_done ? 'text-muted line-through' : ''}>
                    {c.is_done ? '✓' : '○'} {c.title}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <Card className="space-y-3 text-sm">
          <Row label="Mas’ul" value={t.assignees.map((a) => a.person?.full_name).filter(Boolean).join(', ') || 'Biriktirilmagan'} />
          <Row label="Muddat" value={t.due_at ? formatShortDateTime(t.due_at) : '—'} danger={late} />
          <Row label="Muhimlik" value={lookup(PRIORITY, t.priority, PRIORITY.normal).label} />
          <Row label="Mijoz" value={t.client?.name ?? '—'} />
          {t.completed_at ? <Row label="Bajarildi" value={formatShortDateTime(t.completed_at)} /> : null}
          {t.content ? (
            <p>
              <span className="text-muted">Kontent: </span>
              <Link href={`/work/content/${t.content.id}`} className="font-medium underline">
                {t.content.title}
              </Link>
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <p className="flex gap-3">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className={danger ? 'font-medium text-danger' : 'font-medium'}>{value}</span>
    </p>
  );
}
