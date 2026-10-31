'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CheckInCard } from '@/components/cabinet/CheckInCard';
import { Countdown } from '@/components/tasks/Countdown';
import { PRIORITY, TASK_TYPE } from '@/lib/labels';
import { listenTopic } from '@/lib/realtime/topic';
import { getBrowserClient } from '@/lib/supabase/client';
import { toPending, type Gate, type PendingAck } from '@/lib/tasks/ack';
import { formatShortDateTime } from '@/lib/time';
import { STAGE_LABEL, type Stage } from '@/lib/workflow-shared';

const SAVE_FAILED = 'Qabul qilinganini saqlab bo‘lmadi. Internetni tekshirib, qayta bosing.';

/**
 * The start of every visit, in order: today's KELDIM when it is due (attendance rules decide), then each newly
 * assigned task until the person has accepted it — one by one, with what they need to understand it. Until then the
 * rest of the app is behind a modal dialog (the page under it stays as it was, drafts included). Allowed meanwhile:
 * KELDIM, the details page of a task being accepted, signing out. New assignments arrive live; a task removed,
 * cancelled or finished drops out by itself. The server decides what is pending; this only shows it.
 */
export function TaskGate({ userId, gate, area, serverNow }: { userId: string; gate: Gate; area: 'staff' | 'panel'; serverNow: string }) {
  const router = useRouter();
  const path = usePathname() ?? '';
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<PendingAck[]>(gate.pending);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = area === 'staff';
  const laterKey = gate.day ? `sm:keldim-keyin:${gate.day.today}` : '';

  // Each server render (navigation, refresh) brings the server's list again.
  useEffect(() => setPending(gate.pending), [gate.pending]);
  useEffect(() => {
    try {
      setLater(!!laterKey && sessionStorage.getItem(laterKey) === '1');
    } catch {
      setLater(false);
    }
  }, [laterKey]);

  const reload = useCallback(async () => {
    const { data, error: readError } = await getBrowserClient().rpc('get_my_pending_acks');
    if (!readError) setPending(toPending(data));
  }, []);

  // A new (or removed) assignment of this person, live.
  useEffect(() => listenTopic(`user:${userId}`, 'change', (p) => p.table === 'task_assignments' && void reload()), [userId, reload]);
  // While something is pending: a cancelled / deleted / finished task clears, also after the tab sleeps.
  const ids = pending.map((p) => p.task_id).join(',');
  useEffect(() => {
    if (!ids) return;
    const watched = new Set(ids.split(','));
    const off = listenTopic('staff', 'change', (p) => p.table === 'tasks' && typeof p.id === 'string' && watched.has(p.id) && void reload());
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => void reload(), 60_000);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [ids, reload]);

  const detailsOf = (id: string) => (area === 'staff' ? `/xodim/vazifa/${id}` : `/work/tasks/${id}`);
  const viewing = pending.find((p) => path === detailsOf(p.task_id)) ?? null;
  const day = gate.day && !later ? gate.day : null;
  const modal = !viewing && (!!day || pending.length > 0);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (modal && !d.open) d.showModal();
    if (!modal && d.open) d.close();
  }, [modal]);

  // The acceptance bar sits at the bottom of the details page: Sunny steps aside meanwhile.
  useEffect(() => {
    if (!viewing) return;
    document.documentElement.dataset.smGate = '1';
    return () => {
      delete document.documentElement.dataset.smGate;
    };
  }, [viewing]);

  const accept = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    const { error: saveError } = await getBrowserClient().rpc('acknowledge_task', { p_task_id: id });
    setBusy(null);
    // P0002: the task is gone (removed / unassigned) — nothing left to accept.
    if (saveError && saveError.code !== 'P0002') return setError(SAVE_FAILED);
    setPending((list) => list.filter((p) => p.task_id !== id));
    router.refresh();
  };

  const keepLater = () => {
    try {
      if (laterKey) sessionStorage.setItem(laterKey, '1');
    } catch {
      // Private mode: it asks again on the next visit, nothing else changes.
    }
    setLater(true);
  };

  const ink = dark ? 'text-white' : 'text-ink';
  const muted = dark ? 'text-[#a8a8ac]' : 'text-muted';
  const primary = dark
    ? 's-btn s-btn-lime relative h-14 w-full text-[16px] font-bold tracking-[0.08em] disabled:opacity-50'
    : 'h-14 w-full rounded-2xl bg-brand text-[16px] font-bold tracking-[0.08em] text-on-brand disabled:opacity-50';
  const current = pending[0] ?? null;

  return (
    <>
      <dialog
        ref={dialog}
        aria-labelledby="gate-title"
        onCancel={(e) => e.preventDefault()}
        // Some browsers close a dialog on a second Escape anyway: it opens again while something is pending.
        onClose={() => modal && requestAnimationFrame(() => dialog.current && !dialog.current.open && dialog.current.showModal())}
        className={`m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-[28px] ${dark ? 'cabinet-tokens' : ''}`}
      >
        {modal ? (
          <div
            className={`min-h-full px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:min-h-0 sm:p-6 ${dark ? 'bg-[#0b0b0c] text-white sm:border sm:border-white/10' : 'bg-bg text-ink sm:border sm:border-line'} sm:rounded-[28px]`}
          >
            {day ? (
              <section aria-label="Bugungi davomat" className="space-y-4">
                <p id="gate-title" className={`text-[12px] font-semibold tracking-[0.16em] uppercase ${dark ? 'text-[#d4fc18]' : 'text-subtle'}`}>
                  {pending.length ? '1-qadam · ' : ''}Bugungi davomat
                </p>
                <CheckInCard {...day} serverNow={day.serverNow} tone={dark ? 'dark' : 'panel'} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-[13px] ${muted}`}>
                    {pending.length ? `Keyin: ${pending.length} ta yangi vazifani ko‘rib chiqasiz.` : 'Bugun ishda bo‘lmasangiz — rahbaringizga xabar bering.'}
                  </p>
                  <button
                    type="button"
                    onClick={keepLater}
                    className={`h-10 rounded-full px-4 text-[13.5px] font-medium ${dark ? 'bg-white/[0.06] text-[#d9d9de] hover:bg-white/[0.1]' : 'border border-line text-muted hover:text-ink'}`}
                  >
                    Keyinroq
                  </button>
                </div>
              </section>
            ) : current ? (
              <section aria-label="Yangi vazifa" className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p id="gate-title" className={`text-[12px] font-semibold tracking-[0.16em] uppercase ${dark ? 'text-[#d4fc18]' : 'text-subtle'}`}>
                    {gate.day ? '2-qadam · ' : ''}Sizga yangi vazifa biriktirildi
                  </p>
                  {pending.length > 1 ? <span className={`shrink-0 text-[12.5px] tabular-nums ${muted}`}>1 / {pending.length}</span> : null}
                </div>
                <TaskBrief task={current} dark={dark} serverNow={serverNow} />
                {error ? (
                  <p role="alert" className={`text-[13.5px] ${dark ? 'text-[#ff8a8a]' : 'text-danger'}`}>
                    {error}
                  </p>
                ) : null}
                <button type="button" onClick={() => void accept(current.task_id)} disabled={!!busy} className={primary}>
                  {busy === current.task_id ? (
                    <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
                  ) : null}
                  {error ? 'QAYTA URINISH' : 'VAZIFANI QABUL QILDIM'}
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
                  <Link href={detailsOf(current.task_id)} className={`font-medium underline-offset-4 hover:underline ${dark ? 'text-[#d4fc18]' : 'text-ink'}`}>
                    Batafsil ko‘rish
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className={`${muted} hover:underline`}>
                      Chiqish
                    </button>
                  </form>
                </div>
                {pending.length > 1 ? (
                  <div className={`border-t pt-3 ${dark ? 'border-white/10' : 'border-line'}`}>
                    <p className={`mb-1.5 text-[12px] font-semibold tracking-wide uppercase ${muted}`}>Navbatda</p>
                    <ul className="space-y-1">
                      {pending.slice(1).map((p) => (
                        <li key={p.task_id} className={`truncate text-[13.5px] ${ink}`}>
                          • {p.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </dialog>

      {viewing ? (
        <>
          <div aria-hidden className="h-36" />
          <div
            role="region"
            aria-label="Vazifani qabul qilish"
            className={`fixed inset-x-0 bottom-0 z-[85] border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur ${dark ? 'border-white/10 bg-[#0b0b0c]/95' : 'border-line bg-surface/95'}`}
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <p className={`min-w-0 flex-1 text-[13.5px] ${muted}`}>
                <span className={`font-semibold ${ink}`}>Bu vazifa sizga yangi biriktirildi.</span> Tanishib chiqing va qabul qiling.
                {error ? <span className={`block ${dark ? 'text-[#ff8a8a]' : 'text-danger'}`}>{error}</span> : null}
              </p>
              <button type="button" onClick={() => void accept(viewing.task_id)} disabled={!!busy} className={`${primary} sm:w-auto sm:px-8`}>
                {busy ? (
                  <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
                ) : null}
                VAZIFANI QABUL QILDIM
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/** What the person needs to understand the task before accepting it. */
function TaskBrief({ task: t, dark, serverNow }: { task: PendingAck; dark: boolean; serverNow: string }) {
  const muted = dark ? 'text-[#8e8e96]' : 'text-muted';
  const box = dark ? 'rounded-2xl bg-white/[0.04] p-4' : 'rounded-2xl border border-line bg-surface p-4';
  const urgent = t.priority === 'high' || t.priority === 'urgent';
  const rows: [string, React.ReactNode][] = [
    ['Mijoz', t.client_name ?? 'Ichki vazifa'],
    ['Turi', t.stage ? STAGE_LABEL[t.stage as Stage] : TASK_TYPE[t.task_type]],
    [
      'Muhimlik',
      <span key="p" className={urgent ? (dark ? 'font-semibold text-[#ff9c9c]' : 'font-semibold text-danger') : ''}>
        {PRIORITY[t.priority].label}
      </span>,
    ],
    ...(t.starts_at ? ([['Boshlanish', formatShortDateTime(t.starts_at)]] as [string, React.ReactNode][]) : []),
    [
      'Muddat',
      t.due_at ? (
        <span key="d" className="flex flex-wrap items-baseline gap-x-2">
          {formatShortDateTime(t.due_at)} <Countdown due={t.due_at} serverNow={serverNow} tone={dark ? 'dark' : 'panel'} />
        </span>
      ) : (
        'Belgilanmagan'
      ),
    ],
    ['Biriktirdi', t.assigned_by_name ?? '—'],
    ...(t.assignees.length > 1
      ? ([['Ijrochilar', t.assignees.map((a) => `${a.name}${a.accepted ? ' ✓' : ''}`).join(', ')]] as [string, React.ReactNode][])
      : []),
  ];
  return (
    <div className="space-y-3">
      <h2 className={`text-[22px] leading-snug font-semibold break-words sm:text-[24px] ${dark ? 'font-display text-white' : ''}`}>{t.title}</h2>
      <dl className={`${box} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]`}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className={muted}>{label}</dt>
            <dd className="min-w-0 font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {t.description ? <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap">{t.description}</p> : null}
      {t.instructions ? (
        <div className={box}>
          <p className={`mb-1 text-[12px] font-semibold tracking-wide uppercase ${muted}`}>Rahbar izohi</p>
          <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">{t.instructions}</p>
        </div>
      ) : null}
      {t.checklist.length ? (
        <ul className="space-y-1 text-[14px]">
          {t.checklist.map((c, i) => (
            <li key={i}>○ {c}</li>
          ))}
        </ul>
      ) : null}
      {t.files_count ? <p className={`text-[13.5px] ${muted}`}>📎 {t.files_count} ta fayl biriktirilgan — “Batafsil ko‘rish”da.</p> : null}
    </div>
  );
}
