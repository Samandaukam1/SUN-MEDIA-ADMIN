import { NextResponse, type NextRequest } from 'next/server';

import { completeAgentConnect } from '@/lib/agents/connect';
import { canAgents } from '@/lib/agents/server';
import { getSessionContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Instagram ruxsat oynasidan qaytish: holat bir marta, uni boshlagan xodim tomonidan ishlatiladi. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = (path: string, q: Record<string, string>) => NextResponse.redirect(new URL(`${path}?${new URLSearchParams(q)}`, url.origin), { status: 303 });
  const context = await getSessionContext();
  if (!context || context.status !== 'active' || context.kind !== 'staff' || !canAgents(context)) return back('/login', {});
  const r = await completeAgentConnect(context.userId, {
    state: url.searchParams.get('state') ?? '',
    code: url.searchParams.get('code'),
    error: url.searchParams.get('error'),
  });
  if (!r.profileId) return back('/agents/profillar', { ig: r.code });
  return back(`/agents/profillar/${r.profileId}`, {
    bolim: 'instagram',
    ig: r.code,
    ...(r.user ? { ig_user: r.user } : {}),
    ...(r.message ? { ig_msg: r.message.slice(0, 180) } : {}),
  });
}
