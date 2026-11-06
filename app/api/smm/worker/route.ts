import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { runWorker } from '@/lib/neosmm/worker';
import { createAdminClient } from '@/lib/supabase/admin';

// The scheduler's door: pg_cron (private.request_smm_worker) calls it every minute while there is work, with a
// one-time token whose hash it stored a moment before. No token, a used one or an expired one — nothing runs.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-smm-worker') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse(null, { status: 401 });
  const hash = createHash('sha256').update(token).digest('hex');
  const { data: valid } = await createAdminClient().rpc('neosmm_consume_worker_token', { p_hash: hash });
  if (valid !== true) return new NextResponse(null, { status: 401 });
  try {
    const report = await runWorker();
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('smm worker failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ ok: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
