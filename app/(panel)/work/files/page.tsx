import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { can, requireStaff } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Fayllar' };

/** Ish jarayoni → Fayllar: one card per client; inside, the same folders as in the app. */
export default async function FilesPage() {
  const context = await requireStaff();
  if (!['files.manage', 'clients.read_all'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_files_overview');
  if (error) throw error;
  return (
    <div>
      <PageHeader title="Fayllar" description="Har bir mijozning papkalari: xom materiallar, montaj versiyalari, tasdiqlangan fayllar, brend fayllari." />
      {data.length === 0 ? (
        <EmptyRow>Hali mijoz yo‘q</EmptyRow>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Link key={c.client_id} href={`/work/files/${c.client_id}`}>
              <Card className="flex items-center gap-4 transition-colors hover:border-line-strong">
                <Avatar name={c.name} url={c.logo_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-[13px] text-muted">
                    {c.file_count} ta fayl · {formatBytes(c.total_bytes)}
                    {c.last_upload_at ? ` · ${formatShortDateTime(c.last_upload_at)}` : ''}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
