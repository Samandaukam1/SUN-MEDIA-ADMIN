import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ChipLinks, withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { can, requireStaff } from '@/lib/auth';
import { EVENT_TYPE, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { addDaysToKey, addMonthsToKey, agencyDateKey, agencyDayRange, formatDateKey, formatMonthKey, formatTime, isDateKey, monthStartKey, weekStartKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Kalendar' };

const GROUPS: { key: string; label: string; types: string[] | null }[] = [
  { key: 'all', label: 'Barchasi', types: null },
  { key: 'shooting', label: 'Syomka', types: ['shooting'] },
  { key: 'edit', label: 'Montaj', types: ['content_due', 'editing_deadline', 'design_deadline'] },
  { key: 'post', label: 'Post', types: ['publication'] },
  { key: 'meeting', label: 'Uchrashuv', types: ['meeting', 'company_meeting'] },
  { key: 'deadline', label: 'Muddat', types: ['task_deadline'] },
];

const TASK_EVENTS = new Set(['editing_deadline', 'design_deadline', 'task_deadline', 'meeting']);
type Row = { event_type: string; entity_id: string; content_id: string | null; starts_at: string; title: string; client_name: string | null };

function linkFor(e: Row): string | null {
  if (e.event_type === 'shooting') return `/work/shootings/${e.entity_id}`;
  if (TASK_EVENTS.has(e.event_type)) return `/work/tasks/${e.entity_id}`;
  if (e.content_id) return `/work/content/${e.content_id}`;
  return null;
}

/** Ish jarayoni → Kalendar: when what happens, a week or a month at a time. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; type?: string }> }) {
  const context = await requireStaff();
  if (!['content.manage', 'shootings.manage', 'clients.read_all'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const today = agencyDateKey();
  const date = isDateKey(params.date) ? params.date : today;
  const view = params.view === 'month' ? 'month' : 'week';
  const group = GROUPS.find((g) => g.key === params.type) ?? GROUPS[0];

  const start = view === 'month' ? weekStartKey(monthStartKey(date)) : weekStartKey(date);
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => addDaysToKey(start, i));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_calendar_events', { p_from: agencyDayRange(days[0]).from, p_to: agencyDayRange(days[days.length - 1]).to });
  if (error) throw error;
  const events = (data as Row[]).filter((e) => !group.types || group.types.includes(e.event_type));
  const byDay = new Map<string, Row[]>();
  for (const e of events) {
    const key = agencyDateKey(new Date(e.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const month = monthStartKey(date);
  const title = view === 'month' ? formatMonthKey(date) : `${formatDateKey(days[0])} — ${formatDateKey(days[6])}`;
  const shift = (dir: number) => (view === 'month' ? addMonthsToKey(date, dir) : addDaysToKey(date, 7 * dir));
  const keep = { view: view === 'month' ? 'month' : undefined, type: group.key === 'all' ? undefined : group.key };

  return (
    <div>
      <PageHeader title="Kalendar" description="Syomka, montaj, tasdiqlash, post va uchrashuvlar — qachon nima bo‘lishi." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link href={withParams('/work/calendar', { ...keep, date: shift(-1) })} className={buttonClass('secondary')} aria-label="Oldingi">
            ←
          </Link>
          <Link href={withParams('/work/calendar', keep)} className={buttonClass('secondary')}>
            Bugun
          </Link>
          <Link href={withParams('/work/calendar', { ...keep, date: shift(1) })} className={buttonClass('secondary')} aria-label="Keyingi">
            →
          </Link>
        </div>
        <p className="flex-1 text-lg font-semibold">{title}</p>
        <div className="flex rounded-xl border border-line bg-surface-2 p-0.5 text-sm">
          {(['week', 'month'] as const).map((v) => (
            <Link
              key={v}
              href={withParams('/work/calendar', { date, type: keep.type, view: v === 'month' ? 'month' : undefined })}
              aria-current={view === v ? 'page' : undefined}
              className={cn('rounded-[10px] px-4 py-1.5 font-medium', view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
            >
              {v === 'week' ? 'Hafta' : 'Oy'}
            </Link>
          ))}
        </div>
      </div>
      <div className="mb-5">
        <ChipLinks items={GROUPS.map((g) => ({ label: g.label, href: withParams('/work/calendar', { date, view: keep.view, type: g.key === 'all' ? undefined : g.key }), active: g.key === group.key }))} />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="grid min-w-[900px] grid-cols-7">
          {['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'].map((d) => (
            <div key={d} className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            const list = (byDay.get(day) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const shown = view === 'month' ? list.slice(0, 3) : list;
            const outside = view === 'month' && day.slice(0, 7) !== month.slice(0, 7);
            return (
              <div key={day} className={cn('min-h-32 space-y-1.5 border-line p-2', i % 7 !== 6 && 'border-r', i < days.length - 7 && 'border-b', outside && 'bg-surface-2/50', view === 'week' && 'min-h-96')}>
                <p className={cn('tabular text-sm font-semibold', day === today ? 'inline-grid size-7 place-items-center rounded-full bg-brand text-on-brand' : outside ? 'text-subtle' : '')}>{Number(day.slice(8))}</p>
                {shown.map((e) => {
                  const meta = lookup(EVENT_TYPE, e.event_type, { label: 'Hodisa', tone: 'neutral' as const });
                  const href = linkFor(e);
                  const body = (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="tabular text-[11px] text-muted">{formatTime(e.starts_at)}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug font-medium">{e.title}</span>
                      {e.client_name ? <span className="block truncate text-[11px] text-muted">{e.client_name}</span> : null}
                    </>
                  );
                  return href ? (
                    <Link key={`${e.event_type}-${e.entity_id}`} href={href} className="block rounded-lg border border-line bg-surface p-1.5 hover:border-line-strong">
                      {body}
                    </Link>
                  ) : (
                    <div key={`${e.event_type}-${e.entity_id}`} className="rounded-lg border border-line bg-surface p-1.5">
                      {body}
                    </div>
                  );
                })}
                {list.length > shown.length ? (
                  <Link href={withParams('/work/calendar', { date: day, type: keep.type })} className="block text-xs font-medium text-muted hover:text-ink">
                    yana {list.length - shown.length} ta →
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      {events.length === 0 ? <p className="mt-4 text-center text-sm text-subtle">Bu davrda hech narsa rejalashtirilmagan.</p> : null}
    </div>
  );
}
