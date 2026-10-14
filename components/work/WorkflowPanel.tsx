'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { assignEditing, reviewEditing, reviewScript, type WorkflowResult } from '@/lib/actions/workflow';
import { formatShortDateTime } from '@/lib/time';
import { STAGES, stageStatusLabel, type Stage } from '@/lib/workflow-shared';
import { PublicationControls, type Publication } from './PublicationControls';

type StageTask = { id: string; stage: Stage; status: string; dueAt: string | null; updatedAt: string; assignees: { id: string; name: string }[] };
type Equipment = { id: string; name: string; preparedAt: string | null };

const TONE: Record<string, BadgeTone> = { todo: 'neutral', in_progress: 'accent', in_review: 'info', revision: 'danger', done: 'success', cancelled: 'neutral' };
const field = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent';

/** Approve / return with a note (script or montaj). */
function Review({ label, onDecide }: { label: string; onDecide: (approve: boolean, note: string) => Promise<WorkflowResult> }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      setError(null);
      const res = await onDecide(approve, note);
      if (!res.ok) return setError(res.message);
      setNote('');
      setReturning(false);
      router.refresh();
    });
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="text-[13px] font-medium">{label}</p>
      {returning ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Nimani tuzatish kerak?"
          aria-label="Tuzatish izohi"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      ) : null}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {returning ? (
          <>
            <Button variant="danger" loading={pending} onClick={() => decide(false)}>
              Tuzatishga qaytarish
            </Button>
            <Button variant="ghost" onClick={() => setReturning(false)}>
              Bekor
            </Button>
          </>
        ) : (
          <>
            <Button loading={pending} onClick={() => decide(true)} icon={<Icon name="check" size={16} />}>
              Tasdiqlash
            </Button>
            <Button variant="secondary" onClick={() => setReturning(true)}>
              Tuzatish kerak
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AssignEditor({ contentId, editors, current }: { contentId: string; editors: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const [editor, setEditor] = useState(current ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editors.length) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-[13px] text-muted">
        Ro‘yxat bo‘sh: hali hech bir xodimga montaj skilli biriktirilmagan.{' '}
        <Link href="/team/skills" className="font-medium text-ink underline underline-offset-2">
          Skilllarni biriktirish
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[1fr_150px_110px]">
      <select value={editor} onChange={(e) => setEditor(e.target.value)} aria-label="Montajyor" className={field}>
        <option value="">Montajyorni tanlang</option>
        {editors.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Topshirish sanasi" className={field} />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Topshirish vaqti" className={field} />
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="Izoh (ixtiyoriy)" aria-label="Montaj izohi" className={cn(field, 'sm:col-span-2')} />
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await assignEditing(contentId, editor, date, time, note);
            if (!res.ok) return setError(res.message);
            router.refresh();
          })
        }
      >
        Belgilash
      </Button>
      {error ? <p className="text-[12.5px] text-danger sm:col-span-3">{error}</p> : null}
    </div>
  );
}

/**
 * The content's stages, each a task with its own person, status, deadline and last update. Managers act here:
 * approve or return the script, see the equipment, pick the montajyor and accept the montaj.
 */
export function WorkflowPanel({
  contentId,
  stages,
  equipment,
  equipmentReady,
  editors,
  publications,
  postAt,
  can,
}: {
  contentId: string;
  stages: StageTask[];
  equipment: Equipment[];
  equipmentReady: { at: string; by: string | null } | null;
  editors: { id: string; name: string }[];
  publications: Publication[];
  postAt: string | null;
  can: { reviewScript: boolean; manageEditing: boolean; managePosts: boolean };
}) {
  if (!stages.length) return null;
  const byStage = new Map(stages.map((s) => [s.stage, s]));
  const now = Date.now();
  return (
    <Card className="mb-8 p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <p className="text-sm font-semibold">Ish jarayoni</p>
        <span className="text-[12.5px] text-muted">
          {stages.filter((s) => s.status === 'done').length} / {stages.length} bosqich tayyor
        </span>
      </div>
      <ol className="divide-y divide-line">
        {STAGES.filter((s) => byStage.has(s.key)).map((s, i) => {
          const t = byStage.get(s.key)!;
          const late = t.status !== 'done' && t.dueAt && new Date(t.dueAt).getTime() < now;
          const prepared = equipment.filter((e) => e.preparedAt).length;
          return (
            <li key={s.key} className="px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    t.status === 'done' ? 'bg-success-soft text-success' : t.status === 'todo' ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-on-soft',
                  )}
                >
                  {t.status === 'done' ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{s.label}</p>
                    <Badge tone={TONE[t.status] ?? 'neutral'}>{stageStatusLabel(s.key, t.status)}</Badge>
                    {late ? <Badge tone="danger">Muddati o‘tgan</Badge> : null}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {[
                      t.assignees.map((a) => a.name).join(', ') || (s.key === 'editing' ? 'Montajyor belgilanmagan' : 'Biriktirilmagan'),
                      t.dueAt ? `Muddat: ${formatShortDateTime(t.dueAt)}` : null,
                      `Yangilandi: ${formatShortDateTime(t.updatedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {s.key === 'equipment' ? (
                    <p className="mt-1 text-[13px] text-muted">
                      {equipmentReady
                        ? `Tayyor — tasdiqladi: ${equipmentReady.by ?? 'Admin'}, ${formatShortDateTime(equipmentReady.at)}`
                        : `${prepared} / ${equipment.length} jihoz tayyorlangan: ${equipment.map((e) => e.name).join(', ')}`}{' '}
                      <Link href="/work/jihozlar" className="font-medium text-ink underline underline-offset-2">
                        Syomka jihozlari
                      </Link>
                    </p>
                  ) : null}
                  {s.key === 'script' && t.status === 'in_review' && can.reviewScript ? (
                    <>
                      <Link href={`/work/content/${contentId}?tab=script`} className="mt-2 inline-block text-[13px] font-medium underline underline-offset-2">
                        Ssenariyni o‘qish
                      </Link>
                      <Review label="Ssenariy tekshiruvda" onDecide={(approve, note) => reviewScript(contentId, approve, note)} />
                    </>
                  ) : null}
                  {s.key === 'editing' && can.manageEditing && t.status !== 'done' && t.status !== 'in_review' ? (
                    <AssignEditor contentId={contentId} editors={editors} current={t.assignees[0]?.id ?? null} />
                  ) : null}
                  {s.key === 'publishing' ? (
                    <div className="mt-3">
                      <PublicationControls contentId={contentId} publications={publications} postAt={postAt} canSchedule={can.managePosts} canConfirm={can.managePosts && t.status !== 'done'} />
                    </div>
                  ) : null}
                  {s.key === 'editing' && can.manageEditing && t.status === 'in_review' ? (
                    <Review label="Montaj tekshiruvda" onDecide={(approve, note) => reviewEditing(contentId, approve, note)} />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
