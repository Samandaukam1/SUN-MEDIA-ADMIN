import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Tabs } from '@/components/ui/Tabs';
import { StatusChanger } from '@/components/work/StatusChanger';
import { setContentStatusAction } from '@/lib/actions/work';
import { can, requireStaff } from '@/lib/auth';
import { CONTENT_STAGES, isOverdue } from '@/lib/content';
import { CONTENT_STATUS, CONTENT_TYPE, lookup, PLATFORM_LABEL, PRIORITY, PUBLICATION_STATUS, TEAM_ROLE_LABEL, VERSION_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Kontent' };

const TABS = [
  { key: 'main', label: 'Asosiy' },
  { key: 'script', label: 'Ssenariy' },
  { key: 'team', label: 'Jamoa' },
  { key: 'approval', label: 'Tasdiqlash' },
  { key: 'history', label: 'Tarix' },
] as const;

const REVISION_STATUS: Record<string, { label: string; tone: 'danger' | 'accent' | 'success' | 'neutral' }> = {
  open: { label: 'Ochiq', tone: 'danger' },
  in_progress: { label: 'Bajarilmoqda', tone: 'accent' },
  resolved: { label: 'Hal qilindi', tone: 'success' },
  cancelled: { label: 'Bekor', tone: 'neutral' },
};

export default async function ContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const context = await requireStaff();
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'main';
  const supabase = await createClient();
  const [{ data: c, error }, transitions] = await Promise.all([
    supabase
      .from('content_items')
      .select(
        `id, number, title, content_type, status, priority, description, script, caption, hashtags, due_at, client_approval_due_at, plan_month, is_client_visible, created_at,
         client:clients(id, name), project:projects!content_items_project_id_client_id_fkey(name),
         shooting:shootings!content_items_shooting_id_client_id_fkey(title, starts_at, location_name),
         team:content_assignments(role, person:profiles!content_assignments_user_id_fkey(id, full_name)),
         publications:content_publications(id, platform, scheduled_at, published_at, status, post_url),
         versions:content_versions(id, version_number, status, submitted_at, notes, submitter:profiles!content_versions_submitted_by_fkey(full_name)),
         revisions(id, revision_number, status, stage, summary, requested_at),
         history:content_status_history(id, from_status, to_status, changed_at, note, actor:profiles!content_status_history_changed_by_fkey(full_name))`,
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.rpc('get_content_transitions', { p_content_id: id }),
  ]);
  if (error) throw error;
  if (!c) notFound();

  const status = lookup(CONTENT_STATUS, c.status, CONTENT_STATUS.idea);
  const current = CONTENT_STAGES.findIndex((s) => s.statuses.includes(c.status));
  const overdue = isOverdue(c);
  const next = (transitions.data ?? []).map((s) => ({ value: s, label: lookup(CONTENT_STATUS, s, { label: s, tone: 'neutral' as const }).label }));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Kontent', href: '/work/content' }, { label: c.title }]}
        title={c.title}
        description={[c.client?.name, lookup(CONTENT_TYPE, c.content_type, 'Kontent'), `#${c.number}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {overdue ? <Badge tone="danger">Muddati o‘tgan</Badge> : null}
            {can(context, 'content.manage') ? <ButtonLink href={`/work/content/${c.id}/edit`}>Tahrirlash</ButtonLink> : null}
          </>
        }
      />

      <ol className="mb-8 flex flex-wrap gap-1.5" aria-label="Bosqichlar">
        {CONTENT_STAGES.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              i === current ? 'bg-brand text-on-brand' : i < current ? 'bg-accent-soft text-accent-on-soft' : 'bg-surface-2 text-subtle',
            )}
          >
            {s.label}
          </li>
        ))}
      </ol>

      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <div>
          <Tabs items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/work/content/${c.id}?tab=${t.key}` }))} active={tab} />

          {tab === 'main' ? (
            <div className="space-y-6">
              <Card>
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <Info label="Mijoz" value={c.client?.name} />
                  <Info label="Loyiha" value={c.project?.name} />
                  <Info label="Muhimlik" value={lookup(PRIORITY, c.priority, PRIORITY.normal).label} />
                  <Info label="Mijoz ko‘radimi" value={c.is_client_visible ? 'Ha' : 'Yo‘q, faqat jamoa'} />
                  <Info label="Syomka" value={c.shooting ? `${formatShortDateTime(c.shooting.starts_at)} · ${c.shooting.location_name ?? c.shooting.title}` : null} />
                  <Info label="Montaj muddati" value={c.due_at ? formatShortDateTime(c.due_at) : null} danger={overdue} />
                  <Info label="Mijoz javobi" value={c.client_approval_due_at ? formatShortDateTime(c.client_approval_due_at) : null} />
                </dl>
              </Card>
              <section>
                <SectionTitle>Post</SectionTitle>
                {c.publications.filter((p) => p.status !== 'cancelled').length === 0 ? (
                  <EmptyRow>Post vaqti belgilanmagan</EmptyRow>
                ) : (
                  <Card className="divide-y divide-line p-0">
                    {c.publications
                      .filter((p) => p.status !== 'cancelled')
                      .map((p) => {
                        const ps = lookup(PUBLICATION_STATUS, p.status, PUBLICATION_STATUS.planned);
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                            <span className="flex-1 font-medium">{lookup(PLATFORM_LABEL, p.platform, p.platform)}</span>
                            <span className="tabular text-muted">{p.published_at ? formatShortDateTime(p.published_at) : p.scheduled_at ? formatShortDateTime(p.scheduled_at) : 'Vaqt yo‘q'}</span>
                            <Badge tone={ps.tone}>{ps.label}</Badge>
                            {p.post_url ? (
                              <a href={p.post_url} target="_blank" rel="noreferrer" className="text-muted underline hover:text-ink">
                                Ochish
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                  </Card>
                )}
              </section>
            </div>
          ) : null}

          {tab === 'script' ? (
            c.script || c.caption || c.description || c.hashtags?.length ? (
              <div className="space-y-4">
                {c.description ? <TextBlock title="Tavsif" body={c.description} /> : null}
                {c.script ? <TextBlock title="Ssenariy" body={c.script} /> : null}
                {c.caption ? <TextBlock title="Post matni" body={c.caption} /> : null}
                {c.hashtags?.length ? <TextBlock title="Heshteglar" body={c.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')} /> : null}
              </div>
            ) : (
              <EmptyRow>Ssenariy hali yozilmagan</EmptyRow>
            )
          ) : null}

          {tab === 'team' ? (
            c.team.length === 0 ? (
              <EmptyRow>Jamoa biriktirilmagan</EmptyRow>
            ) : (
              <Card className="divide-y divide-line p-0">
                {c.team.map((t) => (
                  <div key={`${t.role}-${t.person?.id}`} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium">{t.person?.full_name ?? '—'}</span>
                    <span className="text-muted">{lookup(TEAM_ROLE_LABEL, t.role, t.role)}</span>
                  </div>
                ))}
              </Card>
            )
          ) : null}

          {tab === 'approval' ? (
            <div className="space-y-6">
              <section>
                <SectionTitle>Versiyalar</SectionTitle>
                {c.versions.length === 0 ? (
                  <EmptyRow>Montajyor hali versiya yuklamagan</EmptyRow>
                ) : (
                  <Card className="divide-y divide-line p-0">
                    {[...c.versions]
                      .sort((a, b) => b.version_number - a.version_number)
                      .map((v) => {
                        const vs = lookup(VERSION_STATUS, v.status, VERSION_STATUS.internal_review);
                        return (
                          <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                            <span className="font-semibold">v{v.version_number}</span>
                            <span className="flex-1 text-muted">{[v.submitter?.full_name, formatShortDateTime(v.submitted_at), v.notes].filter(Boolean).join(' · ')}</span>
                            <Badge tone={vs.tone}>{vs.label}</Badge>
                          </div>
                        );
                      })}
                  </Card>
                )}
              </section>
              {c.revisions.length ? (
                <section>
                  <SectionTitle>O‘zgartirishlar</SectionTitle>
                  <Card className="divide-y divide-line p-0">
                    {c.revisions.map((r) => {
                      const rs = REVISION_STATUS[r.status] ?? REVISION_STATUS.open;
                      return (
                        <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                          <span className="font-semibold">#{r.revision_number}</span>
                          <span className="flex-1 text-muted">{[r.stage === 'client' ? 'Mijozdan' : 'Tekshiruvdan', r.summary, formatShortDateTime(r.requested_at)].filter(Boolean).join(' · ')}</span>
                          <Badge tone={rs.tone}>{rs.label}</Badge>
                        </div>
                      );
                    })}
                  </Card>
                </section>
              ) : null}
              <p className="text-sm text-muted">Videoni ko‘rib, vaqtli izoh qoldirish va tasdiqlash SUN MEDIA mobil ilovasidagi “Tasdiqlash” bo‘limida.</p>
            </div>
          ) : null}

          {tab === 'history' ? (
            c.history.length === 0 ? (
              <EmptyRow>Tarix bo‘sh</EmptyRow>
            ) : (
              <Card className="divide-y divide-line p-0">
                {[...c.history]
                  .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
                  .map((h) => (
                    <div key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="flex-1">
                        {h.from_status ? `${lookup(CONTENT_STATUS, h.from_status, CONTENT_STATUS.idea).label} → ` : 'Yaratildi: '}
                        {lookup(CONTENT_STATUS, h.to_status, CONTENT_STATUS.idea).label}
                        {h.note ? <span className="text-muted"> · {h.note}</span> : null}
                      </span>
                      <span className="text-muted">{h.actor?.full_name ?? 'Tizim'}</span>
                      <span className="tabular text-xs text-subtle">{formatShortDateTime(h.changed_at)}</span>
                    </div>
                  ))}
              </Card>
            )
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionTitle>Holat</SectionTitle>
            <StatusChanger action={setContentStatusAction.bind(null, c.id)} options={next} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value, danger }: { label: string; value: string | null | undefined; danger?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className={cn('font-medium', danger && 'text-danger')}>{value || '—'}</dd>
    </div>
  );
}

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{body}</p>
    </Card>
  );
}
