import type { Metadata } from 'next';

import { cellClass, ChipLinks, RowLink, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { requirePermission } from '@/lib/auth';
import { lookup, VERSION_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Tasdiqlashlar' };

const TABS = [
  { key: 'review', label: 'Tekshirish kerak' },
  { key: 'client', label: 'Mijoz javobini kutmoqda' },
  { key: 'rework', label: 'O‘zgartirishlar' },
  { key: 'history', label: 'Tarix' },
] as const;

const VERSION_SELECT =
  'id, version_number, status, submitted_at, sent_to_client_at, decided_at, submitter:profiles!content_versions_submitted_by_fkey(full_name), content:content_items!content_versions_content_id_client_id_fkey(id, title, client_approval_due_at, client:clients(name))';

/** Ish jarayoni → Tasdiqlashlar: who is waiting for whom. Watching and deciding happens in the mobile review screen. */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission('approvals.manage');
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'review';
  const supabase = await createClient();

  const [review, client, rework] = await Promise.all([
    supabase.from('content_versions').select(VERSION_SELECT).eq('status', 'internal_review').order('submitted_at'),
    supabase.from('content_versions').select(VERSION_SELECT).eq('status', 'client_review').order('sent_to_client_at'),
    supabase
      .from('revisions')
      .select('id, revision_number, status, stage, summary, requested_at, content:content_items!revisions_content_id_client_id_fkey(id, title, client:clients(name))')
      .in('status', ['open', 'in_progress'])
      .order('requested_at'),
  ]);
  const history =
    tab === 'history'
      ? await supabase.from('content_versions').select(VERSION_SELECT).in('status', ['approved', 'changes_requested']).order('decided_at', { ascending: false, nullsFirst: false }).limit(50)
      : null;
  for (const r of [review, client, rework, history]) if (r?.error) throw r.error;
  const counts = { review: review.data?.length ?? 0, client: client.data?.length ?? 0, rework: rework.data?.length ?? 0 };

  const versions = tab === 'review' ? review.data : tab === 'client' ? client.data : tab === 'history' ? history?.data : null;

  return (
    <div>
      <PageHeader title="Tasdiqlashlar" description="Montajdan chiqqan videolar: kim tekshirishi kerak, mijoz nimani kutyapti, nimani qayta ishlash kerak." />
      <div className="mb-5">
        <ChipLinks
          items={TABS.map((t) => ({
            label: t.label,
            href: t.key === 'review' ? '/work/approvals' : `/work/approvals?tab=${t.key}`,
            active: tab === t.key,
            count: t.key === 'history' ? undefined : counts[t.key],
          }))}
        />
      </div>

      {tab === 'rework' ? (
        (rework.data ?? []).length === 0 ? (
          <EmptyRow>Ochiq o‘zgartirish yo‘q</EmptyRow>
        ) : (
          <Table columns={['Kontent', 'Mijoz', 'Kimdan', 'Nima o‘zgarsin', 'Qachondan', 'Holat']}>
            {(rework.data ?? []).map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/work/content/${r.content?.id}?tab=approval`}>
                    <span className="font-medium">{r.content?.title ?? 'Kontent'}</span>
                    <span className="block text-[13px] text-muted">O‘zgartirish #{r.revision_number}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{r.content?.client?.name ?? '—'}</td>
                <td className={`${cellClass} text-muted`}>{r.stage === 'client' ? 'Mijozdan' : 'Tekshiruvdan'}</td>
                <td className={`${cellClass} max-w-xs truncate text-muted`}>{r.summary ?? '—'}</td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(r.requested_at)}</td>
                <td className={cellClass}>
                  <Badge tone={r.status === 'open' ? 'danger' : 'accent'}>{r.status === 'open' ? 'Kutmoqda' : 'Bajarilmoqda'}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : (versions ?? []).length === 0 ? (
        <EmptyRow>{tab === 'review' ? 'Tekshirishni kutayotgan video yo‘q.' : tab === 'client' ? 'Mijoz javobini kutayotgan video yo‘q.' : 'Hali qaror yo‘q.'}</EmptyRow>
      ) : (
        <Table columns={['Kontent', 'Mijoz', 'Kim yubordi', tab === 'history' ? 'Qaror vaqti' : 'Yuborilgan', tab === 'client' ? 'Javob muddati' : 'Holat']}>
          {(versions ?? []).map((v) => {
            const vs = lookup(VERSION_STATUS, v.status, VERSION_STATUS.internal_review);
            const due = v.content?.client_approval_due_at;
            const late = !!due && new Date(due).getTime() < Date.now();
            return (
              <tr key={v.id} className={rowClass}>
                <td className={cellClass}>
                  <RowLink href={`/work/content/${v.content?.id}?tab=approval`}>
                    <span className="font-medium">{v.content?.title ?? 'Kontent'}</span>
                    <span className="block text-[13px] text-muted">Versiya {v.version_number}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{v.content?.client?.name ?? '—'}</td>
                <td className={`${cellClass} text-muted`}>{v.submitter?.full_name ?? '—'}</td>
                <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>
                  {formatShortDateTime(tab === 'history' ? v.decided_at : tab === 'client' ? (v.sent_to_client_at ?? v.submitted_at) : v.submitted_at)}
                </td>
                <td className={cellClass}>
                  {tab === 'client' ? (
                    <span className={`tabular text-sm ${late ? 'font-medium text-danger' : 'text-muted'}`}>{due ? `${late ? 'Kechikdi · ' : ''}${formatShortDateTime(due)}` : '—'}</span>
                  ) : (
                    <Badge tone={vs.tone}>{vs.label}</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-4 text-sm text-muted">Videoni ko‘rish, vaqtli izoh qoldirish va qaror qabul qilish SUN MEDIA mobil ilovasining “Xabarlar → Tasdiqlashlar” bo‘limida.</p>
    </div>
  );
}
