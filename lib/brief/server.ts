import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

import { aiAnalysis, aiClassify, aiFollowup, aiGaps } from './ai';
import { parseStoredQuestion } from './bank-schema';
import {
  answerLabels,
  builtinBank,
  effectiveAnswers,
  industryOfAnswers,
  interpolate,
  mergeBank,
  nextQuestion,
  optionsFor,
  previousKey,
  prune,
  validateAnswer,
  type EngineCtx,
} from './engine';
import { checkAiQuestion, type Decision } from './guard';
import { classifyText, industryOf } from './industries';
import { aiReady } from './openai';
import { answersDigest, buildFacts, type AnswerRecord, type Snapshot } from './report';
import { STAGE_LABEL, STAGES, toPublic, type AnswerValue, type Answers, type Option, type PublicQuestion, type Question, type Stage } from './types';

/**
 * The interview on the server. The client's page never sees question metadata, other sessions or the analysis: it
 * gets one screen at a time, built here from the stored answers. Every write goes through the revision-checked
 * database functions; the AI only ever adds validated suggestions beside the deterministic flow.
 */

export const TOKEN_COOKIE = 'sm_brief';
export const TOKEN_TTL_HOURS = 12;
export const AI_CALLS_PER_SESSION = 8;

export const newToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
};
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type Db = ReturnType<typeof createAdminClient>;

// ------------------------------------------------------------------------------------------------ the bank

/** Built-in library + the newest valid version of every manager edit. */
export async function loadBank(db: Db): Promise<Question[]> {
  const { data } = await db.from('brief_question_versions').select('key, version, definition, active').order('version', { ascending: false }).limit(2000);
  const edits = (data ?? []).map((r) => parseStoredQuestion(r.definition, r.version, r.active)).filter((q): q is Question => q !== null);
  return mergeBank(builtinBank(), edits);
}

// ------------------------------------------------------------------------------------------------ session state

type SessionRow = {
  id: string;
  status: string;
  revision: number;
  answer_order: string[];
  current_key: string | null;
  classification: Json | null;
  company_hint: string | null;
  industry: string | null;
  sub_industry: string | null;
  prospect_id: string | null;
};
type AnswerRow = { question_key: string; value: Json; question: Json; stage: string; source: string };

export type Loaded = { session: SessionRow; answers: AnswerRow[]; ai: Question[]; bank: Question[]; ctx: EngineCtx };

export async function loadState(db: Db, sessionId: string): Promise<Loaded | null> {
  const [{ data: session }, { data: answers }, { data: sugg }, bank] = await Promise.all([
    db
      .from('brief_sessions')
      .select('id, status, revision, answer_order, current_key, classification, company_hint, industry, sub_industry, prospect_id')
      .eq('id', sessionId)
      .maybeSingle(),
    db.from('brief_answers').select('question_key, value, question, stage, source').eq('session_id', sessionId),
    db.from('brief_ai_suggestions').select('question, status').eq('session_id', sessionId).in('status', ['pending', 'asked']),
    loadBank(db),
  ]);
  if (!session) return null;
  const ai = (sugg ?? []).map((s) => s.question as unknown as Question).filter((q) => q && typeof q === 'object' && typeof q.key === 'string');
  const values: Answers = {};
  for (const a of answers ?? []) values[a.question_key] = a.value as AnswerValue;
  const cls = session.classification as { industry?: string; sub?: string | null } | null;
  const ctx: EngineCtx = {
    bank,
    answers: values,
    order: (session.answer_order ?? []).filter((k) => values[k]),
    classified: cls?.industry ? { industry: cls.industry, sub: cls.sub ?? null } : null,
    ai,
    known: session.company_hint ? ['company'] : [],
  };
  return { session, answers: answers ?? [], ai, bank, ctx };
}

// ------------------------------------------------------------------------------------------------ the client's screen

export type ClientView =
  | { screen: 'closed'; reason: 'invalid' | 'expired' | 'rate' }
  | { screen: 'welcome'; revision: number }
  | {
      screen: 'question';
      revision: number;
      question: PublicQuestion & { text: string };
      value: AnswerValue | null;
      progress: { percent: number; stage: string; stageIndex: number; stages: number };
      canBack: boolean;
      notice?: string;
    }
  | { screen: 'review'; revision: number; answered: number; canBack: boolean; notice?: string }
  | { screen: 'done' };

const findQuestion = (l: Loaded, key: string) => l.bank.find((q) => q.key === key) ?? l.ai.find((q) => q.key === key) ?? null;

/** What the client sees now: the question they went back to, else the engine's next one, else the review screen. */
export function viewOf(l: Loaded, notice?: string): ClientView {
  const { session, ctx } = l;
  if (session.status === 'completed') return { screen: 'done' };
  if (session.status === 'ready') return { screen: 'welcome', revision: session.revision };
  const eff = effectiveAnswers(ctx.bank, ctx.answers);
  const { industry } = industryOfAnswers(ctx.answers, ctx.classified);
  const next = nextQuestion(ctx);
  const percent = (answered: number, estimate: number) => Math.max(2, Math.min(98, Math.round((answered / Math.max(estimate, answered + 1)) * 100)));

  if (session.current_key && ctx.answers[session.current_key]) {
    const q = findQuestion(l, session.current_key);
    const stored = l.answers.find((a) => a.question_key === session.current_key);
    if (q) {
      const options = optionsFor(q, ctx.bank, eff, industry);
      const shown = (stored?.question as { options?: Option[] } | undefined)?.options;
      const opts = options.length ? options : (shown ?? []);
      const idx = ctx.order.indexOf(q.key);
      return {
        screen: 'question',
        revision: session.revision,
        question: { ...toPublic(q, opts), text: (stored?.question as { text?: string } | undefined)?.text ?? interpolate(q.text, ctx.bank, eff, industry) },
        value: ctx.answers[q.key],
        progress: { percent: percent(idx, next.progress.estimate), stage: STAGE_LABEL[q.stage], stageIndex: STAGES.indexOf(q.stage), stages: STAGES.length },
        canBack: idx > 0,
        notice,
      };
    }
  }
  if (next.done) return { screen: 'review', revision: session.revision, answered: ctx.order.length, canBack: ctx.order.length > 0, notice };
  return {
    screen: 'question',
    revision: session.revision,
    question: { ...toPublic(next.question, next.options), text: next.text },
    value: null,
    progress: { percent: percent(next.progress.answered, next.progress.estimate), stage: STAGE_LABEL[next.stage], stageIndex: next.progress.stageIndex, stages: STAGES.length },
    canBack: ctx.order.length > 0,
    notice,
  };
}

// ------------------------------------------------------------------------------------------------ answering

export type AnswerOutcome = { view: ClientView; followup?: { trigger: string }; gaps?: boolean };

/** Saves one answer to the question on screen (and only that one). Returns the next screen. */
export async function answer(db: Db, sessionId: string, input: { key: string; value: unknown; revision: number }): Promise<AnswerOutcome> {
  const l = await loadState(db, sessionId);
  if (!l) return { view: { screen: 'closed', reason: 'invalid' } };
  const shown = viewOf(l);
  if (shown.screen !== 'question' || shown.question.key !== input.key) return { view: viewOf(l, 'Sahifa yangilandi — savol qayta ko‘rsatilmoqda.') };
  if (input.revision !== l.session.revision) return { view: shown };

  const q = findQuestion(l, input.key)!;
  const eff = effectiveAnswers(l.ctx.bank, l.ctx.answers);
  const { industry } = industryOfAnswers(l.ctx.answers, l.ctx.classified);
  const options = shown.question.options.length ? optionsFor(q, l.ctx.bank, eff, industry) : [];
  const usable = options.length ? options : shown.question.options;
  const checked = validateAnswer(q, usable, input.value);
  if (!checked.ok) return { view: { ...shown, notice: checked.error } };

  const answers: Answers = { ...l.ctx.answers, [q.key]: checked.value };
  const order = l.ctx.order.includes(q.key) ? l.ctx.order : [...l.ctx.order, q.key];

  // Classification of the client's own words (keywords first; the AI only when they are not clear).
  let classified = l.ctx.classified ?? null;
  let classification: Record<string, unknown> | null = null;
  if (q.key === 'id.industry_text' && checked.value.text) {
    const kw = classifyText(checked.value.text);
    classification = { industry: kw.industry, sub: kw.sub, confidence: kw.confidence, source: 'keywords', matched: kw.matched };
    if (kw.confidence < 0.6 && aiReady() && (await reserveAi(db, sessionId))) {
      const r = await aiClassify(checked.value.text);
      if (r.ok && r.data.confidence >= 0.5) classification = { industry: r.data.industry, sub: r.data.sub, confidence: r.data.confidence, source: 'ai', reason: r.data.reason, model: r.model };
      await recordUsage(db, sessionId, r);
    }
    classified = { industry: String(classification.industry), sub: (classification.sub as string | null) ?? null };
  }
  if (q.key === 'id.industry' && checked.value.choice?.[0] !== 'other') {
    classified = null;
    classification = { industry: checked.value.choice?.[0] ?? null, sub: null, confidence: 1, source: 'choice' };
  }

  const pruned = prune({ ...l.ctx, answers, order, classified });
  const snapshot: Snapshot & { provenance?: unknown } = {
    text: shown.question.text,
    type: q.type,
    stage: q.stage,
    category: q.category,
    purpose: q.purpose,
    options: usable,
    unit: q.unit,
    source: q.source ?? 'curated',
    ...(q.provenance ? { provenance: q.provenance } : {}),
  };
  const { data: saved } = await db.rpc('brief_save_answer', {
    p_session: sessionId,
    p_revision: l.session.revision,
    p_key: q.key,
    p_answer: { question: snapshot, value: checked.value, stage: q.stage, source: q.source ?? 'curated', version: q.version } as unknown as Json,
    p_order: pruned.order,
    p_current: null,
    p_drop: pruned.dropped,
  });
  const res = (saved ?? {}) as { ok?: boolean; code?: string };
  if (!res.ok) {
    const fresh = await loadState(db, sessionId);
    return { view: fresh ? viewOf(fresh, res.code === 'conflict' ? 'Javoblar boshqa oynada yangilandi.' : undefined) : { screen: 'closed', reason: 'invalid' } };
  }

  const { industry: ind, sub } = industryOfAnswers(pruned.answers, classified);
  if (classification || q.key === 'id.sub' || q.key === 'id.industry') {
    await db
      .from('brief_sessions')
      .update({ ...(classification ? { classification: classification as Json } : {}), industry: ind, sub_industry: sub })
      .eq('id', sessionId);
  }
  if (q.source === 'ai') await db.from('brief_ai_suggestions').update({ status: 'asked' }).eq('session_id', sessionId).eq('status', 'pending').contains('question', { key: q.key });

  const fresh = await loadState(db, sessionId);
  if (!fresh) return { view: { screen: 'closed', reason: 'invalid' } };
  const view = viewOf(fresh);
  const text = `${checked.value.other ?? ''} ${checked.value.text ?? ''}`.trim();
  const followup = aiReady() && q.source !== 'ai' && text.length >= 20 && (q.aiAdaptable || q.allowOther) && ['identity', 'industry', 'marketing'].includes(q.stage);
  const nextStage = view.screen === 'question' ? STAGES[view.progress.stageIndex] : 'wrapup';
  const gaps = aiReady() && !!ind && STAGES.indexOf(nextStage as Stage) >= STAGES.indexOf('marketing') && q.stage === 'industry';
  return { view, followup: followup ? { trigger: q.key } : undefined, gaps };
}

/** Back: shows the previous answered question with its answer (nothing is deleted). */
export async function goBack(db: Db, sessionId: string, revision: number): Promise<ClientView> {
  const l = await loadState(db, sessionId);
  if (!l) return { screen: 'closed', reason: 'invalid' };
  if (revision !== l.session.revision) return viewOf(l);
  const shown = viewOf(l);
  const current = shown.screen === 'question' && l.ctx.answers[shown.question.key] ? shown.question.key : null;
  const prev = previousKey(l.ctx.order, current);
  if (!prev) return shown;
  await db.rpc('brief_set_current', { p_session: sessionId, p_revision: revision, p_current: prev });
  const fresh = await loadState(db, sessionId);
  return fresh ? viewOf(fresh) : { screen: 'closed', reason: 'invalid' };
}

/** Forward without changing an answer the client went back to. */
export async function goForward(db: Db, sessionId: string, revision: number): Promise<ClientView> {
  const l = await loadState(db, sessionId);
  if (!l) return { screen: 'closed', reason: 'invalid' };
  if (revision !== l.session.revision || !l.session.current_key) return viewOf(l);
  const i = l.ctx.order.indexOf(l.session.current_key);
  const next = i >= 0 && i < l.ctx.order.length - 1 ? l.ctx.order[i + 1] : null;
  await db.rpc('brief_set_current', { p_session: sessionId, p_revision: revision, p_current: next });
  const fresh = await loadState(db, sessionId);
  return fresh ? viewOf(fresh) : { screen: 'closed', reason: 'invalid' };
}

// ------------------------------------------------------------------------------------------------ AI around the flow

async function reserveAi(db: Db, sessionId: string): Promise<boolean> {
  const { data } = await db.rpc('brief_ai_reserve', { p_session: sessionId, p_limit: AI_CALLS_PER_SESSION });
  return data === true;
}

async function recordUsage(db: Db, sessionId: string, r: { usage?: { input: number; output: number; costUsd: number | null } }) {
  if (!r.usage) return;
  await db.rpc('brief_ai_usage', { p_session: sessionId, p_input: r.usage.input, p_output: r.usage.output, p_cost: r.usage.costUsd ?? undefined });
}

/** Texts the AI must not duplicate: everything asked, and everything still eligible later. */
function plannedTexts(l: Loaded): { asked: string[]; upcoming: string[] } {
  const asked = l.answers.map((a) => (a.question as { text?: string }).text ?? '').filter(Boolean);
  const { industry } = industryOfAnswers(l.ctx.answers, l.ctx.classified);
  const upcoming = l.bank
    .filter((q) => !l.ctx.answers[q.key] && (q.industries.includes('*') || (!!industry && q.industries.includes(industry))) && q.source !== 'rule')
    .map((q) => q.text);
  return { asked, upcoming };
}

const recordsOf = (answers: AnswerRow[], order: string[]): AnswerRecord[] =>
  order
    .map((k) => answers.find((a) => a.question_key === k))
    .filter((a): a is AnswerRow => !!a)
    .map((a) => ({ key: a.question_key, question: a.question as unknown as Snapshot, value: a.value as AnswerValue }));

async function storeSuggestion(db: Db, sessionId: string, trigger: string, kind: 'followup' | 'gaps', decisions: Decision[], model: string | null, l: Loaded) {
  const { asked, upcoming } = plannedTexts(l);
  const websiteOpen = ['new', 'update'].includes(effectiveAnswers(l.ctx.bank, l.ctx.answers)['web.need']?.choice?.[0] ?? '');
  let i = 0;
  for (const d of decisions) {
    const serial = Number.parseInt(randomBytes(3).toString('hex'), 16);
    const check = checkAiQuestion(d, { existing: [...asked, ...upcoming], answeredKeys: Object.keys(l.ctx.answers), websiteOpen, serial });
    const row = {
      session_id: sessionId,
      trigger_key: i === 0 ? trigger : `${trigger}#${i}`,
      kind,
      status: check.ok ? 'pending' : d.action === 'CONTINUE' ? 'none' : 'rejected',
      question: check.ok ? ({ ...check.question, provenance: { ...check.question.provenance!, model: model ?? undefined } } as unknown as Json) : null,
      decision: d as unknown as Json,
      reject_reason: check.ok ? null : check.reason.slice(0, 500),
      model,
    };
    if (i === 0) await db.from('brief_ai_suggestions').update(row).eq('session_id', sessionId).eq('trigger_key', trigger);
    else await db.from('brief_ai_suggestions').upsert(row, { onConflict: 'session_id,trigger_key', ignoreDuplicates: true });
    if (check.ok) asked.push(check.question.text);
    i++;
  }
}

/** One follow-up decision after the client's own words (once per trigger; under the session's AI budget). */
export async function runFollowup(sessionId: string, trigger: string): Promise<void> {
  const db = createAdminClient();
  const key = `followup:${trigger}`;
  const { error } = await db.from('brief_ai_suggestions').insert({ session_id: sessionId, trigger_key: key, kind: 'followup', status: 'none' });
  if (error || !(await reserveAi(db, sessionId))) return;
  const l = await loadState(db, sessionId);
  if (!l || l.session.status !== 'active') return;
  const { industry } = industryOfAnswers(l.ctx.answers, l.ctx.classified);
  const r = await aiFollowup({ industry: industryOf(industry)?.label ?? 'noma’lum', digest: answersDigest(recordsOf(l.answers, l.ctx.order)), upcoming: plannedTexts(l).upcoming.slice(0, 25), trigger });
  await recordUsage(db, sessionId, r);
  if (!r.ok) {
    await db.from('brief_ai_suggestions').update({ status: 'rejected', reject_reason: `AI: ${r.kind}` }).eq('session_id', sessionId).eq('trigger_key', key);
    return;
  }
  await storeSuggestion(db, sessionId, key, 'followup', [r.data], r.model, l);
}

/** Once, after the industry part: what decision-relevant information is still missing (≤ 2 questions). */
export async function runGaps(sessionId: string): Promise<void> {
  const db = createAdminClient();
  const key = 'gaps:discovery';
  const { error } = await db.from('brief_ai_suggestions').insert({ session_id: sessionId, trigger_key: key, kind: 'gaps', status: 'none' });
  if (error || !(await reserveAi(db, sessionId))) return;
  const l = await loadState(db, sessionId);
  if (!l || l.session.status !== 'active') return;
  const { industry } = industryOfAnswers(l.ctx.answers, l.ctx.classified);
  const r = await aiGaps({ industry: industryOf(industry)?.label ?? 'noma’lum', digest: answersDigest(recordsOf(l.answers, l.ctx.order)), upcoming: plannedTexts(l).upcoming.slice(0, 30) });
  await recordUsage(db, sessionId, r);
  if (!r.ok) {
    await db.from('brief_ai_suggestions').update({ status: 'rejected', reject_reason: `AI: ${r.kind}` }).eq('session_id', sessionId).eq('trigger_key', key);
    return;
  }
  if (!r.data.length) return;
  await storeSuggestion(db, sessionId, key, 'gaps', r.data, r.model, l);
}

// ------------------------------------------------------------------------------------------------ completion and report

/**
 * Builds report `version`: the answers-only facts always; the AI analysis when it is available. A failed AI call
 * leaves a complete answers-only report marked for a later retry — the answers are never at risk.
 */
export async function runReport(sessionId: string, version: number): Promise<void> {
  const db = createAdminClient();
  const l = await loadState(db, sessionId);
  if (!l) return;
  const records = recordsOf(l.answers, l.ctx.order.length ? l.ctx.order : l.answers.map((a) => a.question_key));
  const { industry, sub } = industryOfAnswers(l.ctx.answers, l.ctx.classified);
  const facts = buildFacts(records, { industry, sub, company: l.session.company_hint });

  // The client (company) record in "Mijoz tahlili": reuse the session's, else create one from the answers.
  if (!l.session.prospect_id) {
    const name = (facts.profile.company ?? '').slice(0, 120) || 'Nomsiz mijoz';
    const { data: p } = await db.from('prospects').insert({ name, company: facts.profile.company?.slice(0, 160) ?? null, status: 'analyzed' }).select('id').single();
    if (p) await db.from('brief_sessions').update({ prospect_id: p.id }).eq('id', sessionId);
  }

  if (!aiReady()) {
    await db.from('brief_reports').update({ facts: facts as unknown as Json, status: 'no_ai', error: null }).eq('session_id', sessionId).eq('version', version);
    return;
  }
  await db.from('brief_reports').update({ facts: facts as unknown as Json, status: 'pending' }).eq('session_id', sessionId).eq('version', version);
  const r = await aiAnalysis({ digest: answersDigest(records, 12000), facts, answerKeys: records.map((x) => x.key) });
  await recordUsage(db, sessionId, r);
  if (!r.ok) {
    await db.from('brief_reports').update({ status: 'failed', error: r.message.slice(0, 500) }).eq('session_id', sessionId).eq('version', version);
    return;
  }
  await db
    .from('brief_reports')
    .update({ status: 'ready', analysis: r.data as unknown as Json, model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output, cost_usd: r.usage.costUsd, error: null })
    .eq('session_id', sessionId)
    .eq('version', version);
}

/** The manager's readable list of answers (labels, as shown to the client). */
export function readableAnswers(answers: AnswerRow[], order: string[]) {
  return recordsOf(answers, order.length ? order : answers.map((a) => a.question_key)).map((r) => ({
    key: r.key,
    stage: r.question.stage,
    category: r.question.category,
    question: r.question.text,
    purpose: r.question.purpose ?? null,
    source: r.question.source ?? 'curated',
    labels: answerLabels(r.question, r.question.options, r.value),
    unknown: !!r.value.unknown,
  }));
}
