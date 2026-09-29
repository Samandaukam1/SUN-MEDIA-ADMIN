import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireStaff } from '@/lib/auth';
import { CONTENT_STATUS, CONTENT_TYPE, lookup, SHOOTING_STATUS, TASK_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Qidiruv' };

type Hit = { kind: string; id: string; title: string; subtitle: string | null; status: string | null; content_type?: string; number?: number };

const GROUPS: { kind: string; title: string; href: (h: Hit) => string }[] = [
  { kind: 'client', title: 'Mijozlar', href: (h) => `/clients/${h.id}` },
  { kind: 'project', title: 'Loyihalar', href: () => '/clients/projects' },
  { kind: 'content', title: 'Kontent', href: (h) => `/work/content/${h.id}` },
  { kind: 'shooting', title: 'Syomkalar', href: (h) => `/work/shootings/${h.id}` },
  { kind: 'task', title: 'Vazifalar', href: (h) => `/work/tasks/${h.id}` },
  { kind: 'file', title: 'Fayllar', href: (h) => `/api/files/${h.id}` },
  { kind: 'person', title: 'Jamoa', href: (h) => `/team/${h.id}` },
];

function statusOf(h: Hit) {
  if (!h.status) return null;
  if (h.kind === 'content') return lookup(CONTENT_STATUS, h.status, null);
  if (h.kind === 'task') return lookup(TASK_STATUS, h.status, null);
  if (h.kind === 'shooting') return lookup(SHOOTING_STATUS, h.status, null);
  return null;
}

/** One box for everything: "SAFI" finds the client, its projects, reels, shootings and files. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const q = ((await searchParams).q ?? '').trim();
  let hits: Hit[] = [];
  if (q.length >= 2) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('global_search', { p_query: q, p_limit: 8 });
    if (error) throw error;
    hits = (data ?? []) as Hit[];
  }
  const groups = GROUPS.map((g) => ({ ...g, hits: hits.filter((h) => h.kind === g.kind) })).filter((g) => g.hits.length);

  return (
    <div>
      <PageHeader title={q ? `“${q}”` : 'Qidiruv'} description="Mijoz, loyiha, kontent, syomka, vazifa, fayl va xodimlar bo‘yicha." />
      {q.length < 2 ? (
        <EmptyRow>Yuqoridagi qidiruv maydoniga kamida 2 ta harf yozing. Kontent raqami bo‘yicha ham topadi (#12).</EmptyRow>
      ) : groups.length === 0 ? (
        <EmptyRow>“{q}” bo‘yicha hech narsa topilmadi.</EmptyRow>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {groups.map((g) => (
            <section key={g.kind}>
              <SectionTitle>
                {g.title} · {g.hits.length}
              </SectionTitle>
              <Card className="divide-y divide-line p-0">
                {g.hits.map((h) => {
                  const status = statusOf(h);
                  return (
                    <Link key={`${h.kind}-${h.id}`} href={g.href(h)} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {[h.subtitle, h.kind === 'content' && h.content_type ? `${lookup(CONTENT_TYPE, h.content_type, '')} #${h.number}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                    </Link>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
