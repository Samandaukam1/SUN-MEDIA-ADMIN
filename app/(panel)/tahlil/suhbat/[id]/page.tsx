import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { DeleteSession, SessionActions } from '@/components/brief/ManagerControls';
import { ReportView, type AnswerView, type ReportRow, type SuggestionView } from '@/components/brief/ReportView';
import { display, Eyebrow } from '@/components/prospects/ui';
import { answerLabels } from '@/lib/brief/engine';
import { industryOf, subOf } from '@/lib/brief/industries';
import type { Snapshot } from '@/lib/brief/report';
import type { AnswerValue, Stage } from '@/lib/brief/types';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijoz tahlili' };
// "Tahlilni qayta yaratish" runs the analysis after the reply.
export const maxDuration = 300;

/** One interview for managers: the report (A–I), every answer as the client saw it, the AI log and the notes. */
export default async function BriefSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: s, error }, { data: answers }, { data: reports }, { data: sugg }, { data: events }] = await Promise.all([
    supabase
      .from('brief_sessions')
      .select(
        'id, status, company_hint, contact_hint, industry, sub_industry, classification, answer_order, review_status, manager_notes, created_at, started_at, completed_at, ai_calls, ai_input_tokens, ai_output_tokens, ai_cost_usd, prospect:prospects(id, name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('brief_answers').select('question_key, question, value, stage, source, edit_count').eq('session_id', id),
    supabase.from('brief_reports').select('id, version, status, facts, analysis, model, error, correction, corrected_at, created_at').eq('session_id', id).order('version', { ascending: false }),
    supabase.from('brief_ai_suggestions').select('id, kind, status, question, decision, reject_reason, model, created_at').eq('session_id', id).order('created_at'),
    supabase.from('brief_events').select('id, kind, created_at').eq('session_id', id).order('id', { ascending: false }).limit(60),
  ]);
  if (error) throw error;
  if (!s) notFound();

  const order = s.answer_order?.length ? s.answer_order : (answers ?? []).map((a) => a.question_key);
  const rank = (k: string) => (order.indexOf(k) === -1 ? 9999 : order.indexOf(k));
  const answerViews: AnswerView[] = [...(answers ?? [])]
    .sort((x, y) => rank(x.question_key) - rank(y.question_key))
    .map((a) => {
      const q = a.question as unknown as Snapshot;
      const v = a.value as AnswerValue;
      return {
        key: a.question_key,
        stage: a.stage as Stage,
        category: q.category,
        question: q.text,
        purpose: q.purpose ?? null,
        source: a.source,
        labels: answerLabels(q, q.options ?? [], v),
        unknown: !!v.unknown,
        edits: a.edit_count,
      };
    });
  const suggestionViews: SuggestionView[] = (sugg ?? [])
    .filter((x) => x.status !== 'none' || x.reject_reason)
    .map((x) => ({
      id: x.id,
      kind: x.kind,
      status: x.status,
      text: (x.question as { text?: string } | null)?.text ?? (x.decision as { suggested_question?: string } | null)?.suggested_question ?? null,
      reason: x.reject_reason,
      purpose: (x.decision as { business_purpose?: string } | null)?.business_purpose ?? null,
      model: x.model,
      created_at: x.created_at,
    }));
  const name = s.prospect?.name ?? s.company_hint ?? 'Nomi aytilmagan';
  const ind = industryOf(s.industry);
  const sub = subOf(s.industry, s.sub_industry);
  const cls = s.classification as { source?: string; confidence?: number } | null;
  const open = s.status === 'ready' || s.status === 'active';
  const tokens = s.ai_input_tokens + s.ai_output_tokens;

  return (
    <div className="space-y-6" data-print-root>
      <Link href="/tahlil?bolim=tarix" className="inline-flex text-[13px] text-[#8e8e96] hover:text-[#d4fc18] print:hidden">
        ← Barcha tahlillar
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Mijoz tahlili · ichki hisobot</Eyebrow>
          <h1 className={`${display} mt-3 text-[30px] leading-[1.08] font-medium text-white sm:text-[40px]`}>{name}</h1>
          <p className="mt-2 text-[14px] text-[#a8a8ac]">
            {[ind?.label, sub?.label].filter(Boolean).join(' → ') || 'Soha aniqlanmagan'}
            {cls?.source === 'ai' || cls?.source === 'keywords' ? ` · tasnif: ${cls.source === 'ai' ? 'AI' : 'kalit so‘zlar'} (${Math.round((cls.confidence ?? 0) * 100)}%)` : ''}
          </p>
          <p className="mt-1 text-[12.5px] text-[#6e6e76]">
            Yaratilgan {formatShortDateTime(s.created_at)}
            {s.completed_at ? ` · yakunlangan ${formatShortDateTime(s.completed_at)}` : ''}
            {s.contact_hint ? ` · aloqa: ${s.contact_hint}` : ''}
            {s.ai_calls ? ` · AI: ${s.ai_calls} so‘rov, ${tokens} token${s.ai_cost_usd !== null ? `, ~$${Number(s.ai_cost_usd).toFixed(4)}` : ''}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {s.prospect ? (
            <Link href={`/tahlil/${s.prospect.id}`} className="h-10 rounded-full border border-white/12 px-4 text-[13px] leading-10 text-[#d9d9de] hover:border-[#d4fc18]/50">
              Mijoz kartasi (Instagram tahlili)
            </Link>
          ) : null}
          {!open ? <DeleteSession id={s.id} /> : null}
        </div>
      </div>
      {open ? (
        <div className="print:hidden">
          <SessionActions id={s.id} />
        </div>
      ) : null}
      <ReportView
        sessionId={s.id}
        completed={s.status === 'completed'}
        reviewStatus={s.review_status}
        notes={s.manager_notes ?? ''}
        reports={(reports ?? []) as unknown as ReportRow[]}
        answers={answerViews}
        suggestions={suggestionViews}
        events={events ?? []}
      />
    </div>
  );
}
