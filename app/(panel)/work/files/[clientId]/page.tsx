import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { requireStaff } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Fayllar' };

/** One client's folders on the left, the chosen folder's files on the right, each with a download link. */
export default async function ClientFilesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ folder?: string }> }) {
  await requireStaff();
  const [{ clientId }, { folder: folderParam }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [clientRes, foldersRes] = await Promise.all([supabase.from('clients').select('id, name').eq('id', clientId).maybeSingle(), supabase.rpc('get_client_folders', { p_client_id: clientId })]);
  if (!clientRes.data) notFound();
  if (foldersRes.error) throw foldersRes.error;
  const folders = foldersRes.data;
  const folder = folders.find((f) => f.id === folderParam) ?? folders.find((f) => f.file_count > 0) ?? folders[0];
  const filesRes = folder
    ? await supabase
        .from('files')
        .select('id, name, kind, size_bytes, visibility, uploaded_at, created_at, uploader:profiles!files_uploaded_by_fkey(full_name)')
        .eq('folder_id', folder.id)
        .eq('status', 'uploaded')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
    : null;
  if (filesRes?.error) throw filesRes.error;

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Fayllar', href: '/work/files' }, { label: clientRes.data.name }]} title={clientRes.data.name} />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          {folders.map((f) => (
            <Link
              key={f.id}
              href={`/work/files/${clientId}?folder=${f.id}`}
              aria-current={f.id === folder?.id ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm', f.id === folder?.id ? 'bg-surface-2 font-semibold' : 'hover:bg-surface-2')}
            >
              <Icon name="folder" size={16} className="text-muted" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="tabular text-xs text-subtle">{f.file_count}</span>
            </Link>
          ))}
        </Card>
        <div>
          {folder ? (
            <p className="mb-3 text-sm text-muted">
              {folder.visibility === 'client' ? 'Mijoz ham ko‘radi' : 'Faqat jamoa ko‘radi'} · {folder.file_count} ta fayl · {formatBytes(folder.total_bytes)}
            </p>
          ) : null}
          {!filesRes?.data?.length ? (
            <EmptyRow>Bu papkada fayl yo‘q. Fayllar mobil ilovadan yuklanadi.</EmptyRow>
          ) : (
            <Table columns={['Fayl', 'Hajmi', 'Kim yukladi', 'Qachon', '']}>
              {filesRes.data.map((f) => (
                <tr key={f.id} className={rowClass}>
                  <td className={cellClass}>
                    <span className="font-medium">{f.name}</span>
                    {f.visibility === 'internal' && folder?.visibility === 'client' ? (
                      <span className="ml-2">
                        <Badge>Ichki</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className={`${cellClass} tabular text-muted`}>{formatBytes(f.size_bytes)}</td>
                  <td className={`${cellClass} text-muted`}>{f.uploader?.full_name ?? '—'}</td>
                  <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(f.uploaded_at ?? f.created_at)}</td>
                  <td className={cellClass}>
                    <a href={`/api/files/${f.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
                      <Icon name="download" size={15} />
                      Yuklab olish
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
