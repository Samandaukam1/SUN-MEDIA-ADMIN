import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { ArchiveButton, NewAnnouncement, NewCompanyEvent, NewSharedDocument } from '@/components/workspace/WorkspaceForms';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Ish joyi' };

const EVENT_KIND: Record<string, string> = {
  meeting: 'Yig‘ilish',
  holiday: 'Bayram',
  day_off: 'Dam olish',
  company_event: 'Tadbir',
  training: 'Trening',
  birthday: 'Tug‘ilgan kun',
};
const DOC_CATEGORY: Record<string, string> = { sop: 'SOP', guide: 'Qo‘llanma', brand: 'Brend', policy: 'Qoidalar', template: 'Shablon', other: 'Boshqa' };

export default async function WorkspacePage() {
  const context = await requireStaff();
  if (!can(context, 'workspace.manage')) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [annRes, evRes, docRes] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, is_pinned, audience_roles, published_at, author:profiles!announcements_author_id_fkey(full_name), reads:announcement_reads(user_id)')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(20),
    supabase.from('company_events').select('id, title, kind, starts_at, ends_at, all_day, location').gte('ends_at', now).order('starts_at').limit(20),
    supabase.from('shared_documents').select('id, title, category, url, is_pinned, updated_at').order('is_pinned', { ascending: false }).order('title'),
  ]);
  if (annRes.error) throw annRes.error;
  if (evRes.error) throw evRes.error;
  if (docRes.error) throw docRes.error;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Tizim"
        title="Ish joyi"
        description="Barcha xodimlar ko‘radigan e’lonlar, kompaniya tadbirlari va hujjatlar. Mijozlar bu bo‘limni ko‘rmaydi."
      />

      <section>
        <SectionTitle action={<NewAnnouncement />}>E’lonlar</SectionTitle>
        {annRes.data.length === 0 ? (
          <EmptyRow>Hali e’lon yo‘q.</EmptyRow>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {annRes.data.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a.is_pinned ? '📌 ' : ''}
                      {a.title}
                    </p>
                    <p className="text-[13px] text-muted">
                      {a.author?.full_name ?? 'SUN MEDIA'} · {formatShortDateTime(a.published_at)} · {a.reads.length} kishi o‘qidi
                    </p>
                  </div>
                  {a.audience_roles?.length ? <Badge>{a.audience_roles.length} ta rol</Badge> : <Badge tone="accent">Barcha xodimlar</Badge>}
                  <ArchiveButton table="announcements" id={a.id} label="E’lonni olib tashlash" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <section>
          <SectionTitle action={<NewCompanyEvent />}>Kompaniya tadbirlari</SectionTitle>
          {evRes.data.length === 0 ? (
            <EmptyRow>Yaqin tadbirlar yo‘q.</EmptyRow>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {evRes.data.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-[13px] text-muted">
                        {EVENT_KIND[e.kind] ?? e.kind} · {e.all_day ? `${formatShortDateTime(e.starts_at).split(',')[0]}, butun kun` : formatShortDateTime(e.starts_at)}
                        {e.location ? ` · ${e.location}` : ''}
                      </p>
                    </div>
                    <ArchiveButton table="company_events" id={e.id} label="Tadbirni bekor qilish" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
        <section>
          <SectionTitle action={<NewSharedDocument />}>Hujjatlar va SOP</SectionTitle>
          {docRes.data.length === 0 ? (
            <EmptyRow>Hali hujjat qo‘shilmagan.</EmptyRow>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {docRes.data.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                    <Badge>{DOC_CATEGORY[d.category] ?? d.category}</Badge>
                    <a href={d.url ?? '#'} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {d.title}
                    </a>
                    <ArchiveButton table="shared_documents" id={d.id} label="Hujjatni olib tashlash" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
