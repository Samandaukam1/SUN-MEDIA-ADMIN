'use server';

import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { answer, goBack, goForward, hashToken, loadState, runFollowup, runGaps, runReport, TOKEN_COOKIE, viewOf, type ClientView } from '@/lib/brief/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The client's side of the interview (/suhbat). It never uses the staff session: the only key is the httpOnly
 * cookie with this session's token, checked (and rate-limited) in the database on every call. It returns one screen
 * at a time — never other answers, other sessions, question metadata or the analysis.
 */

type Opened = { ok: true; id: string } | { ok: false; view: ClientView };

async function opened(): Promise<Opened> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value ?? '';
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { ok: false, view: { screen: 'closed', reason: 'invalid' } };
  const { data, error } = await createAdminClient().rpc('brief_client_open', { p_hash: hashToken(token) });
  const r = (data ?? {}) as { ok?: boolean; code?: string; id?: string };
  if (error || !r.ok || !r.id) {
    const reason = r.code === 'rate' ? 'rate' : r.code === 'expired' ? 'expired' : 'invalid';
    return { ok: false, view: { screen: 'closed', reason } };
  }
  return { ok: true, id: r.id };
}

const revision = z.number().int().min(0).max(1_000_000);

export async function interviewView(): Promise<ClientView> {
  const s = await opened();
  if (!s.ok) return s.view;
  const l = await loadState(createAdminClient(), s.id);
  return l ? viewOf(l) : { screen: 'closed', reason: 'invalid' };
}

/** "Boshlash": the client has read the short privacy note and starts. */
export async function interviewBegin(): Promise<ClientView> {
  const s = await opened();
  if (!s.ok) return s.view;
  const db = createAdminClient();
  await db.rpc('brief_client_begin', { p_session: s.id });
  const l = await loadState(db, s.id);
  return l ? viewOf(l) : { screen: 'closed', reason: 'invalid' };
}

const answerInput = z.object({ key: z.string().min(3).max(80), revision, value: z.unknown() });

export async function interviewAnswer(raw: unknown): Promise<ClientView> {
  const parsed = answerInput.safeParse(raw);
  if (!parsed.success || JSON.stringify(parsed.data.value ?? null).length > 6000) return interviewView();
  const s = await opened();
  if (!s.ok) return s.view;
  const out = await answer(createAdminClient(), s.id, parsed.data);
  // The AI works after the reply: the next screen is never kept waiting for it.
  if (out.followup) after(() => runFollowup(s.id, out.followup!.trigger).catch(() => undefined));
  if (out.gaps) after(() => runGaps(s.id).catch(() => undefined));
  return out.view;
}

export async function interviewBack(rev: unknown): Promise<ClientView> {
  const r = revision.safeParse(rev);
  const s = await opened();
  if (!s.ok) return s.view;
  if (!r.success) return interviewView();
  return goBack(createAdminClient(), s.id, r.data);
}

export async function interviewForward(rev: unknown): Promise<ClientView> {
  const r = revision.safeParse(rev);
  const s = await opened();
  if (!s.ok) return s.view;
  if (!r.success) return interviewView();
  return goForward(createAdminClient(), s.id, r.data);
}

/** Submission (once). The token stops working; the client sees only the thank-you screen. */
export async function interviewFinish(rev: unknown): Promise<ClientView> {
  const r = revision.safeParse(rev);
  const s = await opened();
  if (!s.ok) return s.view;
  const db = createAdminClient();
  const l = await loadState(db, s.id);
  if (!l || !r.success) return { screen: 'closed', reason: 'invalid' };
  const view = viewOf(l);
  if (view.screen !== 'review') return view;
  const { data } = await db.rpc('brief_complete', { p_session: s.id, p_revision: r.data });
  if (data === 'conflict') {
    const fresh = await loadState(db, s.id);
    return fresh ? viewOf(fresh) : { screen: 'closed', reason: 'invalid' };
  }
  if (data !== 'ok' && data !== 'done') return { screen: 'closed', reason: 'invalid' };
  (await cookies()).delete({ name: TOKEN_COOKIE, path: '/suhbat' });
  if (data === 'ok') after(() => runReport(s.id, 1).catch(() => undefined));
  return { screen: 'done' };
}
