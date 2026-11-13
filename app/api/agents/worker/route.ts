import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { runAgentsWorker } from '@/lib/agents/worker';
import { createAdminClient } from '@/lib/supabase/admin';

// Rejalashtiruvchi eshigi: pg_cron (private.request_agents_worker) ish bo'lganda chaqiradi, bir martalik token bilan
// (hash'i bazada bir lahza oldin saqlangan). Tokensiz, ishlatilgan yoki muddati o'tgan token bilan — hech narsa ishlamaydi.
export const dynamic = 'force-dynamic';
// A generation step (plan, package, images, composition) can take minutes; the worker stops new work in time.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-agents-worker') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse(null, { status: 401 });
  const hash = createHash('sha256').update(token).digest('hex');
  const { data: valid } = await createAdminClient().rpc('agent_consume_worker_token', { p_hash: hash });
  if (valid !== true) return new NextResponse(null, { status: 401 });
  try {
    const report = await runAgentsWorker();
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('agents worker failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ ok: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
