import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { AutoRefresh } from '@/components/agents/AutoRefresh';
import { ApproveButton, CommentForm, EditPanel, ManualTextForm, PublishedForm, RegenerateForm, RejectButton, ReorderSlides, RescheduleForm, SlideViewer, VersionCompare, ActionButton } from '@/components/agents/controls';
import { MetricsForm } from '@/components/agents/forms';
import { StatusBadge } from '@/components/agents/ItemCards';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { exportName, isDownloadable, isEditable, KIND_LABEL, type AgentKind, type Frame } from '@/lib/agents/core';
import { FORMATS } from '@/lib/agents/creative';
import type { QaReport } from '@/lib/agents/qa';
import { db, signed } from '@/lib/agents/server';
import { FAMILIES, OBJECTIVES } from '@/lib/agents/strategy';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Kontent — AI agent' };

const CHANGE: Record<string, string> = {
  generate: 'Yaratildi',
  regenerate: 'Qayta yaratildi',
  text_edit: 'Matn tahriri',
  layout_edit: 'Joylashuv tahriri',
  image_edit: 'Rasm tahriri (AI)',
  slide_regen: 'Slayd qayta yaratildi',
  restore: 'Qaytarildi',
  reorder: 'Tartib o‘zgardi',
  manual: 'Qo‘lda tahrir',
};

export default async function ContentReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: item } = await db().from('agent_items').select('*').eq('id', id).maybeSingle();
  if (!item) notFound();
  const [{ data: profile }, { data: versions }, { data: jobs }, { data: comments }, { data: metrics }, { data: approvals }] = await Promise.all([
    db().from('agent_profiles').select('id, name, instagram_username').eq('id', item.profile_id).maybeSingle(),
    db().from('agent_versions').select('*').eq('item_id', id).order('version_no', { ascending: false }).limit(30),
    db().from('agent_jobs').select('id, kind, status, progress, error, attempts, created_at, updated_at').eq('item_id', id).order('created_at', { ascending: false }).limit(10),
    db().from('agent_review_comments').select('id, body, created_at, author:profiles(full_name)').eq('item_id', id).order('created_at', { ascending: false }).limit(30),
    db().from('agent_metrics').select('*').eq('item_id', id).order('created_at', { ascending: false }),
    db().from('agent_approvals').select('version_id, decision, created_at, by:profiles(full_name)').eq('item_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!profile) notFound();
  const current = (versions ?? []).find((v) => v.id === item.current_version_id) ?? null;
  const frames = (current?.frames ?? []) as unknown as Frame[];
  const allPaths = [...frames.map((f) => f.path), ...(versions ?? []).flatMap((v) => ((v.frames ?? []) as unknown as Frame[]).map((f) => f.thumb ?? f.path))];
  const urls = await signed(allPaths, 3600);
  const active = (jobs ?? []).some((j) => j.status === 'queued' || j.status === 'running');
  const runningJob = (jobs ?? []).find((j) => j.status === 'queued' || j.status === 'running');
  const qa = (current?.qa ?? null) as unknown as (QaReport & { ai?: { summary?: string; model?: string; error?: string } }) | null;
  const plan = (item.plan ?? {}) as Record<string, string | string[] | null>;
  const kind = item.kind as AgentKind;
  const downloadable = isDownloadable(item.status) && item.approved_version_id === item.current_version_id;
  const editable = isEditable(item.status) && !active && !!current;
  const approveBlock = !current ? 'Hali versiya yo‘q' : active ? 'Ish navbatda' : qa?.passed === false ? 'Sifat tekshiruvidan o‘tmagan' : !['pending_approval', 'needs_fix'].includes(item.status) ? undefined : undefined;
  const approved = ['export_ready', 'exported', 'published_manual', 'approved'].includes(item.status) && item.approved_version_id === item.current_version_id;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={active} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/agents/tasdiqlash" className="text-[13px] text-muted hover:text-ink">
            ← Tasdiqlash navbati
          </Link>
          <h2 className="mt-1 text-[20px] font-semibold">
            <Link href={`/agents/profillar/${profile.id}`} className="hover:underline">
              {profile.name}
            </Link>{' '}
            · {KIND_LABEL[kind]}
            {kind === 'story' && item.slot > 1 ? ` #${item.slot}` : ''}
          </h2>
          <p className="text-[13px] text-muted">
            {item.target_date} · joylash vaqti {formatShortDateTime(item.scheduled_at)}
            {current ? ` · ${current.version_no}-versiya` : ''}
            {profile.instagram_username ? ` · @${profile.instagram_username}` : ''}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {runningJob ? (
        <Notice tone="info" title={runningJob.status === 'running' ? 'Ishlanmoqda' : 'Navbatda'}>
          {runningJob.progress ?? 'Server ishni bajaradi — sahifani yopsangiz ham davom etadi.'}
        </Notice>
      ) : null}
      {item.last_error ? <Notice tone="danger" title="Oxirgi xato">{item.last_error}</Notice> : null}
      {item.status === 'limit_reached' && /admin ruxsat berishi kerak/.test(item.last_error ?? '') ? (
        <div>
          <ActionButton act={{ kind: 'allowOver', itemId: item.id }} variant="primary" confirm="Bu material uchun limitdan oshib, bitta ishni bajarishga ruxsat berasizmi? Oylik va kunlik budjetlar baribir amal qiladi.">
            Limitdan oshirib yaratishga ruxsat
          </ActionButton>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <SlideViewer kind={kind} slides={frames.map((f, i) => ({ src: urls[f.path] ?? '', alt: `${i + 1}: ${f.headline}` })).filter((s) => s.src)} />
          </Card>

          {qa ? (
            <Card className="flex flex-col gap-3">
              <SectionTitle>Sifat tekshiruvi {qa.passed ? '— o‘tdi' : '— o‘tmadi'}</SectionTitle>
              {qa.issues?.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {qa.issues.map((x, i) => (
                    <li key={i} className={x.level === 'fail' ? 'text-danger' : 'text-warning'}>
                      {x.level === 'fail' ? '✗' : '!'} {x.msg}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-success">Muammo topilmadi.</p>
              )}
              {qa.ai ? <p className="text-[13px] text-muted">AI ko‘rigi{qa.ai.model ? ` (${qa.ai.model})` : ''}: {qa.ai.summary ?? qa.ai.error}</p> : null}
              <p className="text-[12px] text-subtle">Tekshirildi: {qa.checked?.join(', ')}. AI ko‘rigi va mashina tekshiruvi tasdiq o‘rnini bosmaydi.</p>
            </Card>
          ) : null}

          {Object.keys(plan).length ? (
            <Card className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <SectionTitle>Kontent rejasi</SectionTitle>
              </div>
              <p>
                <span className="text-muted">Maqsad: </span>
                {OBJECTIVES[plan.objective as keyof typeof OBJECTIVES] ?? plan.objective ?? '—'}
              </p>
              <p>
                <span className="text-muted">Format: </span>
                {FORMATS.find((f) => f.key === plan.format)?.name ?? plan.format ?? '—'} · {FAMILIES[plan.family as keyof typeof FAMILIES]?.name ?? ''}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted">G‘oya: </span>
                {plan.concept}
              </p>
              <p>
                <span className="text-muted">Auditoriya: </span>
                {plan.audience}
              </p>
              <p>
                <span className="text-muted">Hook: </span>
                {plan.hook}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted">Nega hozir: </span>
                {plan.why}
              </p>
            </Card>
          ) : null}

          {current ? (
            <Card className="flex flex-col gap-2 text-sm">
              <SectionTitle>Caption</SectionTitle>
              <p className="whitespace-pre-wrap">{current.caption || '—'}</p>
              <p className="text-accent-on-soft">{current.hashtags}</p>
              {current.caption_alt ? (
                <details>
                  <summary className="cursor-pointer text-muted">Muqobil caption</summary>
                  <p className="mt-2 whitespace-pre-wrap">{current.caption_alt}</p>
                </details>
              ) : null}
            </Card>
          ) : null}

          {current && editable ? (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Matnni qo‘lda tahrirlash (rasm qayta chizilmaydi)</summary>
                <div className="mt-4">
                  <ManualTextForm itemId={id} frames={frames.map((f) => ({ headline: f.headline, body: f.body, cta: f.cta }))} caption={current.caption} hashtags={current.hashtags} />
                </div>
              </details>
            </Card>
          ) : null}

          {current && kind !== 'story' && editable && frames.length > 1 ? (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Slaydlar tartibi</summary>
                <div className="mt-4">
                  <ReorderSlides itemId={id} thumbs={frames.map((f) => urls[f.thumb ?? f.path] ?? '')} />
                </div>
              </details>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3">
            <SectionTitle>Versiyalar</SectionTitle>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {(versions ?? []).map((v) => {
                const wasApproved = (approvals ?? []).some((a) => a.version_id === v.id && a.decision === 'approved');
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p>
                        <b>v{v.version_no}</b> · {CHANGE[v.change_kind] ?? v.change_kind} · {formatShortDateTime(v.created_at)}
                        {v.id === item.current_version_id ? <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px]">joriy</span> : null}
                        {wasApproved ? <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] text-success">tasdiqlangan</span> : null}
                      </p>
                      <p className="text-[12px] text-subtle">
                        {[v.instruction, v.text_model, v.image_model, v.images ? `${v.images} rasm` : null, v.cost_usd !== null ? `$${Number(v.cost_usd).toFixed(3)}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {v.id !== item.current_version_id && editable ? (
                      <ActionButton act={{ kind: 'restore', itemId: id, versionId: v.id }} variant="ghost" confirm={`v${v.version_no} qaytarilsinmi? Yangi versiya bo‘lib, qayta tasdiqlanadi.`}>
                        Qaytarish
                      </ActionButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <VersionCompare kind={kind} versions={(versions ?? []).map((v) => ({ id: v.id, label: `v${v.version_no} · ${CHANGE[v.change_kind] ?? v.change_kind}`, thumbs: ((v.frames ?? []) as unknown as Frame[]).map((f) => urls[f.thumb ?? f.path]).filter(Boolean) }))} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <SectionTitle>Qaror</SectionTitle>
            {approved ? (
              <Notice tone="success">Tasdiqlangan versiya: v{(versions ?? []).find((v) => v.id === item.approved_version_id)?.version_no}. Endi yuklab olib, Instagram’ga qo‘lda joylang.</Notice>
            ) : (
              <ApproveButton itemId={id} disabled={!!approveBlock || !['pending_approval', 'needs_fix'].includes(item.status)} reason={approveBlock ?? (['pending_approval', 'needs_fix'].includes(item.status) ? undefined : 'Bu holatda tasdiqlab bo‘lmaydi')} />
            )}
            {editable ? <RejectButton itemId={id} /> : null}
          </Card>

          {downloadable ? (
            <Card className="flex flex-col gap-2">
              <SectionTitle>Yuklab olish</SectionTitle>
              {frames.map((_, i) => (
                <a key={i} href={`/api/agents/files/${id}?f=${i}`} className="rounded-xl border border-line px-3 py-2 text-sm hover:border-accent" download>
                  {exportName({ client: profile.name, date: item.target_date, kind, index: i, slot: item.slot })}
                </a>
              ))}
              {kind !== 'story' ? (
                <a href={`/api/agents/files/${id}?zip=1`} className="rounded-xl bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-fg" download>
                  Hammasi ZIP (slaydlar + caption)
                </a>
              ) : null}
              <p className="text-[12px] text-subtle">Fayllar tasdiqlangan versiyaning o‘zi (PNG, {kind === 'story' ? '1080×1920' : '1080×1350'}).</p>
              {item.status !== 'published_manual' ? <PublishedForm itemId={id} /> : <Notice tone="success">Qo‘lda joylangan: {formatShortDateTime(item.published_manually_at)}</Notice>}
            </Card>
          ) : null}

          {editable ? (
            <Card className="flex flex-col gap-3">
              <SectionTitle>Tahrirlash</SectionTitle>
              <EditPanel itemId={id} slides={frames.length} />
            </Card>
          ) : null}
          {isEditable(item.status) && !active ? (
            <Card className="flex flex-col gap-3">
              <SectionTitle>Yangi variant</SectionTitle>
              <RegenerateForm itemId={id} />
            </Card>
          ) : null}
          {isEditable(item.status) ? (
            <Card>
              <RescheduleForm itemId={id} date={item.target_date} time={new Date(Date.parse(item.scheduled_at) + 5 * 3600_000).toISOString().slice(11, 16)} />
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3">
            <SectionTitle>Izohlar</SectionTitle>
            <CommentForm itemId={id} />
            <ul className="flex flex-col gap-2 text-sm">
              {(comments ?? []).map((c) => (
                <li key={c.id}>
                  <p className="text-[12px] text-subtle">
                    {(c.author as { full_name?: string } | null)?.full_name ?? '—'} · {formatShortDateTime(c.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          </Card>

          {(jobs ?? []).length ? (
            <Card className="flex flex-col gap-2 text-sm">
              <SectionTitle>Ishlar</SectionTitle>
              {(jobs ?? []).map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {j.kind} · {j.status} · {formatShortDateTime(j.updated_at)}
                    {j.error && j.status !== 'done' ? <span className="block text-[12px] text-danger">{j.error}</span> : null}
                  </span>
                  {j.status === 'failed' ? <ActionButton act={{ kind: 'retry', jobId: j.id }}>Qayta urinish</ActionButton> : j.status === 'queued' ? <ActionButton act={{ kind: 'cancel', jobId: j.id }} variant="ghost">Bekor</ActionButton> : null}
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      </div>

      {['exported', 'published_manual', 'export_ready'].includes(item.status) ? (
        <Card className="flex flex-col gap-3">
          <SectionTitle>Natijalar (Instagram’dan tasdiqlangan raqamlar)</SectionTitle>
          <MetricsForm itemId={id} />
          {(metrics ?? []).length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-[12px] text-muted">
                <tr>
                  <th>Kiritilgan</th>
                  <th>Qamrov</th>
                  <th>Ko‘rish</th>
                  <th>Layk</th>
                  <th>Izoh</th>
                  <th>Ulashish</th>
                  <th>Saqlash</th>
                  <th>So‘rov</th>
                  <th>Manba</th>
                </tr>
              </thead>
              <tbody>
                {(metrics ?? []).map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-1">{formatShortDateTime(m.created_at)}</td>
                    <td>{m.reach ?? '—'}</td>
                    <td>{m.views ?? '—'}</td>
                    <td>{m.likes ?? '—'}</td>
                    <td>{m.comments ?? '—'}</td>
                    <td>{m.shares ?? '—'}</td>
                    <td>{m.saves ?? '—'}</td>
                    <td>{m.leads ?? '—'}</td>
                    <td>{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
