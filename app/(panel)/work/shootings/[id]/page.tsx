import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireStaff } from '@/lib/auth';
import { CONTENT_STATUS, CONTENT_TYPE, lookup, SHOOTING_ATTENDANCE_STATUS, SHOOTING_STATUS, TEAM_ROLE_LABEL } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, formatDateKey, formatTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Syomka' };

/** One shooting: when, where (with the map link), who goes and which videos are shot. */
export default async function ShootingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: s, error }, contentRes, attendanceRes] = await Promise.all([
    supabase
      .from('shootings')
      .select(
        'id, title, description, starts_at, ends_at, status, location_name, location_address, location_url, shot_list, client:clients(id, name), crew:shooting_members(role, user_id, person:profiles!shooting_members_user_id_fkey(full_name))',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('content_items').select('id, title, content_type, status').eq('shooting_id', id).is('deleted_at', null),
    supabase.from('shooting_attendance').select('user_id, status, late_minutes').eq('shooting_id', id),
  ]);
  if (error) throw error;
  if (!s) notFound();
  const status = lookup(SHOOTING_STATUS, s.status, SHOOTING_STATUS.planned);
  const shots = Array.isArray(s.shot_list) ? (s.shot_list as { title?: string; done?: boolean }[]) : [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Syomkalar', href: '/work/shootings' }, { label: s.title }]}
        title={s.title}
        description={[s.client?.name, `${formatDateKey(agencyDateKey(new Date(s.starts_at)), true)}, ${formatTime(s.starts_at)}–${formatTime(s.ends_at)}`].filter(Boolean).join(' · ')}
        actions={<Badge tone={status.tone} dot>{status.label}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-2">
          <SectionTitle>Qayerda</SectionTitle>
          <p className="font-medium">{s.location_name ?? 'Joy yozilmagan'}</p>
          {s.location_address ? <p className="text-sm text-muted">{s.location_address}</p> : null}
          {s.location_url ? (
            <a href={s.location_url} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium underline">
              Xaritada ochish
            </a>
          ) : null}
          {s.description ? <p className="pt-2 text-sm whitespace-pre-wrap">{s.description}</p> : null}
        </Card>
        <section>
          <SectionTitle>Kim boradi</SectionTitle>
          {s.crew.length === 0 ? (
            <EmptyRow>Jamoa biriktirilmagan</EmptyRow>
          ) : (
            <Card className="divide-y divide-line p-0">
              {s.crew.map((m) => {
                const a = (attendanceRes.data ?? []).find((x) => x.user_id === m.user_id);
                const as = lookup(SHOOTING_ATTENDANCE_STATUS, a?.status, SHOOTING_ATTENDANCE_STATUS.pending);
                return (
                  <div key={`${m.user_id}-${m.role}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="flex-1 font-medium">{m.person?.full_name ?? '—'}</span>
                    <span className="text-muted">{lookup(TEAM_ROLE_LABEL, m.role, m.role)}</span>
                    <Badge tone={as.tone}>{`${as.label}${a?.late_minutes ? ` · ${a.late_minutes} daq` : ''}`}</Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
        <section>
          <SectionTitle>Nima suratga olinadi</SectionTitle>
          {(contentRes.data ?? []).length === 0 ? (
            <EmptyRow>Kontent bog‘lanmagan</EmptyRow>
          ) : (
            <Card className="divide-y divide-line p-0">
              {(contentRes.data ?? []).map((c) => {
                const cs = lookup(CONTENT_STATUS, c.status, CONTENT_STATUS.idea);
                return (
                  <Link key={c.id} href={`/work/content/${c.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <span className="flex-1 font-medium">{c.title}</span>
                    <span className="text-muted">{lookup(CONTENT_TYPE, c.content_type, 'Kontent')}</span>
                    <Badge tone={cs.tone}>{cs.label}</Badge>
                  </Link>
                );
              })}
            </Card>
          )}
        </section>
        {shots.length ? (
          <section>
            <SectionTitle>Kadrlar ro‘yxati</SectionTitle>
            <Card className="space-y-2 text-sm">
              {shots.map((shot, i) => (
                <p key={i} className={shot.done ? 'text-muted line-through' : ''}>
                  {i + 1}. {shot.title}
                </p>
              ))}
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}
