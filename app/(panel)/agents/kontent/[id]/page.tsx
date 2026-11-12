import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ActionButton, FixForm, RejectButton, RescheduleForm } from '@/components/agents/controls';
import { EditItemForm } from '@/components/agents/forms';
import { StatusBadge } from '@/components/agents/ItemCards';
import { PageHeader } from '@/components/panel/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { Notice } from '@/components/ui/Notice';
import { isEditable, KIND_LABEL, type Frame } from '@/lib/agents/core';
import { FORMATS } from '@/lib/agents/creative';
import { readiness } from '@/lib/agents/publisher';
import { db, isApproved, signed } from '@/lib/agents/server';
import { agencyDateKey, formatShortDateTime, formatTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Agents · Material' };
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Qa = { passed?: boolean; issues?: { code: string; level: 'fail' | 'warn'; msg: string }[]; retried?: boolean };
type IdeaJson = { title?: string; format?: string; hook?: string; angle?: string; why_now?: string; provider?: string; model?: string; candidates?: { title: string; format: string; score: number; similar: number }[] };

export default async function AgentItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: item } = await db().from('agent_items').select('*').eq('id', id).maybeSingle();
  if (!item) notFound();
  const { data: p } = await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle();
  if (!p) notFound();
  const [{ data: versions }, { data: approvals }, { data: attempts }, { data: insights }] = await Promise.all([
    db().from('agent_versions').select('*').eq('item_id', id).order('version_no', { ascending: false }),
    db().from('agent_approvals').select('decision, scope, comment, channel, created_at, version_id').eq('item_id', id).order('created_at', { ascending: false }),
    db().from('agent_publish_attempts').select('frame_index, status, media_id, error, attempts, updated_at').eq('item_id', id).order('frame_index'),
    db().from('agent_insights').select('metrics, fetched_at, media_id').eq('item_id', id).order('fetched_at', { ascending: false }),
  ]);
  const v = (versions ?? []).find((x) => x.id === item.current_version_id) ?? null;
  const frames = (v?.frames as unknown as Frame[]) ?? [];
  const urls = await signed(frames.map((f) => f.path), 7200);
  const qa = (v?.qa ?? {}) as Qa;
  const idea = (v?.idea ?? {}) as IdeaJson;
  const approved = await isApproved(item, p);
  const ready = await readiness(item, p);
  const editable = isEditable(item.status);
  const fmt = FORMATS.find((f) => f.key === idea.format);
  const vno = new Map((versions ?? []).map((x) => [x.id, x.version_no]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${KIND_LABEL[item.kind as 'story' | 'post']} · ${formatShortDateTime(item.scheduled_at)}`}
        crumbs={[{ label: 'Agents', href: '/agents' }, { label: p.name, href: `/agents/profillar/${p.id}` }, { label: idea.title || 'Material' }]}
        description={`${p.name}${p.instagram_username ? ` · @${p.instagram_username}` : ''}${v ? ` · v${v.version_no}` : ''}`}
        actions={<StatusBadge status={item.status} />}
      />
      {item.last_error ? <Notice tone={['failed', 'qa_failed', 'needs_reschedule', 'limit_reached'].includes(item.status) ? 'danger' : 'warning'}>{item.last_error}</Notice> : null}
      {v?.provider === 'local' ? (
        <Notice tone="warning" title="Lokal rejim">
          AI ulanmagan — bu matn brifdan oddiy shablon bilan tuzilgan. Kreativ matn uchun serverga GEMINI_API_KEY (bepul) yoki ANTHROPIC_API_KEY qo‘shing.
        </Notice>
      ) : null}

      {!v ? (
        <Card>
          <p className="text-sm text-muted">Hali tayyorlanmagan. Navbat bo‘yicha {formatShortDateTime(item.prepare_at)} dan keyin tayyorlanadi.</p>
          {editable ? (
            <div className="mt-3">
              <ActionButton act={{ kind: 'regenerate', itemId: id }} variant="primary" busy="Agentlar ishlamoqda…">
                Hozir tayyorlash
              </ActionButton>
            </div>
          ) : null}
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {frames.map((f, i) =>
                urls[f.path] ? (
                  <a key={i} href={urls[f.path]} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[f.path]} alt={`${i + 1}-kadr`} className={`${item.kind === 'story' ? 'h-[420px] w-[236px]' : 'h-[420px] w-[336px]'} rounded-xl border border-line object-cover`} />
                  </a>
                ) : null,
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              {item.status === 'pending_approval' ? (
                <ActionButton act={{ kind: 'approve', itemId: id }} variant="primary">
                  ✓ Tasdiqlash
                </ActionButton>
              ) : null}
              {['approved', 'partially_published'].includes(item.status) ? (
                <ActionButton
                  act={{ kind: 'publish', itemId: id }}
                  variant="primary"
                  confirm={ready.simulate ? 'Sinov nashri: Instagram’ga yuborilmaydi. Davom etilsinmi?' : `HAQIQIY nashr: @${p.instagram_username ?? '?'} profiliga hozir joylansinmi?`}
                  busy="Joylanmoqda…"
                >
                  {ready.simulate ? 'Sinov nashri' : 'Hozir joylash'}
                </ActionButton>
              ) : null}
              {editable ? (
                <>
                  <ActionButton act={{ kind: 'regenerate', itemId: id }} confirm="Yangi g‘oya bilan qayta yaratilsinmi? (joriy versiya tarixda qoladi)" busy="Agentlar ishlamoqda…">
                    Yangi g‘oya
                  </ActionButton>
                  <RejectButton itemId={id} />
                </>
              ) : null}
              {frames.map((f, i) =>
                urls[f.path] ? (
                  <a key={`d${i}`} href={`${urls[f.path]}&download=${encodeURIComponent(`${p.instagram_username ?? 'agent'}_${item.target_date}_${item.kind}_${i + 1}.jpg`)}`} className="inline-flex h-10 items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2">
                    ⬇ {frames.length > 1 ? `${i + 1}-kadr` : 'Rasm'}
                  </a>
                ) : null,
              )}
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {approved ? <Badge tone="success">Joriy versiya tasdiqlangan</Badge> : <Badge>Joriy versiya tasdiqlanmagan</Badge>}{' '}
              {['approved', 'partially_published'].includes(item.status) ? (ready.ok ? (ready.simulate ? 'Sinov rejimi — Instagram’ga yuborilmaydi.' : p.auto_publish ? `Avto-nashr: ${formatShortDateTime(item.scheduled_at)}.` : 'Avto-nashr o‘chiq — qo‘lda joylang.') : ready.reason) : null}
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle action={<CopyButton value={[v.caption, v.hashtags].filter(Boolean).join('\n\n')} label="Nusxa" variant="ghost" />}>{item.kind === 'post' ? 'Caption' : 'Ichki izoh'}</SectionTitle>
              <p className="text-sm whitespace-pre-wrap">{v.caption || '—'}</p>
              {v.hashtags ? <p className="mt-2 text-sm text-accent">{v.hashtags}</p> : null}
              {v.manual_notes ? (
                <div className="mt-3">
                  <Notice tone="info" title="Qo‘lda qo‘shish (API qo‘llamaydi)">
                    {v.manual_notes}
                  </Notice>
                </div>
              ) : null}
            </Card>
            <Card>
              <SectionTitle>Sifat tekshiruvi {qa.passed ? '✓' : '✕'}</SectionTitle>
              {qa.issues?.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {qa.issues.map((x, i) => (
                    <li key={i} className={`rounded-lg px-3 py-1.5 ${x.level === 'fail' ? 'bg-danger-soft' : 'bg-warning-soft'}`}>
                      {x.msg}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Muammo topilmadi.</p>
              )}
              <p className="mt-2 text-[12px] text-subtle">Tekshirildi: taqiqlar, o‘ylab topilgan raqam/kafolat, boshqa profil ma’lumoti, 30 kunlik takror, rasmdagi matn, yozuv, tuzilma.{qa.retried ? ' Kopirayter bir marta qayta yozdi.' : ''}</p>
            </Card>
            <Card>
              <SectionTitle>G‘oya</SectionTitle>
              <p className="font-semibold">{idea.title}</p>
              <p className="mt-1 text-sm text-muted">
                {fmt?.name ?? idea.format} · {idea.angle}
              </p>
              {idea.why_now ? <p className="mt-1 text-sm text-subtle">Nega bugun: {idea.why_now}</p> : null}
              <p className="mt-2 text-[12px] text-subtle">
                {idea.provider} · {idea.model}
              </p>
              {idea.candidates?.length ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-accent">Nomzod g‘oyalar va ballar ({idea.candidates.length})</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {idea.candidates.map((c, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className={i === 0 ? 'font-medium' : 'text-muted'}>
                          {c.title} <span className="text-subtle">[{c.format}]</span>
                        </span>
                        <span className="tabular shrink-0 text-subtle">{c.score}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
            {editable ? (
              <Card>
                <SectionTitle>Tuzatish so‘rash</SectionTitle>
                <FixForm itemId={id} />
              </Card>
            ) : null}
          </div>

          {editable ? (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card>
                <SectionTitle>Matnni qo‘lda tahrirlash</SectionTitle>
                <EditItemForm itemId={id} frames={frames.map(({ role, headline, body, cta }) => ({ role, headline, body, cta }))} caption={v.caption} hashtags={v.hashtags} isPost={item.kind === 'post'} />
              </Card>
              <Card>
                <SectionTitle>Qayta rejalashtirish</SectionTitle>
                <RescheduleForm itemId={id} date={item.target_date < agencyDateKey() ? agencyDateKey() : item.target_date} time={formatTime(item.scheduled_at)} />
                <p className="mt-2 text-[12px] text-subtle">Vaqt o‘zgarsa — tasdiq qayta kerak.</p>
              </Card>
            </div>
          ) : null}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Versiyalar va qarorlar</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm">
            {(versions ?? []).map((x) => (
              <li key={x.id} className="flex justify-between gap-3">
                <span>
                  v{x.version_no} · {x.provider === 'user' ? 'qo‘lda tahrir' : x.provider}
                  {x.note ? <span className="text-subtle"> — {x.note.slice(0, 80)}</span> : null}
                </span>
                <span className="shrink-0 text-subtle">{formatShortDateTime(x.created_at)}</span>
              </li>
            ))}
            {(approvals ?? []).map((a, i) => (
              <li key={`a${i}`} className="flex justify-between gap-3">
                <span>
                  <Badge tone={a.decision === 'approved' ? 'success' : a.decision === 'fix' ? 'warning' : 'danger'}>
                    {a.decision === 'approved' ? 'Tasdiq' : a.decision === 'fix' ? (a.scope === 'rule' ? 'Tuzatish (doimiy qoida)' : 'Tuzatish') : 'Rad'}
                  </Badge>{' '}
                  {a.version_id ? `v${vno.get(a.version_id) ?? '?'}` : ''} {a.channel === 'auto' ? '· avto' : ''} {a.comment ? <span className="text-subtle">— {a.comment.slice(0, 80)}</span> : null}
                </span>
                <span className="shrink-0 text-subtle">{formatShortDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle>Nashr va natijalar</SectionTitle>
          {attempts?.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {attempts.map((a) => (
                <li key={a.frame_index} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {a.frame_index + 1}-kadr · <Badge tone={a.status === 'published' ? 'success' : a.status === 'simulated' ? 'violet' : a.status === 'failed' ? 'danger' : 'warning'}>{a.status}</Badge>{' '}
                    {a.media_id ? <span className="text-subtle">{a.media_id}</span> : null}
                  </span>
                  {a.error ? <span className="text-danger">{a.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nashr urinishi yo‘q.</p>
          )}
          <div className="mt-3 text-sm">
            {insights?.length ? (
              insights.map((x, i) => (
                <p key={i} className="text-muted">
                  {formatShortDateTime(x.fetched_at)}:{' '}
                  {Object.entries(x.metrics as Record<string, unknown>)
                    .map(([k, val]) => (k === '_mavjud_emas' ? `Ma’lumot mavjud emas (${val})` : `${k} ${val}`))
                    .join(' · ')}
                </p>
              ))
            ) : (
              <p className="text-subtle">
                Natijalar: Ma’lumot mavjud emas{item.status === 'simulated' ? ' (sinov nashri)' : item.status === 'published' ? ' (Instagram 20–72 soatdan keyin beradi)' : ' (hali joylanmagan)'}.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
