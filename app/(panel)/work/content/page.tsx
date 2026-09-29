import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { cellClass, ChipLinks, Pager, RowLink, rowClass, SearchBox, Table, withParams } from '@/components/panel/List';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { can, requireStaff } from '@/lib/auth';
import { CONTENT_STAGES, isOverdue } from '@/lib/content';
import { CONTENT_STATUS, CONTENT_TYPE, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Kontent' };

const PAGE = 40;
type Search = { q?: string; stage?: string; client?: string; due?: string; page?: string };

/** Ish jarayoni → Kontent: every item with its stage, client and deadline; the page opens the details. */
export default async function ContentListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await requireStaff();
  if (!['content.manage', 'clients.read_all', 'approvals.manage'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const stage = CONTENT_STAGES.find((s) => s.key === params.stage);
  const supabase = await createClient();

  let query = supabase
    .from('content_items')
    .select('id, number, title, content_type, status, due_at, client:clients(id, name, code), team:content_assignments(role, person:profiles!content_assignments_user_id_fkey(full_name)), publications:content_publications(scheduled_at, status)')
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (stage) query = query.in('status', stage.statuses);
  if (params.client) query = query.eq('client_id', params.client);
  if (params.due === 'overdue') query = query.lt('due_at', new Date().toISOString()).not('status', 'in', '(approved,scheduled,published,cancelled)');
  if (params.q?.trim()) query = query.ilike('title', `%${params.q.trim().replace(/[%_\\]/g, '\\$&')}%`);

  const [itemsRes, countsRes, clientsRes] = await Promise.all([
    query.order('updated_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE),
    supabase.from('content_items').select('status').is('deleted_at', null).neq('status', 'cancelled'),
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data.slice(0, PAGE);
  const all = countsRes.data ?? [];
  const keep = { q: params.q, client: params.client, due: params.due };

  return (
    <div>
      <PageHeader
        title="Kontent"
        description="Har bir kontent qayergacha yetgani: bosqich, mijoz va muddat."
        actions={can(context, 'content.manage') ? <ButtonLink href="/work/content/new" variant="primary">+ Kontent</ButtonLink> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Kontent nomi" value={params.q} keep={{ stage: params.stage, client: params.client, due: params.due }} />
        <form className="flex gap-3">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          {params.stage ? <input type="hidden" name="stage" value={params.stage} /> : null}
          <select name="client" defaultValue={params.client ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mijoz">
            <option value="">Barcha mijozlar</option>
            {(clientsRes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="due" defaultValue={params.due ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Muddat">
            <option value="">Har qanday muddat</option>
            <option value="overdue">Muddati o‘tgan</option>
          </select>
          <button type="submit" className="h-10 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            Ko‘rsatish
          </button>
        </form>
      </div>

      <div className="mb-5">
        <ChipLinks
          items={[
            { label: 'Barchasi', href: withParams('/work/content', keep), active: !stage, count: all.length },
            ...CONTENT_STAGES.map((s) => ({
              label: s.label,
              href: withParams('/work/content', keep, { stage: s.key }),
              active: stage?.key === s.key,
              count: all.filter((r) => s.statuses.includes(r.status)).length,
            })),
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyRow>{all.length === 0 ? 'Hali kontent yaratilmagan. “+ Kontent” tugmasi bilan boshlang.' : 'Bu filtrga mos kontent yo‘q.'}</EmptyRow>
      ) : (
        <Table columns={['Kontent', 'Mijoz', 'Holat', 'Muddat', { label: 'Jamoa', className: 'hidden xl:table-cell' }, { label: 'Post', className: 'hidden lg:table-cell' }]}>
          {items.map((c) => {
            const status = lookup(CONTENT_STATUS, c.status, CONTENT_STATUS.idea);
            const overdue = isOverdue(c);
            const post = c.publications.find((p) => p.status !== 'cancelled' && p.scheduled_at)?.scheduled_at;
            return (
              <tr key={c.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/work/content/${c.id}`}>
                    <span className="block font-medium">{c.title}</span>
                    <span className="block text-[13px] text-muted">
                      {lookup(CONTENT_TYPE, c.content_type, 'Kontent')} · #{c.number}
                    </span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{c.client?.name ?? '—'}</td>
                <td className={cellClass}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
                <td className={`${cellClass} tabular whitespace-nowrap ${overdue ? 'font-medium text-danger' : 'text-muted'}`}>
                  {c.due_at ? `${overdue ? 'Kechikdi · ' : ''}${formatShortDateTime(c.due_at)}` : '—'}
                </td>
                <td className={`${cellClass} hidden text-muted xl:table-cell`}>
                  {c.team.map((t) => t.person?.full_name.split(' ')[0]).filter(Boolean).join(', ') || '—'}
                </td>
                <td className={`${cellClass} tabular hidden whitespace-nowrap text-muted lg:table-cell`}>{post ? formatShortDateTime(post) : '—'}</td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={page} hasNext={itemsRes.data.length > PAGE} href={(p) => withParams('/work/content', { ...keep, stage: params.stage }, { page: p ? String(p) : undefined })} />
    </div>
  );
}
